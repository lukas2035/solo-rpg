import fs from 'node:fs/promises'
import path from 'node:path'
import matter from 'gray-matter'
import {
  fullName,
  isValidGameName,
  isRemoteImage,
  type Character,
  type CharacterInput,
  type Faction,
  type FactionInput,
  type FactionRelation,
  type GameDetail,
  type GameMeta,
  type GameSession,
  type GameSessionInput,
  type GameSettings,
  type GameSetup,
  type LocationInput,
  type LoreEntry,
  type LoreInput,
  type Narrator,
  type NarratorInput,
  type Quest,
  type QuestInput,
  type QuestObjective,
  type SceneInput,
  type SceneMeta,
  type StoryEntry,
  type StoryLocation,
  type StoryThread,
  type ThreadClock,
  type ThreadInput,
  FactionStanceSchema,
  FactionStatusSchema,
  FactionTypeSchema,
  LocationStatusSchema,
  LocationTypeSchema,
  LoreKnowledgeSchema,
  LoreTruthSchema,
  LoreTypeSchema,
  ObjectiveStatusSchema,
  QuestStatusSchema,
  QuestTypeSchema,
  ThreadCertaintySchema,
  ThreadHorizonSchema,
  ThreadStatusSchema,
  ThreadTypeSchema,
} from '@solo-rpg/shared'
import {
  ConflictError,
  NotFoundError,
  ValidationError,
  type AssetInput,
  type StorageProvider,
} from './StorageProvider.js'
import {
  assertInside,
  ensureDir,
  exists,
  imageExtension,
  listFiles,
  readTextIfExists,
  removeIfExists,
  safeFileName,
  writeFileAtomic,
} from './fsUtils.js'
import { parseEntries, renameSpeaker, serializeEntries } from './sceneMarkdown.js'
import { parseSessions, serializeSessions, sessionId } from './sessionsMarkdown.js'

const GAME_FILE = 'game.md'
const SESSIONS_FILE = 'sessions.md'
const CHARACTER_DIR = 'characters'
/** Původní název složky postav – při čtení se automaticky přejmenuje na `characters` */
const LEGACY_CHARACTER_DIR = 'npcs'
const PORTRAIT_DIR = 'portraits'
const NARRATOR_DIR = 'narrators'
/** Portréty vypravěčů odděleně od postav, aby se stejná jména nepřepisovala */
const NARRATOR_PORTRAIT_DIR = `${PORTRAIT_DIR}/narrators`
const BACKGROUND_DIR = 'backgrounds'
const SCENE_DIR = 'scenes'
const THREAD_DIR = 'threads'
const FACTION_DIR = 'factions'
/** Emblémy frakcí odděleně od portrétů postav */
const FACTION_EMBLEM_DIR = `${PORTRAIT_DIR}/factions`
const QUEST_DIR = 'quests'
const LOCATION_DIR = 'locations'
/** Obrázky lokací odděleně od portrétů postav */
const LOCATION_IMAGE_DIR = `${PORTRAIT_DIR}/locations`
const LORE_DIR = 'lore'
/** Odděluje markdown popis scény (před) od záznamů příběhu (za) */
const ENTRIES_MARKER = /<!--\s*entries\s*-->/
/** Odděluje popis scény (před) od jejího shrnutí děje (za); leží před `<!-- entries -->` */
const SUMMARY_MARKER = /<!--\s*summary\s*-->/
/** Odděluje veřejný popis frakce (před) od jejích tajemství (za) */
const SECRETS_MARKER = /<!--\s*secrets\s*-->/
/** Odděluje popis vypravěče (před) od jeho doplňkového AI promptu (za) */
const AI_PROMPT_MARKER = /<!--\s*ai-prompt\s*-->/
/** Tělo questu: popis, pak `<!-- outcome -->` výsledek, pak `<!-- notes -->` poznámky (značky chybí, když je sekce prázdná) */
const OUTCOME_MARKER = /<!--\s*outcome\s*-->/
const NOTES_MARKER = /<!--\s*notes\s*-->/
/** Tělo `game.md`: volné poznámky hráče (aplikace je nemění), za značkou popis herních pravidel pod příběhem */
const RULES_MARKER = /<!--\s*rules\s*-->/

type Frontmatter = Record<string, unknown>

interface GameFile {
  data: Frontmatter
  body: string
}

interface CharacterFile {
  fileName: string
  data: Frontmatter
  body: string
  character: Character
}

interface NarratorFile {
  fileName: string
  data: Frontmatter
  body: string
  narrator: Narrator
}

interface SceneFile {
  fileName: string
  data: Frontmatter
  body: string
  /** Část těla se záznamy příběhu (za `<!-- entries -->`) */
  entriesBody: string
  meta: SceneMeta
}

interface ThreadFile {
  fileName: string
  data: Frontmatter
  thread: StoryThread
}

interface FactionFile {
  fileName: string
  data: Frontmatter
  faction: Faction
}

interface QuestFile {
  fileName: string
  data: Frontmatter
  quest: Quest
}

interface LocationFile {
  fileName: string
  data: Frontmatter
  location: StoryLocation
}

interface LoreFile {
  fileName: string
  data: Frontmatter
  lore: LoreEntry
}

function toTimestamp(value: unknown, fallback: number): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (value instanceof Date) return value.getTime()
  if (typeof value === 'string') {
    const parsed = Date.parse(value)
    if (Number.isFinite(parsed)) return parsed
  }
  return fallback
}

function toIso(ts: number): string {
  return new Date(ts).toISOString()
}

function stringOrNull(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

/** Rozdělí staré jednoduché `name` na křestní jméno a příjmení (poslední slovo). */
function splitName(name: string): { firstName: string; lastName: string } {
  const parts = name.trim().split(/\s+/)
  if (parts.length < 2) return { firstName: name.trim(), lastName: '' }
  return { firstName: parts.slice(0, -1).join(' '), lastName: parts[parts.length - 1] }
}

/** Klíč pro porovnání jmen postav (souborový systém Windows nerozlišuje velikost písmen). */
function nameKey(name: string): string {
  return safeFileName(name).toLocaleLowerCase('cs')
}

/**
 * Tělo scény = markdown popis + volitelně `<!-- summary -->` shrnutí + `<!-- entries -->` + záznamy.
 * Bez značky entries je celé tělo záznamy (starý formát).
 */
function splitSceneBody(body: string): { description: string; summary: string; entries: string } {
  const match = body.match(ENTRIES_MARKER)
  if (!match || match.index === undefined) return { description: '', summary: '', entries: body }
  const { description, summary } = splitByMarker(body.slice(0, match.index), SUMMARY_MARKER, 'summary')
  return { description, summary, entries: body.slice(match.index + match[0].length) }
}

function joinSceneBody(description: string, summary: string, entriesMd: string): string {
  const parts: string[] = []
  if (description.trim()) parts.push(description.trimEnd())
  if (summary.trim()) parts.push(`<!-- summary -->\n\n${summary.trimEnd()}`)
  const head = parts.length ? `\n${parts.join('\n\n')}\n\n` : '\n'
  return `${head}<!-- entries -->\n${entriesMd}`
}

/** Tělo frakce / lokace / lore = veřejný popis + volitelně `<!-- secrets -->` + tajemství */
function splitFactionBody(body: string): { description: string; secrets: string } {
  return splitByMarker(body, SECRETS_MARKER, 'secrets')
}

/** Tělo `game.md` = poznámky hráče + volitelně `<!-- rules -->` + popis pravidel */
function splitGameBody(body: string): { notes: string; rules: string } {
  const { description, rules } = splitByMarker(body, RULES_MARKER, 'rules')
  return { notes: description, rules }
}

function joinGameBody(notes: string, rules: string): string {
  const head = notes.trimEnd()
  if (!rules.trim()) return `${head}\n`
  return `${head}\n\n<!-- rules -->\n\n${rules.trimEnd()}\n`
}

/** Rozdělí tělo na část před značkou a za ní; bez značky je vše `description` */
function splitByMarker<K extends string>(body: string, marker: RegExp, key: K): { description: string } & Record<K, string> {
  const match = body.match(marker)
  const clean = (s: string) => s.replace(/^\n+/, '').trimEnd()
  if (!match || match.index === undefined) return { description: clean(body), [key]: '' } as { description: string } & Record<K, string>
  return { description: clean(body.slice(0, match.index)), [key]: clean(body.slice(match.index + match[0].length)) } as { description: string } & Record<K, string>
}

/** Tělo questu = popis + volitelně `<!-- outcome -->` výsledek + volitelně `<!-- notes -->` poznámky (v tomto pořadí) */
function splitQuestBody(body: string): { description: string; outcome: string; notes: string } {
  const clean = (s: string) => s.replace(/^\n+/, '').trimEnd()
  let rest = body
  let notes = ''
  const notesMatch = rest.match(NOTES_MARKER)
  if (notesMatch && notesMatch.index !== undefined) {
    notes = clean(rest.slice(notesMatch.index + notesMatch[0].length))
    rest = rest.slice(0, notesMatch.index)
  }
  let outcome = ''
  const outcomeMatch = rest.match(OUTCOME_MARKER)
  if (outcomeMatch && outcomeMatch.index !== undefined) {
    outcome = clean(rest.slice(outcomeMatch.index + outcomeMatch[0].length))
    rest = rest.slice(0, outcomeMatch.index)
  }
  return { description: clean(rest), outcome, notes }
}

/** Frontmatter `objectives` questu: `{ id?, title, status?, optional? }`; chybějící id (ruční zápis v Obsidianu) se doplní */
function parseObjectives(value: unknown): QuestObjective[] {
  if (!Array.isArray(value)) return []
  const objectives: QuestObjective[] = []
  value.forEach((item, index) => {
    // Prostý řetězec v seznamu = název nesplněného cíle
    const rec: Record<string, unknown> = typeof item === 'string' ? { title: item } : typeof item === 'object' && item !== null ? (item as Record<string, unknown>) : {}
    const title = stringOrNull(rec.title)
    if (!title) return
    const status = ObjectiveStatusSchema.safeParse(rec.status)
    let id = stringOrNull(rec.id) ?? `objective-${index + 1}`
    while (objectives.some(o => o.id === id)) id = `${id}-x`
    objectives.push({ id, title, status: status.success ? status.data : 'pending', optional: rec.optional === true })
  })
  return objectives
}

/** Frontmatter `relations` frakce: `{ faction: [[Název]], stance, note? }` */
function parseFactionRelations(value: unknown): FactionRelation[] {
  if (!Array.isArray(value)) return []
  const relations: FactionRelation[] = []
  for (const item of value) {
    if (typeof item !== 'object' || item === null) continue
    const rec = item as Record<string, unknown>
    const faction = parseLink(rec.faction)
    if (!faction || relations.some(r => r.faction === faction)) continue
    const stance = FactionStanceSchema.safeParse(rec.stance)
    relations.push({ faction, stance: stance.success ? stance.data : 'unknown', note: stringOrNull(rec.note) ?? '' })
  }
  return relations
}

/** Frontmatter `characters` scény: wikilinky `[[Celé jméno|alias]]` nebo prostá jména → celá jména */
function parseCharacterLinks(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  const names: string[] = []
  for (const item of value) {
    const name = parseLink(item)
    if (name && !names.includes(name)) names.push(name)
  }
  return names
}

/** Wikilink `[[Jméno|alias]]` nebo prosté jméno → jméno; null pro neplatnou hodnotu */
function parseLink(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const link = value.trim().match(/^\[\[([^\]|#]+)(?:[|#][^\]]*)?\]\]$/)
  return stringOrNull(link ? link[1] : value)
}

function toCharacterLinks(names: string[]): string[] {
  return names.map(n => `[[${n}]]`)
}

/** Nahradí (newName) nebo odebere (null) název v seznamu wikilinků */
function replaceRef(list: string[], oldName: string, newName: string | null): string[] {
  return list.flatMap(n => (n === oldName ? (newName ? [newName] : []) : [n]))
}

/** Hodiny nitě z frontmatteru; neplatný tvar = vypnuto */
function parseClock(value: unknown): ThreadClock | null {
  if (typeof value !== 'object' || value === null) return null
  const { current, max } = value as Record<string, unknown>
  if (typeof max !== 'number' || !Number.isInteger(max) || max < 1) return null
  const cur = typeof current === 'number' && Number.isInteger(current) ? current : 0
  return { current: Math.min(Math.max(cur, 0), max), max }
}

/**
 * Úložiště her ve struktuře čitelné Obsidianem:
 *
 * <vault>/<Hra>/game.md, characters/*.md, narrators/*.md, threads/*.md, factions/*.md, quests/*.md, locations/*.md, lore/*.md, portraits/, backgrounds/, scenes/*.md
 */
export class ObsidianVaultProvider implements StorageProvider {
  constructor(private readonly vaultPath: string) {}

  async init(): Promise<void> {
    await ensureDir(this.vaultPath)
  }

  // ---------- cesty ----------

  private gameDir(name: string): string {
    if (!isValidGameName(name)) throw new ValidationError(`Neplatný název hry: „${name}“`)
    const dir = path.join(this.vaultPath, name.trim())
    assertInside(this.vaultPath, dir)
    return dir
  }

  private async requireGameDir(name: string): Promise<string> {
    const dir = this.gameDir(name)
    if (!(await exists(path.join(dir, GAME_FILE)))) throw new NotFoundError(`Hra „${name}“ neexistuje.`)
    return dir
  }

  // ---------- game.md ----------

  private async readGameFile(dir: string): Promise<GameFile | null> {
    const raw = await readTextIfExists(path.join(dir, GAME_FILE))
    if (raw === null) return null
    const parsed = matter(raw)
    return { data: parsed.data as Frontmatter, body: parsed.content }
  }

  private async writeGameFile(dir: string, file: GameFile): Promise<void> {
    await writeFileAtomic(path.join(dir, GAME_FILE), matter.stringify(file.body, file.data))
  }

  private metaFromGameFile(name: string, file: GameFile, stat: { birthtimeMs: number; mtimeMs: number }): GameMeta {
    return {
      name,
      createdAt: toTimestamp(file.data.createdAt, stat.birthtimeMs),
      updatedAt: toTimestamp(file.data.updatedAt, stat.mtimeMs),
    }
  }

  private setupFromGameFile(file: GameFile, characters: Character[], narrators: Narrator[]): GameSetup {
    const narratorName = parseLink(file.data.narrator)
    return {
      characters,
      narrators,
      backgroundImage: stringOrNull(file.data.background),
      // výchozí hodnota je zapnuto; vypnuto jen při explicitním `false`
      brightBackground: file.data.brightBackground !== false,
      // Aktuální vypravěč musí existovat jako soubor; jinak žádný
      narrator: narrators.find(n => nameKey(n.name) === nameKey(narratorName ?? ''))?.name ?? null,
      rules: splitGameBody(file.body).rules,
      rulesInAi: file.data.rulesInAi === true,
    }
  }

  private async touchGame(dir: string, mutate?: (file: GameFile) => void): Promise<void> {
    const file = (await this.readGameFile(dir)) ?? { data: {}, body: '' }
    mutate?.(file)
    file.data.updatedAt = toIso(Date.now())
    await this.writeGameFile(dir, file)
  }

  // ---------- hry ----------

  async listGames(): Promise<GameMeta[]> {
    await ensureDir(this.vaultPath)
    const dirents = await fs.readdir(this.vaultPath, { withFileTypes: true })
    const games: GameMeta[] = []
    for (const dirent of dirents) {
      if (!dirent.isDirectory() || dirent.name.startsWith('.')) continue
      const dir = path.join(this.vaultPath, dirent.name)
      const file = await this.readGameFile(dir)
      if (!file) continue
      const stat = await fs.stat(path.join(dir, GAME_FILE))
      games.push(this.metaFromGameFile(dirent.name, file, stat))
    }
    return games.sort((a, b) => b.updatedAt - a.updatedAt)
  }

  async createGame(name: string): Promise<GameDetail> {
    const trimmed = name.trim()
    const dir = this.gameDir(trimmed)
    if (await exists(dir)) throw new ConflictError(`Hra „${trimmed}“ už existuje.`)

    const now = toIso(Date.now())
    await ensureDir(dir)
    await Promise.all([CHARACTER_DIR, NARRATOR_DIR, THREAD_DIR, FACTION_DIR, QUEST_DIR, LOCATION_DIR, LORE_DIR, PORTRAIT_DIR, BACKGROUND_DIR, SCENE_DIR].map(sub => ensureDir(path.join(dir, sub))))
    await this.writeGameFile(dir, {
      data: {
        name: trimmed,
        createdAt: now,
        updatedAt: now,
        background: null,
        brightBackground: true,
        narrator: null,
        rulesInAi: false,
      },
      body: `# ${trimmed}\n\nPoznámky ke hře (volný text, aplikace jej nemění).\n`,
    })
    const detail = await this.getGame(trimmed)
    if (!detail) throw new Error('Vytvoření hry selhalo.')
    return detail
  }

  async getGame(name: string): Promise<GameDetail | null> {
    let dir: string
    try {
      dir = this.gameDir(name)
    } catch {
      return null
    }
    let file = await this.readGameFile(dir)
    if (!file) return null
    if (await this.migrateLegacyNarrator(dir, file)) file = (await this.readGameFile(dir)) ?? file
    const stat = await fs.stat(path.join(dir, GAME_FILE))
    const characters = await this.readCharacters(dir)
    const narrators = await this.readNarrators(dir)
    const scenes = await this.listScenes(name)
    const threads = await this.readThreads(dir)
    const factions = await this.readFactions(dir)
    const quests = await this.readQuests(dir)
    const locations = await this.readLocations(dir)
    const lore = await this.readLore(dir)
    return {
      meta: this.metaFromGameFile(name.trim(), file, stat),
      setup: this.setupFromGameFile(file, characters.map(c => c.character), narrators.map(n => n.narrator)),
      scenes,
      threads: threads.map(t => t.thread),
      factions: factions.map(f => f.faction),
      quests: quests.map(q => q.quest),
      locations: locations.map(l => l.location),
      lore: lore.map(l => l.lore),
    }
  }

  async renameGame(oldName: string, newName: string): Promise<GameMeta> {
    const oldDir = await this.requireGameDir(oldName)
    const trimmed = newName.trim()
    const newDir = this.gameDir(trimmed)
    if (oldDir === newDir) {
      const file = await this.readGameFile(oldDir)
      const stat = await fs.stat(path.join(oldDir, GAME_FILE))
      return this.metaFromGameFile(trimmed, file!, stat)
    }
    if (await exists(newDir)) throw new ConflictError(`Hra „${trimmed}“ už existuje.`)
    await fs.rename(oldDir, newDir)
    await this.touchGame(newDir, file => { file.data.name = trimmed })
    const file = await this.readGameFile(newDir)
    const stat = await fs.stat(path.join(newDir, GAME_FILE))
    return this.metaFromGameFile(trimmed, file!, stat)
  }

  async deleteGame(name: string): Promise<void> {
    const dir = await this.requireGameDir(name)
    await removeIfExists(dir)
  }

  // ---------- postavy ----------

  /** Složka postav; starou složku `npcs` při prvním přístupu přejmenuje na `characters`. */
  private async characterDir(dir: string): Promise<string> {
    const target = path.join(dir, CHARACTER_DIR)
    const legacy = path.join(dir, LEGACY_CHARACTER_DIR)
    if (!(await exists(target)) && (await exists(legacy))) {
      await fs.rename(legacy, target)
    }
    return target
  }

  /** Postava z frontmatteru; staré soubory jen s `name` se rozdělí na jméno a příjmení. */
  private characterFromFrontmatter(data: Frontmatter, baseName: string, body: string): Character {
    const legacyName = stringOrNull(data.name) ?? baseName
    const split = splitName(legacyName)
    const hasFirstName = stringOrNull(data.firstName) !== null
    const firstName = stringOrNull(data.firstName) ?? split.firstName
    const lastName = typeof data.lastName === 'string' ? data.lastName.trim() : hasFirstName ? '' : split.lastName
    const name = fullName(firstName, lastName) || legacyName
    return {
      id: stringOrNull(data.id) ?? baseName,
      name,
      firstName: firstName || name,
      lastName,
      nickname: stringOrNull(data.nickname) ?? (firstName || name),
      image: stringOrNull(data.portrait),
      notes: body.replace(/^\n+/, '').trimEnd(),
    }
  }

  private async readCharacters(dir: string): Promise<CharacterFile[]> {
    const charDir = await this.characterDir(dir)
    const files = await listFiles(charDir, '.md')
    const characters: CharacterFile[] = []
    for (const fileName of files) {
      const raw = await readTextIfExists(path.join(charDir, fileName))
      if (raw === null) continue
      const parsed = matter(raw)
      const data = parsed.data as Frontmatter
      const baseName = fileName.replace(/\.md$/i, '')
      characters.push({ fileName, data, body: parsed.content, character: this.characterFromFrontmatter(data, baseName, parsed.content) })
    }
    // Pořadí postav podle frontmatter `order`, jinak abecedně
    return characters.sort((a, b) => {
      const ao = typeof a.data.order === 'number' ? a.data.order : Number.MAX_SAFE_INTEGER
      const bo = typeof b.data.order === 'number' ? b.data.order : Number.MAX_SAFE_INTEGER
      return ao - bo || a.character.name.localeCompare(b.character.name, 'cs')
    })
  }

  private assertCharacterNameFree(existing: CharacterFile[], name: string, exceptId?: string): void {
    const key = nameKey(name)
    if (existing.some(c => c.character.id !== exceptId && nameKey(c.character.name) === key)) {
      throw new ConflictError(`Postava „${name}“ už existuje. Změň jméno nebo příjmení.`)
    }
  }

  private async writeCharacterFile(charDir: string, character: Character, extra: Frontmatter, order: number): Promise<void> {
    const data: Frontmatter = {
      ...extra,
      id: character.id,
      name: character.name,
      firstName: character.firstName,
      lastName: character.lastName,
      nickname: character.nickname,
      portrait: character.image,
      order,
    }
    const body = character.notes.trim() ? `\n${character.notes.trimEnd()}\n` : ''
    await writeFileAtomic(path.join(charDir, `${safeFileName(character.name)}.md`), matter.stringify(body, data))
  }

  /** Smaže portrét ve vaultu, pokud ho nepoužívá jiná postava. */
  private async removePortraitIfUnused(dir: string, portrait: string, characters: CharacterFile[], exceptId: string): Promise<void> {
    if (isRemoteImage(portrait) || !portrait.startsWith(`${PORTRAIT_DIR}/`)) return
    const used = characters.some(c => c.character.id !== exceptId && c.character.image === portrait)
    if (!used) await removeIfExists(path.join(dir, portrait))
  }

  /** Po přejmenování postavy / změně nicku přepsat hlavičky mluvčího i seznamy postav (vč. AI postav) ve všech scénách. */
  private async renameSpeakerInScenes(dir: string, oldName: string, newName: string, nickname: string): Promise<void> {
    for (const scene of await this.readScenes(dir)) {
      const body = renameSpeaker(scene.body, oldName, newName, nickname)
      const inScene = scene.meta.characters.includes(oldName)
      const inAi = scene.meta.aiCharacters.includes(oldName)
      if (body === null && !inScene && !inAi) continue
      const data: Frontmatter = { ...scene.data }
      if (inScene) data.characters = toCharacterLinks(scene.meta.characters.map(n => (n === oldName ? newName : n)))
      if (inAi) data.aiCharacters = toCharacterLinks(scene.meta.aiCharacters.map(n => (n === oldName ? newName : n)))
      await writeFileAtomic(path.join(dir, SCENE_DIR, scene.fileName), matter.stringify(body ?? scene.body, data))
    }
  }

  /** Po smazání postavy ji odebrat ze seznamů postav (vč. AI postav) scén. */
  private async removeCharacterFromScenes(dir: string, name: string): Promise<void> {
    for (const scene of await this.readScenes(dir)) {
      const inScene = scene.meta.characters.includes(name)
      const inAi = scene.meta.aiCharacters.includes(name)
      if (!inScene && !inAi) continue
      const data: Frontmatter = { ...scene.data }
      if (inScene) data.characters = toCharacterLinks(scene.meta.characters.filter(n => n !== name))
      if (inAi) data.aiCharacters = toCharacterLinks(scene.meta.aiCharacters.filter(n => n !== name))
      await writeFileAtomic(path.join(dir, SCENE_DIR, scene.fileName), matter.stringify(scene.body, data))
    }
  }

  async createCharacter(gameName: string, input: CharacterInput): Promise<Character> {
    const dir = await this.requireGameDir(gameName)
    const charDir = await this.characterDir(dir)
    await ensureDir(charDir)
    const existing = await this.readCharacters(dir)
    const name = fullName(input.firstName, input.lastName)
    this.assertCharacterNameFree(existing, name)

    const order = existing.reduce((max, c) => Math.max(max, typeof c.data.order === 'number' ? c.data.order : -1), -1) + 1
    const character: Character = {
      id: `char-${Date.now()}`,
      name,
      firstName: input.firstName.trim(),
      lastName: input.lastName.trim(),
      nickname: input.nickname.trim(),
      image: input.image ?? null,
      notes: input.notes ?? '',
    }
    await this.writeCharacterFile(charDir, character, {}, order)
    await this.touchGame(dir)
    return character
  }

  async updateCharacter(gameName: string, characterId: string, input: CharacterInput): Promise<Character> {
    const dir = await this.requireGameDir(gameName)
    const charDir = await this.characterDir(dir)
    const existing = await this.readCharacters(dir)
    const current = existing.find(c => c.character.id === characterId)
    if (!current) throw new NotFoundError(`Postava „${characterId}“ neexistuje.`)
    const previous = current.character
    const name = fullName(input.firstName, input.lastName)
    this.assertCharacterNameFree(existing, name, characterId)

    let image = input.image === undefined ? previous.image : input.image

    if (name !== previous.name) {
      await removeIfExists(path.join(charDir, current.fileName))
      // Portrét ve vaultu nese celé jméno → přejmenovat spolu s postavou
      if (previous.image && image === previous.image && previous.image.startsWith(`${PORTRAIT_DIR}/`) && (await exists(path.join(dir, previous.image)))) {
        const ext = path.extname(previous.image)
        const base = safeFileName(name)
        await this.removeSiblingsWithOtherExt(path.join(dir, PORTRAIT_DIR), base, ext)
        const target = `${PORTRAIT_DIR}/${base}${ext}`
        await fs.rename(path.join(dir, previous.image), path.join(dir, target))
        image = target
      }
    }
    if (previous.image && image !== previous.image) {
      await this.removePortraitIfUnused(dir, previous.image, existing, characterId)
    }

    const character: Character = {
      id: characterId,
      name,
      firstName: input.firstName.trim(),
      lastName: input.lastName.trim(),
      nickname: input.nickname.trim(),
      image,
      notes: input.notes ?? previous.notes,
    }
    const order = typeof current.data.order === 'number' ? current.data.order : existing.indexOf(current)
    await this.writeCharacterFile(charDir, character, current.data, order)

    if (name !== previous.name || character.nickname !== previous.nickname) {
      await this.renameSpeakerInScenes(dir, previous.name, name, character.nickname)
    }
    if (name !== previous.name) await this.renameCharacterInThreads(dir, previous.name, name)
    if (name !== previous.name) await this.renameCharacterInFactions(dir, previous.name, name)
    if (name !== previous.name) await this.renameCharacterInQuests(dir, previous.name, name)
    if (name !== previous.name) await this.renameRefInLore(dir, 'characters', previous.name, name)
    await this.touchGame(dir)
    return character
  }

  async deleteCharacter(gameName: string, characterId: string): Promise<void> {
    const dir = await this.requireGameDir(gameName)
    const charDir = await this.characterDir(dir)
    const existing = await this.readCharacters(dir)
    const current = existing.find(c => c.character.id === characterId)
    if (!current) throw new NotFoundError(`Postava „${characterId}“ neexistuje.`)
    await removeIfExists(path.join(charDir, current.fileName))
    if (current.character.image) await this.removePortraitIfUnused(dir, current.character.image, existing, characterId)
    await this.removeCharacterFromScenes(dir, current.character.name)
    await this.renameCharacterInThreads(dir, current.character.name, null)
    await this.renameCharacterInFactions(dir, current.character.name, null)
    await this.renameCharacterInQuests(dir, current.character.name, null)
    await this.renameRefInLore(dir, 'characters', current.character.name, null)
    await this.touchGame(dir)
  }

  // ---------- vypravěči ----------

  private narratorFromFrontmatter(data: Frontmatter, baseName: string, body: string): Narrator {
    const name = stringOrNull(data.name) ?? baseName
    const { description, aiPrompt } = splitByMarker(body, AI_PROMPT_MARKER, 'aiPrompt')
    return {
      id: stringOrNull(data.id) ?? baseName,
      name,
      description,
      aiPrompt,
      image: stringOrNull(data.portrait),
    }
  }

  private async readNarrators(dir: string): Promise<NarratorFile[]> {
    const narratorDir = path.join(dir, NARRATOR_DIR)
    const files = await listFiles(narratorDir, '.md')
    const narrators: NarratorFile[] = []
    for (const fileName of files) {
      const raw = await readTextIfExists(path.join(narratorDir, fileName))
      if (raw === null) continue
      const parsed = matter(raw)
      const data = parsed.data as Frontmatter
      const baseName = fileName.replace(/\.md$/i, '')
      narrators.push({ fileName, data, body: parsed.content, narrator: this.narratorFromFrontmatter(data, baseName, parsed.content) })
    }
    return narrators.sort((a, b) => {
      const ao = typeof a.data.order === 'number' ? a.data.order : Number.MAX_SAFE_INTEGER
      const bo = typeof b.data.order === 'number' ? b.data.order : Number.MAX_SAFE_INTEGER
      return ao - bo || a.narrator.name.localeCompare(b.narrator.name, 'cs')
    })
  }

  private assertNarratorNameFree(existing: NarratorFile[], name: string, exceptId?: string): void {
    const key = nameKey(name)
    if (existing.some(n => n.narrator.id !== exceptId && nameKey(n.narrator.name) === key)) {
      throw new ConflictError(`Vypravěč „${name}“ už existuje. Zvol jiné jméno.`)
    }
  }

  private async writeNarratorFile(dir: string, narrator: Narrator, extra: Frontmatter, order: number): Promise<void> {
    const data: Frontmatter = {
      ...extra,
      id: narrator.id,
      name: narrator.name,
      portrait: narrator.image,
      order,
    }
    const body = narrator.description.trim() ? `\n${narrator.description.trimEnd()}\n` : ''
    const aiPrompt = narrator.aiPrompt.trim() ? `\n<!-- ai-prompt -->\n\n${narrator.aiPrompt.trimEnd()}\n` : ''
    await writeFileAtomic(path.join(dir, NARRATOR_DIR, `${safeFileName(narrator.name)}.md`), matter.stringify(body + aiPrompt, data))
  }

  /** Smaže portrét vypravěče ve vaultu, pokud ho nepoužívá jiný vypravěč. */
  private async removeNarratorPortraitIfUnused(dir: string, portrait: string, narrators: NarratorFile[], exceptId: string): Promise<void> {
    if (isRemoteImage(portrait) || !portrait.startsWith(`${PORTRAIT_DIR}/`)) return
    const used = narrators.some(n => n.narrator.id !== exceptId && n.narrator.image === portrait)
    if (!used) await removeIfExists(path.join(dir, portrait))
  }

  /**
   * Starší hry měly jediného vypravěče ve frontmatteru `game.md` (`dm: {name, portrait}`, portrét `portraits/_dm.*`).
   * Převede ho na soubor v `narrators/` a nastaví jako aktuálního. Vrací true, pokud se `game.md` změnil.
   */
  private async migrateLegacyNarrator(dir: string, file: GameFile): Promise<boolean> {
    if (!('dm' in file.data)) return false
    const dm = (typeof file.data.dm === 'object' && file.data.dm !== null ? file.data.dm : {}) as Frontmatter
    const name = stringOrNull(dm.name) ?? 'DM'
    let portrait = stringOrNull(dm.portrait)

    // Výchozí „DM“ bez portrétu nebyl nikdy nastaven → hra zůstane bez vypravěče
    if (name === 'DM' && !portrait) {
      await this.touchGame(dir, f => { delete f.data.dm; f.data.narrator ??= null })
      return true
    }

    const existing = await this.readNarrators(dir)
    const already = existing.find(n => nameKey(n.narrator.name) === nameKey(name))
    if (already) {
      await this.touchGame(dir, f => { delete f.data.dm; f.data.narrator ??= `[[${already.narrator.name}]]` })
      return true
    }

    if (portrait && !isRemoteImage(portrait)) {
      const source = path.join(dir, portrait)
      if (await exists(source)) {
        const target = `${NARRATOR_PORTRAIT_DIR}/${safeFileName(name)}${path.extname(portrait)}`
        await ensureDir(path.join(dir, NARRATOR_PORTRAIT_DIR))
        await fs.rename(source, path.join(dir, target))
        portrait = target
      } else {
        portrait = null
      }
    }
    const narrator: Narrator = { id: `narrator-${Date.now()}`, name, description: '', aiPrompt: '', image: portrait }
    await this.writeNarratorFile(dir, narrator, {}, existing.length)
    await this.touchGame(dir, f => { delete f.data.dm; f.data.narrator = `[[${name}]]` })
    return true
  }

  /** Po přejmenování vypravěče přepsat hlavičky mluvčího ve všech scénách. */
  private async renameNarratorInScenes(dir: string, oldName: string, newName: string): Promise<void> {
    for (const scene of await this.readScenes(dir)) {
      const body = renameSpeaker(scene.body, oldName, newName, newName)
      if (body === null) continue
      await writeFileAtomic(path.join(dir, SCENE_DIR, scene.fileName), matter.stringify(body, scene.data))
    }
  }

  async createNarrator(gameName: string, input: NarratorInput): Promise<Narrator> {
    const dir = await this.requireGameDir(gameName)
    await ensureDir(path.join(dir, NARRATOR_DIR))
    const existing = await this.readNarrators(dir)
    const name = input.name.trim()
    this.assertNarratorNameFree(existing, name)

    const order = existing.reduce((max, n) => Math.max(max, typeof n.data.order === 'number' ? n.data.order : -1), -1) + 1
    const narrator: Narrator = {
      id: `narrator-${Date.now()}`,
      name,
      description: input.description ?? '',
      aiPrompt: input.aiPrompt ?? '',
      image: input.image ?? null,
    }
    await this.writeNarratorFile(dir, narrator, {}, order)
    await this.touchGame(dir)
    return narrator
  }

  async updateNarrator(gameName: string, narratorId: string, input: NarratorInput): Promise<Narrator> {
    const dir = await this.requireGameDir(gameName)
    const existing = await this.readNarrators(dir)
    const current = existing.find(n => n.narrator.id === narratorId)
    if (!current) throw new NotFoundError(`Vypravěč „${narratorId}“ neexistuje.`)
    const previous = current.narrator
    const name = input.name.trim()
    this.assertNarratorNameFree(existing, name, narratorId)

    let image = input.image === undefined ? previous.image : input.image

    if (name !== previous.name) {
      await removeIfExists(path.join(dir, NARRATOR_DIR, current.fileName))
      // Portrét ve vaultu nese jméno → přejmenovat spolu s vypravěčem
      if (previous.image && image === previous.image && previous.image.startsWith(`${NARRATOR_PORTRAIT_DIR}/`) && (await exists(path.join(dir, previous.image)))) {
        const ext = path.extname(previous.image)
        const base = safeFileName(name)
        await this.removeSiblingsWithOtherExt(path.join(dir, NARRATOR_PORTRAIT_DIR), base, ext)
        const target = `${NARRATOR_PORTRAIT_DIR}/${base}${ext}`
        await fs.rename(path.join(dir, previous.image), path.join(dir, target))
        image = target
      }
    }
    if (previous.image && image !== previous.image) {
      await this.removeNarratorPortraitIfUnused(dir, previous.image, existing, narratorId)
    }

    const narrator: Narrator = {
      id: narratorId,
      name,
      description: input.description ?? previous.description,
      aiPrompt: input.aiPrompt ?? previous.aiPrompt,
      image,
    }
    const order = typeof current.data.order === 'number' ? current.data.order : existing.indexOf(current)
    await this.writeNarratorFile(dir, narrator, current.data, order)

    if (name !== previous.name) {
      await this.renameNarratorInScenes(dir, previous.name, name)
      await this.touchGame(dir, file => {
        if (parseLink(file.data.narrator) === previous.name) file.data.narrator = `[[${name}]]`
      })
    } else {
      await this.touchGame(dir)
    }
    return narrator
  }

  async deleteNarrator(gameName: string, narratorId: string): Promise<void> {
    const dir = await this.requireGameDir(gameName)
    const existing = await this.readNarrators(dir)
    const current = existing.find(n => n.narrator.id === narratorId)
    if (!current) throw new NotFoundError(`Vypravěč „${narratorId}“ neexistuje.`)
    await removeIfExists(path.join(dir, NARRATOR_DIR, current.fileName))
    if (current.narrator.image) await this.removeNarratorPortraitIfUnused(dir, current.narrator.image, existing, narratorId)
    // Smazaný vypravěč nemůže zůstat aktuálním
    await this.touchGame(dir, file => {
      if (parseLink(file.data.narrator) === current.narrator.name) file.data.narrator = null
    })
  }

  // ---------- setup (pozadí, aktuální vypravěč) ----------

  async saveSetup(name: string, settings: GameSettings): Promise<GameSetup> {
    const dir = await this.requireGameDir(name)
    const narrators = await this.readNarrators(dir)
    const narrator = settings.narrator ? narrators.find(n => nameKey(n.narrator.name) === nameKey(settings.narrator!)) : undefined
    if (settings.narrator && !narrator) throw new NotFoundError(`Vypravěč „${settings.narrator}“ neexistuje.`)
    await this.touchGame(dir, file => {
      file.data.background = settings.backgroundImage
      file.data.brightBackground = settings.brightBackground
      file.data.narrator = narrator ? `[[${narrator.narrator.name}]]` : null
      file.data.rulesInAi = settings.rulesInAi
      // Poznámky hráče v těle zůstávají, mění se jen sekce pravidel
      file.body = joinGameBody(splitGameBody(file.body).notes, settings.rules)
    })
    const characters = await this.readCharacters(dir)
    const file = await this.readGameFile(dir)
    return this.setupFromGameFile(file!, characters.map(c => c.character), narrators.map(n => n.narrator))
  }

  // ---------- obrázky ----------

  async saveAsset(name: string, asset: AssetInput): Promise<string> {
    const dir = await this.requireGameDir(name)
    const ext = imageExtension(asset.filename, asset.mimeType)
    let relPath: string

    switch (asset.kind) {
      case 'portrait': {
        const base = safeFileName(asset.ownerName ?? '', 'postava')
        relPath = `${PORTRAIT_DIR}/${base}${ext}`
        await this.removeSiblingsWithOtherExt(path.join(dir, PORTRAIT_DIR), base, ext)
        break
      }
      case 'scene': {
        // Obrázek scény nese její název
        const base = safeFileName(asset.ownerName ?? '', 'scena')
        relPath = `${BACKGROUND_DIR}/${base}${ext}`
        await this.removeSiblingsWithOtherExt(path.join(dir, BACKGROUND_DIR), base, ext)
        break
      }
      case 'narrator': {
        const base = safeFileName(asset.ownerName ?? '', 'vypravec')
        relPath = `${NARRATOR_PORTRAIT_DIR}/${base}${ext}`
        await this.removeSiblingsWithOtherExt(path.join(dir, NARRATOR_PORTRAIT_DIR), base, ext)
        break
      }
      case 'faction': {
        const base = safeFileName(asset.ownerName ?? '', 'frakce')
        relPath = `${FACTION_EMBLEM_DIR}/${base}${ext}`
        await this.removeSiblingsWithOtherExt(path.join(dir, FACTION_EMBLEM_DIR), base, ext)
        break
      }
      case 'location': {
        const base = safeFileName(asset.ownerName ?? '', 'lokace')
        relPath = `${LOCATION_IMAGE_DIR}/${base}${ext}`
        await this.removeSiblingsWithOtherExt(path.join(dir, LOCATION_IMAGE_DIR), base, ext)
        break
      }
      case 'background': {
        const original = safeFileName(path.basename(asset.filename, path.extname(asset.filename)), 'pozadi')
        relPath = await this.uniquePath(dir, BACKGROUND_DIR, original, ext)
        break
      }
    }

    const target = path.join(dir, relPath)
    assertInside(dir, target)
    await writeFileAtomic(target, asset.data)
    await this.touchGame(dir)
    return relPath.replace(/\\/g, '/')
  }

  private async removeSiblingsWithOtherExt(folder: string, base: string, keepExt: string): Promise<void> {
    for (const file of await listFiles(folder)) {
      const fileBase = path.basename(file, path.extname(file))
      if (fileBase === base && path.extname(file).toLowerCase() !== keepExt) {
        await removeIfExists(path.join(folder, file))
      }
    }
  }

  private async uniquePath(dir: string, sub: string, base: string, ext: string): Promise<string> {
    let candidate = `${sub}/${base}${ext}`
    let counter = 2
    while (await exists(path.join(dir, candidate))) {
      candidate = `${sub}/${base} ${counter}${ext}`
      counter++
    }
    return candidate
  }

  // ---------- scény ----------

  private sceneFileName(order: number, title: string): string {
    return `${String(order).padStart(3, '0')} - ${safeFileName(title, 'scena')}.md`
  }

  private async readScenes(dir: string): Promise<SceneFile[]> {
    const sceneDir = path.join(dir, SCENE_DIR)
    const files = await listFiles(sceneDir, '.md')
    const scenes: SceneFile[] = []
    // Starší soubory scén bez klíče `characters` → všechny postavy hry
    let allCharacterNames: string[] | null = null
    for (const [index, fileName] of files.entries()) {
      const raw = await readTextIfExists(path.join(sceneDir, fileName))
      if (raw === null) continue
      const parsed = matter(raw)
      const data = parsed.data as Frontmatter
      if (data.characters === undefined && allCharacterNames === null) {
        allCharacterNames = (await this.readCharacters(dir)).map(c => c.character.name)
      }
      const stat = await fs.stat(path.join(sceneDir, fileName))
      const baseName = fileName.replace(/\.md$/i, '')
      const orderFromName = parseInt(baseName, 10)
      const { description, summary, entries } = splitSceneBody(parsed.content)
      scenes.push({
        fileName,
        data,
        body: parsed.content,
        entriesBody: entries,
        meta: {
          id: stringOrNull(data.id) ?? baseName,
          title: stringOrNull(data.title) ?? baseName.replace(/^\d+\s*-\s*/, ''),
          order: typeof data.order === 'number' ? data.order : Number.isFinite(orderFromName) ? orderFromName : index + 1,
          description,
          summary,
          image: stringOrNull(data.image),
          characters: data.characters === undefined ? (allCharacterNames ?? []) : parseCharacterLinks(data.characters),
          location: parseLink(data.location),
          ai: data.ai === true,
          aiCharacters: parseCharacterLinks(data.aiCharacters),
          aiPrompt: stringOrNull(data.aiPrompt) ?? '',
          createdAt: toTimestamp(data.createdAt, stat.birthtimeMs),
          updatedAt: toTimestamp(data.updatedAt, stat.mtimeMs),
        },
      })
    }
    return scenes.sort((a, b) => a.meta.order - b.meta.order || a.fileName.localeCompare(b.fileName, 'cs'))
  }

  private async findScene(dir: string, sceneId: string): Promise<SceneFile | null> {
    const scenes = await this.readScenes(dir)
    return scenes.find(s => s.meta.id === sceneId) ?? null
  }

  private assertSceneTitleFree(existing: SceneFile[], title: string, exceptId?: string): void {
    const key = nameKey(title)
    if (existing.some(s => s.meta.id !== exceptId && nameKey(s.meta.title) === key)) {
      throw new ConflictError(`Scéna „${title}“ už existuje. Zvol jiný název.`)
    }
  }

  /** Jména postav scény: bez duplicit, jen existující postavy hry (kanonický zápis jména podle souboru). */
  private async normalizeSceneCharacters(dir: string, names: string[]): Promise<string[]> {
    const known = await this.readCharacters(dir)
    const result: string[] = []
    for (const raw of names) {
      const match = known.find(c => nameKey(c.character.name) === nameKey(raw))
      if (match && !result.includes(match.character.name)) result.push(match.character.name)
    }
    return result
  }

  private async writeSceneFile(dir: string, meta: SceneMeta, entriesBody: string, extra: Frontmatter): Promise<void> {
    const data: Frontmatter = {
      ...extra,
      id: meta.id,
      title: meta.title,
      order: meta.order,
      image: meta.image,
      characters: toCharacterLinks(meta.characters),
      location: meta.location ? `[[${meta.location}]]` : null,
      ai: meta.ai,
      aiCharacters: toCharacterLinks(meta.aiCharacters),
      aiPrompt: meta.aiPrompt.trim() ? meta.aiPrompt.trim() : null,
      createdAt: toIso(meta.createdAt),
      updatedAt: toIso(meta.updatedAt),
    }
    const filePath = path.join(dir, SCENE_DIR, this.sceneFileName(meta.order, meta.title))
    await writeFileAtomic(filePath, matter.stringify(joinSceneBody(meta.description, meta.summary, entriesBody), data))
  }

  /** Smaže obrázek scény ve vaultu, pokud ho nepoužívá jiná scéna ani pozadí hry. */
  private async removeSceneImageIfUnused(dir: string, image: string, scenes: SceneFile[], exceptId: string): Promise<void> {
    if (isRemoteImage(image) || !image.startsWith(`${BACKGROUND_DIR}/`)) return
    const game = await this.readGameFile(dir)
    const used = scenes.some(s => s.meta.id !== exceptId && s.meta.image === image) || stringOrNull(game?.data.background) === image
    if (!used) await removeIfExists(path.join(dir, image))
  }

  async listScenes(name: string): Promise<SceneMeta[]> {
    const dir = await this.requireGameDir(name)
    return (await this.readScenes(dir)).map(s => s.meta)
  }

  async createScene(name: string, input: SceneInput): Promise<SceneMeta> {
    const dir = await this.requireGameDir(name)
    const scenes = await this.readScenes(dir)
    const title = input.title.trim()
    this.assertSceneTitleFree(scenes, title)
    const order = scenes.reduce((max, s) => Math.max(max, s.meta.order), 0) + 1
    // Bez explicitního seznamu převzít postavy z poslední scény
    const last = scenes[scenes.length - 1]
    const characters = await this.normalizeSceneCharacters(dir, input.characters ?? last?.meta.characters ?? [])
    // AI nastavení se do nové scény přenáší z poslední (stejně jako postavy), jen pro postavy, které v nové scéně jsou
    const ai = input.ai ?? last?.meta.ai ?? false
    const aiCharacters = (input.aiCharacters ?? last?.meta.aiCharacters ?? []).filter(n => characters.includes(n))
    const now = Date.now()
    const meta: SceneMeta = {
      id: `scene-${now}`,
      title,
      order,
      description: input.description ?? '',
      summary: input.summary ?? '',
      image: input.image ?? null,
      characters,
      location: await this.normalizeLocationRef(dir, input.location ?? null),
      ai,
      aiCharacters: await this.normalizeSceneCharacters(dir, aiCharacters),
      // Doplňující popis situace je specifický pro scénu – nedědí se
      aiPrompt: input.aiPrompt ?? '',
      createdAt: now,
      updatedAt: now,
    }
    await this.writeSceneFile(dir, meta, '', {})
    await this.touchGame(dir)
    return meta
  }

  async updateScene(name: string, sceneId: string, input: SceneInput): Promise<SceneMeta> {
    const dir = await this.requireGameDir(name)
    const scenes = await this.readScenes(dir)
    const current = scenes.find(s => s.meta.id === sceneId)
    if (!current) throw new NotFoundError(`Scéna „${sceneId}“ neexistuje.`)
    const previous = current.meta
    const title = input.title.trim()
    this.assertSceneTitleFree(scenes, title, sceneId)

    let image = input.image === undefined ? previous.image : input.image

    if (title !== previous.title) {
      await removeIfExists(path.join(dir, SCENE_DIR, current.fileName))
      // Obrázek scény nese její název → přejmenovat spolu se scénou
      if (previous.image && image === previous.image && previous.image.startsWith(`${BACKGROUND_DIR}/`) && (await exists(path.join(dir, previous.image)))) {
        const ext = path.extname(previous.image)
        const base = safeFileName(title, 'scena')
        await this.removeSiblingsWithOtherExt(path.join(dir, BACKGROUND_DIR), base, ext)
        const target = `${BACKGROUND_DIR}/${base}${ext}`
        await fs.rename(path.join(dir, previous.image), path.join(dir, target))
        image = target
      }
    }
    if (previous.image && image !== previous.image) {
      await this.removeSceneImageIfUnused(dir, previous.image, scenes, sceneId)
    }

    const characters = input.characters ? await this.normalizeSceneCharacters(dir, input.characters) : previous.characters
    const aiCharacters = input.aiCharacters ? await this.normalizeSceneCharacters(dir, input.aiCharacters) : previous.aiCharacters
    const meta: SceneMeta = {
      ...previous,
      title,
      description: input.description ?? previous.description,
      summary: input.summary ?? previous.summary,
      image,
      characters,
      location: input.location === undefined ? previous.location : await this.normalizeLocationRef(dir, input.location),
      ai: input.ai ?? previous.ai,
      // AI může hrát jen postavy, které ve scéně jsou
      aiCharacters: aiCharacters.filter(n => characters.includes(n)),
      aiPrompt: input.aiPrompt ?? previous.aiPrompt,
      updatedAt: Date.now(),
    }
    await this.writeSceneFile(dir, meta, current.entriesBody, current.data)
    if (title !== previous.title) await this.renameSceneInThreads(dir, previous.title, title)
    await this.touchGame(dir)
    return meta
  }

  /** Mluvčí, které parser scén rozezná: postavy (celé jméno i nickname) a vypravěči (jméno) */
  private async sceneSpeakers(dir: string): Promise<{ characters: CharacterFile[]; narrators: NarratorFile[] }> {
    return { characters: await this.readCharacters(dir), narrators: await this.readNarrators(dir) }
  }

  async getSceneEntries(name: string, sceneId: string): Promise<StoryEntry[] | null> {
    const dir = await this.requireGameDir(name)
    const scene = await this.findScene(dir, sceneId)
    if (!scene) return null
    const { characters, narrators } = await this.sceneSpeakers(dir)
    // Ručně dopsané repliky mohou používat celé jméno i nickname
    return parseEntries(scene.entriesBody, {
      characters: characters.flatMap(c => [c.character.name, c.character.nickname]),
      narrators: narrators.map(n => n.narrator.name),
    })
  }

  async saveSceneEntries(name: string, sceneId: string, entries: StoryEntry[]): Promise<void> {
    const dir = await this.requireGameDir(name)
    const scene = await this.findScene(dir, sceneId)
    if (!scene) throw new NotFoundError(`Scéna „${sceneId}“ neexistuje.`)
    const characters = await this.readCharacters(dir)
    const nicknames = new Map(characters.map(c => [c.character.name, c.character.nickname]))

    const meta: SceneMeta = { ...scene.meta, updatedAt: Date.now() }
    await this.writeSceneFile(dir, meta, serializeEntries(entries, nicknames), scene.data)
    await this.touchGame(dir)
  }

  async deleteScene(name: string, sceneId: string): Promise<void> {
    const dir = await this.requireGameDir(name)
    const scenes = await this.readScenes(dir)
    const scene = scenes.find(s => s.meta.id === sceneId)
    if (!scene) throw new NotFoundError(`Scéna „${sceneId}“ neexistuje.`)
    await removeIfExists(path.join(dir, SCENE_DIR, scene.fileName))
    if (scene.meta.image) await this.removeSceneImageIfUnused(dir, scene.meta.image, scenes, sceneId)
    await this.renameSceneInThreads(dir, scene.meta.title, null)
    await this.touchGame(dir)
  }

  // ---------- dějové nitě (threads) ----------

  private threadFromFrontmatter(data: Frontmatter, baseName: string, body: string, stat: { birthtimeMs: number; mtimeMs: number }): StoryThread {
    const type = ThreadTypeSchema.safeParse(data.type)
    const status = ThreadStatusSchema.safeParse(data.status)
    const horizon = ThreadHorizonSchema.safeParse(data.horizon)
    const certainty = ThreadCertaintySchema.safeParse(data.certainty)
    return {
      id: stringOrNull(data.id) ?? baseName,
      title: stringOrNull(data.title) ?? baseName,
      // Neznámá hodnota ručně zapsaná v Obsidianu → rozumný výchozí stav, soubor se nepřepisuje, dokud ho uživatel neuloží
      type: type.success ? type.data : 'complication',
      status: status.success ? status.data : 'latent',
      horizon: horizon.success ? horizon.data : 'short-term',
      certainty: certainty.success ? certainty.data : 'confirmed',
      revealCondition: stringOrNull(data.revealCondition) ?? '',
      clock: parseClock(data.clock),
      characters: parseCharacterLinks(data.characters),
      scene: parseLink(data.scene),
      factions: parseCharacterLinks(data.factions),
      locations: parseCharacterLinks(data.locations),
      description: body.replace(/^\n+/, '').trimEnd(),
      createdAt: toTimestamp(data.createdAt, stat.birthtimeMs),
      updatedAt: toTimestamp(data.updatedAt, stat.mtimeMs),
    }
  }

  private async readThreads(dir: string): Promise<ThreadFile[]> {
    const threadDir = path.join(dir, THREAD_DIR)
    const files = await listFiles(threadDir, '.md')
    const threads: ThreadFile[] = []
    for (const fileName of files) {
      const raw = await readTextIfExists(path.join(threadDir, fileName))
      if (raw === null) continue
      const parsed = matter(raw)
      const stat = await fs.stat(path.join(threadDir, fileName))
      const baseName = fileName.replace(/\.md$/i, '')
      threads.push({ fileName, data: parsed.data as Frontmatter, thread: this.threadFromFrontmatter(parsed.data as Frontmatter, baseName, parsed.content, stat) })
    }
    // Nejnověji upravené nahoře
    return threads.sort((a, b) => b.thread.updatedAt - a.thread.updatedAt || a.thread.title.localeCompare(b.thread.title, 'cs'))
  }

  private assertThreadTitleFree(existing: ThreadFile[], title: string, exceptId?: string): void {
    const key = nameKey(title)
    if (existing.some(t => t.thread.id !== exceptId && nameKey(t.thread.title) === key)) {
      throw new ConflictError(`Dějová nit „${title}“ už existuje. Zvol jiný název.`)
    }
  }

  private async writeThreadFile(dir: string, thread: StoryThread, extra: Frontmatter): Promise<void> {
    const data: Frontmatter = {
      ...extra,
      id: thread.id,
      title: thread.title,
      type: thread.type,
      status: thread.status,
      horizon: thread.horizon,
      certainty: thread.certainty,
      revealCondition: thread.revealCondition || null,
      clock: thread.clock,
      characters: toCharacterLinks(thread.characters),
      scene: thread.scene ? `[[${thread.scene}]]` : null,
      factions: toCharacterLinks(thread.factions),
      locations: toCharacterLinks(thread.locations),
      createdAt: toIso(thread.createdAt),
      updatedAt: toIso(thread.updatedAt),
    }
    const body = thread.description.trim() ? `\n${thread.description.trimEnd()}\n` : ''
    await writeFileAtomic(path.join(dir, THREAD_DIR, `${safeFileName(thread.title)}.md`), matter.stringify(body, data))
  }

  /** Název scény nitě: jen existující scéna (kanonický zápis), jinak null */
  private async normalizeThreadScene(dir: string, title: string | null): Promise<string | null> {
    if (!title) return null
    const scenes = await this.readScenes(dir)
    return scenes.find(s => nameKey(s.meta.title) === nameKey(title))?.meta.title ?? null
  }

  /** Po přejmenování (newName) / smazání (null) postavy upravit vazby ve všech nitích. */
  private async renameCharacterInThreads(dir: string, oldName: string, newName: string | null): Promise<void> {
    for (const file of await this.readThreads(dir)) {
      if (!file.thread.characters.includes(oldName)) continue
      const characters = file.thread.characters.flatMap(n => (n === oldName ? (newName ? [newName] : []) : [n]))
      await this.writeThreadFile(dir, { ...file.thread, characters }, file.data)
    }
  }

  /** Po přejmenování (newTitle) / smazání (null) scény upravit vazby ve všech nitích. */
  private async renameSceneInThreads(dir: string, oldTitle: string, newTitle: string | null): Promise<void> {
    for (const file of await this.readThreads(dir)) {
      if (file.thread.scene !== oldTitle) continue
      await this.writeThreadFile(dir, { ...file.thread, scene: newTitle }, file.data)
    }
  }

  /** Názvy frakcí nitě: jen existující frakce (kanonický zápis), bez duplicit */
  private async normalizeThreadFactions(dir: string, titles: string[]): Promise<string[]> {
    const factions = await this.readFactions(dir)
    return this.normalizeFactionRefs(factions, titles)
  }

  /** Po přejmenování (newTitle) / smazání (null) frakce upravit vazby ve všech nitích. */
  private async renameFactionInThreads(dir: string, oldTitle: string, newTitle: string | null): Promise<void> {
    for (const file of await this.readThreads(dir)) {
      if (!file.thread.factions.includes(oldTitle)) continue
      const factions = file.thread.factions.flatMap(n => (n === oldTitle ? (newTitle ? [newTitle] : []) : [n]))
      await this.writeThreadFile(dir, { ...file.thread, factions }, file.data)
    }
  }

  /** Po přejmenování (newTitle) / smazání (null) lokace upravit vazby ve všech nitích. */
  private async renameLocationInThreads(dir: string, oldTitle: string, newTitle: string | null): Promise<void> {
    for (const file of await this.readThreads(dir)) {
      if (!file.thread.locations.includes(oldTitle)) continue
      await this.writeThreadFile(dir, { ...file.thread, locations: replaceRef(file.thread.locations, oldTitle, newTitle) }, file.data)
    }
  }

  async listThreads(name: string): Promise<StoryThread[]> {
    const dir = await this.requireGameDir(name)
    return (await this.readThreads(dir)).map(t => t.thread)
  }

  async createThread(gameName: string, input: ThreadInput): Promise<StoryThread> {
    const dir = await this.requireGameDir(gameName)
    await ensureDir(path.join(dir, THREAD_DIR))
    const existing = await this.readThreads(dir)
    const title = input.title.trim()
    this.assertThreadTitleFree(existing, title)
    const now = Date.now()
    const thread: StoryThread = {
      id: `thread-${now}`,
      title,
      type: input.type,
      status: input.status ?? 'latent',
      horizon: input.horizon ?? 'short-term',
      certainty: input.certainty ?? 'confirmed',
      revealCondition: input.revealCondition?.trim() ?? '',
      clock: input.clock ?? null,
      characters: await this.normalizeSceneCharacters(dir, input.characters ?? []),
      scene: await this.normalizeThreadScene(dir, input.scene ?? null),
      factions: await this.normalizeThreadFactions(dir, input.factions ?? []),
      locations: await this.normalizeLocationRefs(dir, input.locations ?? []),
      description: input.description ?? '',
      createdAt: now,
      updatedAt: now,
    }
    await this.writeThreadFile(dir, thread, {})
    await this.touchGame(dir)
    return thread
  }

  async updateThread(gameName: string, threadId: string, input: ThreadInput): Promise<StoryThread> {
    const dir = await this.requireGameDir(gameName)
    const existing = await this.readThreads(dir)
    const current = existing.find(t => t.thread.id === threadId)
    if (!current) throw new NotFoundError(`Dějová nit „${threadId}“ neexistuje.`)
    const previous = current.thread
    const title = input.title.trim()
    this.assertThreadTitleFree(existing, title, threadId)

    // Název = název souboru; id zůstává
    if (title !== previous.title) await removeIfExists(path.join(dir, THREAD_DIR, current.fileName))

    const thread: StoryThread = {
      ...previous,
      title,
      type: input.type,
      status: input.status ?? previous.status,
      horizon: input.horizon ?? previous.horizon,
      certainty: input.certainty ?? previous.certainty,
      revealCondition: input.revealCondition === undefined ? previous.revealCondition : input.revealCondition.trim(),
      clock: input.clock === undefined ? previous.clock : input.clock,
      characters: input.characters ? await this.normalizeSceneCharacters(dir, input.characters) : previous.characters,
      scene: input.scene === undefined ? previous.scene : await this.normalizeThreadScene(dir, input.scene),
      factions: input.factions ? await this.normalizeThreadFactions(dir, input.factions) : previous.factions,
      locations: input.locations ? await this.normalizeLocationRefs(dir, input.locations) : previous.locations,
      description: input.description ?? previous.description,
      updatedAt: Date.now(),
    }
    await this.writeThreadFile(dir, thread, current.data)
    if (title !== previous.title) await this.renameThreadInQuests(dir, previous.title, title)
    if (title !== previous.title) await this.renameRefInLore(dir, 'threads', previous.title, title)
    await this.touchGame(dir)
    return thread
  }

  async deleteThread(gameName: string, threadId: string): Promise<void> {
    const dir = await this.requireGameDir(gameName)
    const existing = await this.readThreads(dir)
    const current = existing.find(t => t.thread.id === threadId)
    if (!current) throw new NotFoundError(`Dějová nit „${threadId}“ neexistuje.`)
    await removeIfExists(path.join(dir, THREAD_DIR, current.fileName))
    await this.renameThreadInQuests(dir, current.thread.title, null)
    await this.renameRefInLore(dir, 'threads', current.thread.title, null)
    await this.touchGame(dir)
  }

  // ---------- frakce (factions) ----------

  private factionFromFrontmatter(data: Frontmatter, baseName: string, body: string, stat: { birthtimeMs: number; mtimeMs: number }): Faction {
    const type = FactionTypeSchema.safeParse(data.type)
    const status = FactionStatusSchema.safeParse(data.status)
    const stance = FactionStanceSchema.safeParse(data.stance)
    const { description, secrets } = splitFactionBody(body)
    return {
      id: stringOrNull(data.id) ?? baseName,
      title: stringOrNull(data.title) ?? baseName,
      // Neznámá hodnota ručně zapsaná v Obsidianu → rozumný výchozí stav, soubor se nepřepisuje, dokud ho uživatel neuloží
      type: type.success ? type.data : 'other',
      status: status.success ? status.data : 'active',
      stance: stance.success ? stance.data : 'unknown',
      leader: parseLink(data.leader),
      parentFaction: parseLink(data.parentFaction),
      goals: Array.isArray(data.goals) ? data.goals.filter((g): g is string => typeof g === 'string' && g.trim() !== '').map(g => g.trim()) : [],
      characters: parseCharacterLinks(data.characters),
      locations: parseCharacterLinks(data.locations),
      relations: parseFactionRelations(data.relations),
      emblem: stringOrNull(data.emblem),
      description,
      secrets,
      createdAt: toTimestamp(data.createdAt, stat.birthtimeMs),
      updatedAt: toTimestamp(data.updatedAt, stat.mtimeMs),
    }
  }

  private async readFactions(dir: string): Promise<FactionFile[]> {
    const factionDir = path.join(dir, FACTION_DIR)
    const files = await listFiles(factionDir, '.md')
    const factions: FactionFile[] = []
    for (const fileName of files) {
      const raw = await readTextIfExists(path.join(factionDir, fileName))
      if (raw === null) continue
      const parsed = matter(raw)
      const stat = await fs.stat(path.join(factionDir, fileName))
      const baseName = fileName.replace(/\.md$/i, '')
      factions.push({ fileName, data: parsed.data as Frontmatter, faction: this.factionFromFrontmatter(parsed.data as Frontmatter, baseName, parsed.content, stat) })
    }
    return factions.sort((a, b) => a.faction.title.localeCompare(b.faction.title, 'cs'))
  }

  private assertFactionTitleFree(existing: FactionFile[], title: string, exceptId?: string): void {
    const key = nameKey(title)
    if (existing.some(f => f.faction.id !== exceptId && nameKey(f.faction.title) === key)) {
      throw new ConflictError(`Frakce „${title}“ už existuje. Zvol jiný název.`)
    }
  }

  private async writeFactionFile(dir: string, faction: Faction, extra: Frontmatter): Promise<void> {
    const data: Frontmatter = {
      ...extra,
      id: faction.id,
      title: faction.title,
      type: faction.type,
      status: faction.status,
      stance: faction.stance,
      leader: faction.leader ? `[[${faction.leader}]]` : null,
      parentFaction: faction.parentFaction ? `[[${faction.parentFaction}]]` : null,
      goals: faction.goals,
      characters: toCharacterLinks(faction.characters),
      locations: toCharacterLinks(faction.locations),
      relations: faction.relations.map(r => ({ faction: `[[${r.faction}]]`, stance: r.stance, ...(r.note ? { note: r.note } : {}) })),
      emblem: faction.emblem,
      createdAt: toIso(faction.createdAt),
      updatedAt: toIso(faction.updatedAt),
    }
    const description = faction.description.trim() ? `\n${faction.description.trimEnd()}\n` : ''
    const secrets = faction.secrets.trim() ? `\n<!-- secrets -->\n\n${faction.secrets.trimEnd()}\n` : ''
    await writeFileAtomic(path.join(dir, FACTION_DIR, `${safeFileName(faction.title)}.md`), matter.stringify(description + secrets, data))
  }

  /** Názvy frakcí: jen existující (kanonický zápis), bez duplicit, volitelně bez jedné (sebe sama) */
  private normalizeFactionRefs(factions: FactionFile[], titles: string[], exceptId?: string): string[] {
    const result: string[] = []
    for (const title of titles) {
      const found = factions.find(f => f.faction.id !== exceptId && nameKey(f.faction.title) === nameKey(title))
      if (found && !result.includes(found.faction.title)) result.push(found.faction.title)
    }
    return result
  }

  /** Vůdce: jen existující postava (kanonické jméno), jinak null */
  private async normalizeCharacterRef(dir: string, name: string | null): Promise<string | null> {
    if (!name) return null
    return (await this.normalizeSceneCharacters(dir, [name]))[0] ?? null
  }

  /**
   * Nadřazená frakce: musí existovat, nesmí být frakce sama a nesmí vytvořit cyklus
   * (řetězec rodičů kandidáta nesmí vést zpět k upravované frakci).
   */
  private resolveParentFaction(factions: FactionFile[], selfId: string | undefined, selfTitle: string, title: string | null): string | null {
    if (!title) return null
    const parent = factions.find(f => nameKey(f.faction.title) === nameKey(title))
    if (!parent) return null
    if (parent.faction.id === selfId || nameKey(parent.faction.title) === nameKey(selfTitle)) {
      throw new ValidationError('Frakce nemůže být nadřazená sama sobě.')
    }
    const seen = new Set<string>()
    let cursor: FactionFile | undefined = parent
    while (cursor?.faction.parentFaction) {
      if (seen.has(cursor.faction.id)) break
      seen.add(cursor.faction.id)
      const next = factions.find(f => f.faction.title === cursor!.faction.parentFaction)
      if (next && next.faction.id === selfId) {
        throw new ValidationError(`Frakce „${parent.faction.title}“ je podřízená této frakci – vznikl by cyklus.`)
      }
      cursor = next
    }
    return parent.faction.title
  }

  /** Vztahy: jen k existujícím jiným frakcím, max. jeden na cílovou frakci */
  private normalizeFactionRelations(factions: FactionFile[], relations: FactionInput['relations'], selfId?: string): FactionRelation[] {
    const result: FactionRelation[] = []
    for (const rel of relations ?? []) {
      const [target] = this.normalizeFactionRefs(factions, [rel.faction], selfId)
      if (!target || result.some(r => r.faction === target)) continue
      result.push({ faction: target, stance: rel.stance, note: rel.note?.trim() ?? '' })
    }
    return result
  }

  /** Po přejmenování (newName) / smazání (null) postavy upravit vůdce a postavy ve všech frakcích. */
  private async renameCharacterInFactions(dir: string, oldName: string, newName: string | null): Promise<void> {
    for (const file of await this.readFactions(dir)) {
      const f = file.faction
      if (f.leader !== oldName && !f.characters.includes(oldName)) continue
      await this.writeFactionFile(dir, {
        ...f,
        leader: f.leader === oldName ? newName : f.leader,
        characters: f.characters.flatMap(n => (n === oldName ? (newName ? [newName] : []) : [n])),
      }, file.data)
    }
  }

  /** Po přejmenování (newTitle) / smazání (null) frakce upravit nadřazenou frakci a vztahy v ostatních frakcích. */
  private async renameFactionInFactions(dir: string, oldTitle: string, newTitle: string | null): Promise<void> {
    for (const file of await this.readFactions(dir)) {
      const f = file.faction
      const inRelations = f.relations.some(r => r.faction === oldTitle)
      if (f.parentFaction !== oldTitle && !inRelations) continue
      await this.writeFactionFile(dir, {
        ...f,
        parentFaction: f.parentFaction === oldTitle ? newTitle : f.parentFaction,
        relations: f.relations.flatMap(r => (r.faction === oldTitle ? (newTitle ? [{ ...r, faction: newTitle }] : []) : [r])),
      }, file.data)
    }
  }

  /** Smaže emblém ve vaultu, pokud ho nepoužívá jiná frakce. */
  private async removeEmblemIfUnused(dir: string, emblem: string, factions: FactionFile[], exceptId: string): Promise<void> {
    if (isRemoteImage(emblem) || !emblem.startsWith(`${PORTRAIT_DIR}/`)) return
    const used = factions.some(f => f.faction.id !== exceptId && f.faction.emblem === emblem)
    if (!used) await removeIfExists(path.join(dir, emblem))
  }

  /** Po přejmenování (newTitle) / smazání (null) lokace upravit vazby ve všech frakcích. */
  private async renameLocationInFactions(dir: string, oldTitle: string, newTitle: string | null): Promise<void> {
    for (const file of await this.readFactions(dir)) {
      if (!file.faction.locations.includes(oldTitle)) continue
      await this.writeFactionFile(dir, { ...file.faction, locations: replaceRef(file.faction.locations, oldTitle, newTitle) }, file.data)
    }
  }

  async listFactions(name: string): Promise<Faction[]> {
    const dir = await this.requireGameDir(name)
    return (await this.readFactions(dir)).map(f => f.faction)
  }

  async createFaction(gameName: string, input: FactionInput): Promise<Faction> {
    const dir = await this.requireGameDir(gameName)
    await ensureDir(path.join(dir, FACTION_DIR))
    const existing = await this.readFactions(dir)
    const title = input.title.trim()
    this.assertFactionTitleFree(existing, title)
    const now = Date.now()
    const faction: Faction = {
      id: `faction-${now}`,
      title,
      type: input.type,
      status: input.status ?? 'active',
      stance: input.stance ?? 'unknown',
      leader: await this.normalizeCharacterRef(dir, input.leader ?? null),
      parentFaction: this.resolveParentFaction(existing, undefined, title, input.parentFaction ?? null),
      goals: (input.goals ?? []).map(g => g.trim()).filter(Boolean),
      characters: await this.normalizeSceneCharacters(dir, input.characters ?? []),
      locations: await this.normalizeLocationRefs(dir, input.locations ?? []),
      relations: this.normalizeFactionRelations(existing, input.relations),
      emblem: input.emblem ?? null,
      description: input.description ?? '',
      secrets: input.secrets ?? '',
      createdAt: now,
      updatedAt: now,
    }
    await this.writeFactionFile(dir, faction, {})
    await this.touchGame(dir)
    return faction
  }

  async updateFaction(gameName: string, factionId: string, input: FactionInput): Promise<Faction> {
    const dir = await this.requireGameDir(gameName)
    const existing = await this.readFactions(dir)
    const current = existing.find(f => f.faction.id === factionId)
    if (!current) throw new NotFoundError(`Frakce „${factionId}“ neexistuje.`)
    const previous = current.faction
    const title = input.title.trim()
    this.assertFactionTitleFree(existing, title, factionId)

    let emblem = input.emblem === undefined ? previous.emblem : input.emblem

    // Název = název souboru; id zůstává
    if (title !== previous.title) {
      await removeIfExists(path.join(dir, FACTION_DIR, current.fileName))
      // Emblém ve vaultu nese název → přejmenovat spolu s frakcí
      if (previous.emblem && emblem === previous.emblem && previous.emblem.startsWith(`${FACTION_EMBLEM_DIR}/`) && (await exists(path.join(dir, previous.emblem)))) {
        const ext = path.extname(previous.emblem)
        const base = safeFileName(title, 'frakce')
        await this.removeSiblingsWithOtherExt(path.join(dir, FACTION_EMBLEM_DIR), base, ext)
        const target = `${FACTION_EMBLEM_DIR}/${base}${ext}`
        await fs.rename(path.join(dir, previous.emblem), path.join(dir, target))
        emblem = target
      }
    }
    if (previous.emblem && emblem !== previous.emblem) {
      await this.removeEmblemIfUnused(dir, previous.emblem, existing, factionId)
    }

    const faction: Faction = {
      ...previous,
      title,
      type: input.type,
      status: input.status ?? previous.status,
      stance: input.stance ?? previous.stance,
      leader: input.leader === undefined ? previous.leader : await this.normalizeCharacterRef(dir, input.leader),
      parentFaction: input.parentFaction === undefined
        ? previous.parentFaction
        : this.resolveParentFaction(existing, factionId, title, input.parentFaction),
      goals: input.goals ? input.goals.map(g => g.trim()).filter(Boolean) : previous.goals,
      characters: input.characters ? await this.normalizeSceneCharacters(dir, input.characters) : previous.characters,
      locations: input.locations ? await this.normalizeLocationRefs(dir, input.locations) : previous.locations,
      relations: input.relations ? this.normalizeFactionRelations(existing, input.relations, factionId) : previous.relations,
      emblem,
      description: input.description ?? previous.description,
      secrets: input.secrets ?? previous.secrets,
      updatedAt: Date.now(),
    }
    await this.writeFactionFile(dir, faction, current.data)
    if (title !== previous.title) {
      await this.renameFactionInFactions(dir, previous.title, title)
      await this.renameFactionInThreads(dir, previous.title, title)
      await this.renameFactionInQuests(dir, previous.title, title)
      await this.renameRefInLore(dir, 'factions', previous.title, title)
    }
    await this.touchGame(dir)
    return faction
  }

  async deleteFaction(gameName: string, factionId: string): Promise<void> {
    const dir = await this.requireGameDir(gameName)
    const existing = await this.readFactions(dir)
    const current = existing.find(f => f.faction.id === factionId)
    if (!current) throw new NotFoundError(`Frakce „${factionId}“ neexistuje.`)
    await removeIfExists(path.join(dir, FACTION_DIR, current.fileName))
    if (current.faction.emblem) await this.removeEmblemIfUnused(dir, current.faction.emblem, existing, factionId)
    await this.renameFactionInFactions(dir, current.faction.title, null)
    await this.renameFactionInThreads(dir, current.faction.title, null)
    await this.renameFactionInQuests(dir, current.faction.title, null)
    await this.renameRefInLore(dir, 'factions', current.faction.title, null)
    await this.touchGame(dir)
  }

  // ---------- questy (quests) ----------

  private questFromFrontmatter(data: Frontmatter, baseName: string, body: string, stat: { birthtimeMs: number; mtimeMs: number }): Quest {
    const type = QuestTypeSchema.safeParse(data.type)
    const status = QuestStatusSchema.safeParse(data.status)
    const { description, outcome, notes } = splitQuestBody(body)
    return {
      id: stringOrNull(data.id) ?? baseName,
      title: stringOrNull(data.title) ?? baseName,
      // Neznámá hodnota ručně zapsaná v Obsidianu → rozumný výchozí stav, soubor se nepřepisuje, dokud ho uživatel neuloží
      type: type.success ? type.data : 'side',
      status: status.success ? status.data : 'available',
      objectives: parseObjectives(data.objectives),
      questGiver: parseLink(data.questGiver),
      parentQuest: parseLink(data.parentQuest),
      rewards: Array.isArray(data.rewards) ? data.rewards.filter((r): r is string => typeof r === 'string' && r.trim() !== '').map(r => r.trim()) : [],
      characters: parseCharacterLinks(data.characters),
      threads: parseCharacterLinks(data.threads),
      factions: parseCharacterLinks(data.factions),
      locations: parseCharacterLinks(data.locations),
      description,
      outcome,
      notes,
      createdAt: toTimestamp(data.createdAt, stat.birthtimeMs),
      updatedAt: toTimestamp(data.updatedAt, stat.mtimeMs),
    }
  }

  private async readQuests(dir: string): Promise<QuestFile[]> {
    const questDir = path.join(dir, QUEST_DIR)
    const files = await listFiles(questDir, '.md')
    const quests: QuestFile[] = []
    for (const fileName of files) {
      const raw = await readTextIfExists(path.join(questDir, fileName))
      if (raw === null) continue
      const parsed = matter(raw)
      const stat = await fs.stat(path.join(questDir, fileName))
      const baseName = fileName.replace(/\.md$/i, '')
      quests.push({ fileName, data: parsed.data as Frontmatter, quest: this.questFromFrontmatter(parsed.data as Frontmatter, baseName, parsed.content, stat) })
    }
    // Nejnověji upravené nahoře; řazení podle stavu si dělá UI
    return quests.sort((a, b) => b.quest.updatedAt - a.quest.updatedAt || a.quest.title.localeCompare(b.quest.title, 'cs'))
  }

  private assertQuestTitleFree(existing: QuestFile[], title: string, exceptId?: string): void {
    const key = nameKey(title)
    if (existing.some(q => q.quest.id !== exceptId && nameKey(q.quest.title) === key)) {
      throw new ConflictError(`Quest „${title}“ už existuje. Zvol jiný název.`)
    }
  }

  private async writeQuestFile(dir: string, quest: Quest, extra: Frontmatter): Promise<void> {
    const data: Frontmatter = {
      ...extra,
      id: quest.id,
      title: quest.title,
      type: quest.type,
      status: quest.status,
      questGiver: quest.questGiver ? `[[${quest.questGiver}]]` : null,
      parentQuest: quest.parentQuest ? `[[${quest.parentQuest}]]` : null,
      // `optional` zapisujeme jen když platí, aby YAML zůstal čitelný
      objectives: quest.objectives.map(o => ({ id: o.id, title: o.title, status: o.status, ...(o.optional ? { optional: true } : {}) })),
      rewards: quest.rewards,
      characters: toCharacterLinks(quest.characters),
      threads: toCharacterLinks(quest.threads),
      factions: toCharacterLinks(quest.factions),
      locations: toCharacterLinks(quest.locations),
      createdAt: toIso(quest.createdAt),
      updatedAt: toIso(quest.updatedAt),
    }
    const description = quest.description.trim() ? `\n${quest.description.trimEnd()}\n` : ''
    const outcome = quest.outcome.trim() ? `\n<!-- outcome -->\n\n${quest.outcome.trimEnd()}\n` : ''
    const notes = quest.notes.trim() ? `\n<!-- notes -->\n\n${quest.notes.trimEnd()}\n` : ''
    await writeFileAtomic(path.join(dir, QUEST_DIR, `${safeFileName(quest.title)}.md`), matter.stringify(description + outcome + notes, data))
  }

  /** Názvy nití: jen existující (kanonický zápis), bez duplicit */
  private async normalizeQuestThreads(dir: string, titles: string[]): Promise<string[]> {
    const threads = await this.readThreads(dir)
    const result: string[] = []
    for (const title of titles) {
      const found = threads.find(t => nameKey(t.thread.title) === nameKey(title))
      if (found && !result.includes(found.thread.title)) result.push(found.thread.title)
    }
    return result
  }

  /**
   * Cíle questu: zachovat id existujících, novým přidělit `objective-<ts>-<n>`; prázdné názvy vypustit.
   * Pořadí vstupu = uložené pořadí.
   */
  private normalizeObjectives(input: QuestInput['objectives'], previous: QuestObjective[]): QuestObjective[] {
    const now = Date.now()
    const result: QuestObjective[] = []
    let counter = 0
    for (const item of input ?? []) {
      const title = item.title.trim()
      if (!title) continue
      const prev = item.id ? previous.find(o => o.id === item.id) : undefined
      let id = prev?.id ?? item.id ?? `objective-${now}-${++counter}`
      while (result.some(o => o.id === id)) id = `objective-${now}-${++counter}`
      result.push({ id, title, status: item.status ?? prev?.status ?? 'pending', optional: item.optional ?? prev?.optional ?? false })
    }
    return result
  }

  /** Nadřazený quest: musí existovat, nesmí být quest sám a nesmí vytvořit cyklus */
  private resolveParentQuest(quests: QuestFile[], selfId: string | undefined, selfTitle: string, title: string | null): string | null {
    if (!title) return null
    const parent = quests.find(q => nameKey(q.quest.title) === nameKey(title))
    if (!parent) return null
    if (parent.quest.id === selfId || nameKey(parent.quest.title) === nameKey(selfTitle)) {
      throw new ValidationError('Quest nemůže být nadřazený sám sobě.')
    }
    const seen = new Set<string>()
    let cursor: QuestFile | undefined = parent
    while (cursor?.quest.parentQuest) {
      if (seen.has(cursor.quest.id)) break
      seen.add(cursor.quest.id)
      const next = quests.find(q => q.quest.title === cursor!.quest.parentQuest)
      if (next && next.quest.id === selfId) {
        throw new ValidationError(`Quest „${parent.quest.title}“ je podřízený tomuto questu – vznikl by cyklus.`)
      }
      cursor = next
    }
    return parent.quest.title
  }

  /** Po přejmenování (newName) / smazání (null) postavy upravit zadavatele a postavy ve všech questech. */
  private async renameCharacterInQuests(dir: string, oldName: string, newName: string | null): Promise<void> {
    for (const file of await this.readQuests(dir)) {
      const q = file.quest
      if (q.questGiver !== oldName && !q.characters.includes(oldName)) continue
      await this.writeQuestFile(dir, {
        ...q,
        questGiver: q.questGiver === oldName ? newName : q.questGiver,
        characters: q.characters.flatMap(n => (n === oldName ? (newName ? [newName] : []) : [n])),
      }, file.data)
    }
  }

  /** Po přejmenování (newTitle) / smazání (null) nitě upravit vazby ve všech questech. */
  private async renameThreadInQuests(dir: string, oldTitle: string, newTitle: string | null): Promise<void> {
    for (const file of await this.readQuests(dir)) {
      if (!file.quest.threads.includes(oldTitle)) continue
      const threads = file.quest.threads.flatMap(n => (n === oldTitle ? (newTitle ? [newTitle] : []) : [n]))
      await this.writeQuestFile(dir, { ...file.quest, threads }, file.data)
    }
  }

  /** Po přejmenování (newTitle) / smazání (null) frakce upravit vazby ve všech questech. */
  private async renameFactionInQuests(dir: string, oldTitle: string, newTitle: string | null): Promise<void> {
    for (const file of await this.readQuests(dir)) {
      if (!file.quest.factions.includes(oldTitle)) continue
      const factions = file.quest.factions.flatMap(n => (n === oldTitle ? (newTitle ? [newTitle] : []) : [n]))
      await this.writeQuestFile(dir, { ...file.quest, factions }, file.data)
    }
  }

  /** Po přejmenování (newTitle) / smazání (null) questu upravit nadřazený quest v ostatních questech. */
  private async renameQuestInQuests(dir: string, oldTitle: string, newTitle: string | null): Promise<void> {
    for (const file of await this.readQuests(dir)) {
      if (file.quest.parentQuest !== oldTitle) continue
      await this.writeQuestFile(dir, { ...file.quest, parentQuest: newTitle }, file.data)
    }
  }

  /** Po přejmenování (newTitle) / smazání (null) lokace upravit vazby ve všech questech. */
  private async renameLocationInQuests(dir: string, oldTitle: string, newTitle: string | null): Promise<void> {
    for (const file of await this.readQuests(dir)) {
      if (!file.quest.locations.includes(oldTitle)) continue
      await this.writeQuestFile(dir, { ...file.quest, locations: replaceRef(file.quest.locations, oldTitle, newTitle) }, file.data)
    }
  }

  async listQuests(name: string): Promise<Quest[]> {
    const dir = await this.requireGameDir(name)
    return (await this.readQuests(dir)).map(q => q.quest)
  }

  async createQuest(gameName: string, input: QuestInput): Promise<Quest> {
    const dir = await this.requireGameDir(gameName)
    await ensureDir(path.join(dir, QUEST_DIR))
    const existing = await this.readQuests(dir)
    const title = input.title.trim()
    this.assertQuestTitleFree(existing, title)
    const now = Date.now()
    const quest: Quest = {
      id: `quest-${now}`,
      title,
      type: input.type,
      status: input.status ?? 'available',
      objectives: this.normalizeObjectives(input.objectives, []),
      questGiver: await this.normalizeCharacterRef(dir, input.questGiver ?? null),
      parentQuest: this.resolveParentQuest(existing, undefined, title, input.parentQuest ?? null),
      rewards: (input.rewards ?? []).map(r => r.trim()).filter(Boolean),
      characters: await this.normalizeSceneCharacters(dir, input.characters ?? []),
      threads: await this.normalizeQuestThreads(dir, input.threads ?? []),
      factions: await this.normalizeThreadFactions(dir, input.factions ?? []),
      locations: await this.normalizeLocationRefs(dir, input.locations ?? []),
      description: input.description ?? '',
      outcome: input.outcome ?? '',
      notes: input.notes ?? '',
      createdAt: now,
      updatedAt: now,
    }
    await this.writeQuestFile(dir, quest, {})
    await this.touchGame(dir)
    return quest
  }

  async updateQuest(gameName: string, questId: string, input: QuestInput): Promise<Quest> {
    const dir = await this.requireGameDir(gameName)
    const existing = await this.readQuests(dir)
    const current = existing.find(q => q.quest.id === questId)
    if (!current) throw new NotFoundError(`Quest „${questId}“ neexistuje.`)
    const previous = current.quest
    const title = input.title.trim()
    this.assertQuestTitleFree(existing, title, questId)

    // Název = název souboru; id zůstává
    if (title !== previous.title) await removeIfExists(path.join(dir, QUEST_DIR, current.fileName))

    const quest: Quest = {
      ...previous,
      title,
      type: input.type,
      status: input.status ?? previous.status,
      objectives: input.objectives ? this.normalizeObjectives(input.objectives, previous.objectives) : previous.objectives,
      questGiver: input.questGiver === undefined ? previous.questGiver : await this.normalizeCharacterRef(dir, input.questGiver),
      parentQuest: input.parentQuest === undefined
        ? previous.parentQuest
        : this.resolveParentQuest(existing, questId, title, input.parentQuest),
      rewards: input.rewards ? input.rewards.map(r => r.trim()).filter(Boolean) : previous.rewards,
      characters: input.characters ? await this.normalizeSceneCharacters(dir, input.characters) : previous.characters,
      threads: input.threads ? await this.normalizeQuestThreads(dir, input.threads) : previous.threads,
      factions: input.factions ? await this.normalizeThreadFactions(dir, input.factions) : previous.factions,
      locations: input.locations ? await this.normalizeLocationRefs(dir, input.locations) : previous.locations,
      description: input.description ?? previous.description,
      outcome: input.outcome ?? previous.outcome,
      notes: input.notes ?? previous.notes,
      updatedAt: Date.now(),
    }
    await this.writeQuestFile(dir, quest, current.data)
    if (title !== previous.title) await this.renameQuestInQuests(dir, previous.title, title)
    if (title !== previous.title) await this.renameRefInLore(dir, 'quests', previous.title, title)
    await this.touchGame(dir)
    return quest
  }

  async deleteQuest(gameName: string, questId: string): Promise<void> {
    const dir = await this.requireGameDir(gameName)
    const existing = await this.readQuests(dir)
    const current = existing.find(q => q.quest.id === questId)
    if (!current) throw new NotFoundError(`Quest „${questId}“ neexistuje.`)
    await removeIfExists(path.join(dir, QUEST_DIR, current.fileName))
    // Podřízené questy zůstávají, jen ztratí rodiče; nitě a frakce se nemění
    await this.renameQuestInQuests(dir, current.quest.title, null)
    await this.renameRefInLore(dir, 'quests', current.quest.title, null)
    await this.touchGame(dir)
  }

  // ---------- lokace (locations) ----------

  private locationFromFrontmatter(data: Frontmatter, baseName: string, body: string, stat: { birthtimeMs: number; mtimeMs: number }): StoryLocation {
    const type = LocationTypeSchema.safeParse(data.type)
    const status = LocationStatusSchema.safeParse(data.status)
    const { description, secrets } = splitFactionBody(body)
    return {
      id: stringOrNull(data.id) ?? baseName,
      title: stringOrNull(data.title) ?? baseName,
      // Neznámá hodnota ručně zapsaná v Obsidianu → rozumný výchozí stav, soubor se nepřepisuje, dokud ho uživatel neuloží
      type: type.success ? type.data : 'other',
      status: status.success ? status.data : 'known',
      parentLocation: parseLink(data.parentLocation),
      image: stringOrNull(data.image),
      description,
      secrets,
      createdAt: toTimestamp(data.createdAt, stat.birthtimeMs),
      updatedAt: toTimestamp(data.updatedAt, stat.mtimeMs),
    }
  }

  private async readLocations(dir: string): Promise<LocationFile[]> {
    const locationDir = path.join(dir, LOCATION_DIR)
    const files = await listFiles(locationDir, '.md')
    const locations: LocationFile[] = []
    for (const fileName of files) {
      const raw = await readTextIfExists(path.join(locationDir, fileName))
      if (raw === null) continue
      const parsed = matter(raw)
      const stat = await fs.stat(path.join(locationDir, fileName))
      const baseName = fileName.replace(/\.md$/i, '')
      locations.push({ fileName, data: parsed.data as Frontmatter, location: this.locationFromFrontmatter(parsed.data as Frontmatter, baseName, parsed.content, stat) })
    }
    return locations.sort((a, b) => a.location.title.localeCompare(b.location.title, 'cs'))
  }

  private assertLocationTitleFree(existing: LocationFile[], title: string, exceptId?: string): void {
    const key = nameKey(title)
    if (existing.some(l => l.location.id !== exceptId && nameKey(l.location.title) === key)) {
      throw new ConflictError(`Lokace „${title}“ už existuje. Zvol jiný název.`)
    }
  }

  private async writeLocationFile(dir: string, location: StoryLocation, extra: Frontmatter): Promise<void> {
    const data: Frontmatter = {
      ...extra,
      id: location.id,
      title: location.title,
      type: location.type,
      status: location.status,
      parentLocation: location.parentLocation ? `[[${location.parentLocation}]]` : null,
      image: location.image,
      createdAt: toIso(location.createdAt),
      updatedAt: toIso(location.updatedAt),
    }
    const description = location.description.trim() ? `\n${location.description.trimEnd()}\n` : ''
    const secrets = location.secrets.trim() ? `\n<!-- secrets -->\n\n${location.secrets.trimEnd()}\n` : ''
    await writeFileAtomic(path.join(dir, LOCATION_DIR, `${safeFileName(location.title)}.md`), matter.stringify(description + secrets, data))
  }

  /** Názvy lokací: jen existující (kanonický zápis), bez duplicit */
  private async normalizeLocationRefs(dir: string, titles: string[]): Promise<string[]> {
    const locations = await this.readLocations(dir)
    const result: string[] = []
    for (const title of titles) {
      const found = locations.find(l => nameKey(l.location.title) === nameKey(title))
      if (found && !result.includes(found.location.title)) result.push(found.location.title)
    }
    return result
  }

  /** Jedna lokace: jen existující (kanonický zápis), jinak null */
  private async normalizeLocationRef(dir: string, title: string | null): Promise<string | null> {
    if (!title) return null
    return (await this.normalizeLocationRefs(dir, [title]))[0] ?? null
  }

  /** Nadřazená lokace: musí existovat, nesmí být lokace sama a nesmí vytvořit cyklus */
  private resolveParentLocation(locations: LocationFile[], selfId: string | undefined, selfTitle: string, title: string | null): string | null {
    if (!title) return null
    const parent = locations.find(l => nameKey(l.location.title) === nameKey(title))
    if (!parent) return null
    if (parent.location.id === selfId || nameKey(parent.location.title) === nameKey(selfTitle)) {
      throw new ValidationError('Lokace nemůže být nadřazená sama sobě.')
    }
    const seen = new Set<string>()
    let cursor: LocationFile | undefined = parent
    while (cursor?.location.parentLocation) {
      if (seen.has(cursor.location.id)) break
      seen.add(cursor.location.id)
      const next = locations.find(l => l.location.title === cursor!.location.parentLocation)
      if (next && next.location.id === selfId) {
        throw new ValidationError(`Lokace „${parent.location.title}“ leží uvnitř této lokace – vznikl by cyklus.`)
      }
      cursor = next
    }
    return parent.location.title
  }

  /** Po přejmenování (newTitle) / smazání (null) lokace upravit nadřazenou lokaci v ostatních lokacích. */
  private async renameLocationInLocations(dir: string, oldTitle: string, newTitle: string | null): Promise<void> {
    for (const file of await this.readLocations(dir)) {
      if (file.location.parentLocation !== oldTitle) continue
      await this.writeLocationFile(dir, { ...file.location, parentLocation: newTitle }, file.data)
    }
  }

  /** Po přejmenování (newTitle) / smazání (null) lokace upravit vazbu ve všech scénách. */
  private async renameLocationInScenes(dir: string, oldTitle: string, newTitle: string | null): Promise<void> {
    for (const scene of await this.readScenes(dir)) {
      if (scene.meta.location !== oldTitle) continue
      await this.writeSceneFile(dir, { ...scene.meta, location: newTitle }, scene.entriesBody, scene.data)
    }
  }

  /** Přejmenování/smazání lokace promítnout do všech entit, které na ni odkazují */
  private async renameLocationEverywhere(dir: string, oldTitle: string, newTitle: string | null): Promise<void> {
    await this.renameLocationInLocations(dir, oldTitle, newTitle)
    await this.renameLocationInScenes(dir, oldTitle, newTitle)
    await this.renameLocationInThreads(dir, oldTitle, newTitle)
    await this.renameLocationInFactions(dir, oldTitle, newTitle)
    await this.renameLocationInQuests(dir, oldTitle, newTitle)
    await this.renameRefInLore(dir, 'locations', oldTitle, newTitle)
  }

  /** Smaže obrázek lokace ve vaultu, pokud ho nepoužívá jiná lokace. */
  private async removeLocationImageIfUnused(dir: string, image: string, locations: LocationFile[], exceptId: string): Promise<void> {
    if (isRemoteImage(image) || !image.startsWith(`${LOCATION_IMAGE_DIR}/`)) return
    const used = locations.some(l => l.location.id !== exceptId && l.location.image === image)
    if (!used) await removeIfExists(path.join(dir, image))
  }

  async listLocations(name: string): Promise<StoryLocation[]> {
    const dir = await this.requireGameDir(name)
    return (await this.readLocations(dir)).map(l => l.location)
  }

  async createLocation(gameName: string, input: LocationInput): Promise<StoryLocation> {
    const dir = await this.requireGameDir(gameName)
    await ensureDir(path.join(dir, LOCATION_DIR))
    const existing = await this.readLocations(dir)
    const title = input.title.trim()
    this.assertLocationTitleFree(existing, title)
    const now = Date.now()
    const location: StoryLocation = {
      id: `location-${now}`,
      title,
      type: input.type,
      status: input.status ?? 'known',
      parentLocation: this.resolveParentLocation(existing, undefined, title, input.parentLocation ?? null),
      image: input.image ?? null,
      description: input.description ?? '',
      secrets: input.secrets ?? '',
      createdAt: now,
      updatedAt: now,
    }
    await this.writeLocationFile(dir, location, {})
    await this.touchGame(dir)
    return location
  }

  async updateLocation(gameName: string, locationId: string, input: LocationInput): Promise<StoryLocation> {
    const dir = await this.requireGameDir(gameName)
    const existing = await this.readLocations(dir)
    const current = existing.find(l => l.location.id === locationId)
    if (!current) throw new NotFoundError(`Lokace „${locationId}“ neexistuje.`)
    const previous = current.location
    const title = input.title.trim()
    this.assertLocationTitleFree(existing, title, locationId)

    let image = input.image === undefined ? previous.image : input.image

    // Název = název souboru; id zůstává
    if (title !== previous.title) {
      await removeIfExists(path.join(dir, LOCATION_DIR, current.fileName))
      // Obrázek ve vaultu nese název → přejmenovat spolu s lokací
      if (previous.image && image === previous.image && previous.image.startsWith(`${LOCATION_IMAGE_DIR}/`) && (await exists(path.join(dir, previous.image)))) {
        const ext = path.extname(previous.image)
        const base = safeFileName(title, 'lokace')
        await this.removeSiblingsWithOtherExt(path.join(dir, LOCATION_IMAGE_DIR), base, ext)
        const target = `${LOCATION_IMAGE_DIR}/${base}${ext}`
        await fs.rename(path.join(dir, previous.image), path.join(dir, target))
        image = target
      }
    }
    if (previous.image && image !== previous.image) {
      await this.removeLocationImageIfUnused(dir, previous.image, existing, locationId)
    }

    const location: StoryLocation = {
      ...previous,
      title,
      type: input.type,
      status: input.status ?? previous.status,
      parentLocation: input.parentLocation === undefined
        ? previous.parentLocation
        : this.resolveParentLocation(existing, locationId, title, input.parentLocation),
      image,
      description: input.description ?? previous.description,
      secrets: input.secrets ?? previous.secrets,
      updatedAt: Date.now(),
    }
    await this.writeLocationFile(dir, location, current.data)
    if (title !== previous.title) await this.renameLocationEverywhere(dir, previous.title, title)
    await this.touchGame(dir)
    return location
  }

  async deleteLocation(gameName: string, locationId: string): Promise<void> {
    const dir = await this.requireGameDir(gameName)
    const existing = await this.readLocations(dir)
    const current = existing.find(l => l.location.id === locationId)
    if (!current) throw new NotFoundError(`Lokace „${locationId}“ neexistuje.`)
    await removeIfExists(path.join(dir, LOCATION_DIR, current.fileName))
    if (current.location.image) await this.removeLocationImageIfUnused(dir, current.location.image, existing, locationId)
    // Podřízené lokace zůstávají, jen ztratí rodiče; vazby v ostatních entitách se odeberou
    await this.renameLocationEverywhere(dir, current.location.title, null)
    await this.touchGame(dir)
  }

  // ---------- lore ----------

  private loreFromFrontmatter(data: Frontmatter, baseName: string, body: string, stat: { birthtimeMs: number; mtimeMs: number }): LoreEntry {
    const type = LoreTypeSchema.safeParse(data.type)
    const truth = LoreTruthSchema.safeParse(data.truth)
    const knowledge = LoreKnowledgeSchema.safeParse(data.knowledge)
    const { description, secrets } = splitFactionBody(body)
    return {
      id: stringOrNull(data.id) ?? baseName,
      title: stringOrNull(data.title) ?? baseName,
      // Neznámá hodnota ručně zapsaná v Obsidianu → rozumný výchozí stav, soubor se nepřepisuje, dokud ho uživatel neuloží
      type: type.success ? type.data : 'other',
      truth: truth.success ? truth.data : 'unknown',
      knowledge: knowledge.success ? knowledge.data : 'known',
      characters: parseCharacterLinks(data.characters),
      locations: parseCharacterLinks(data.locations),
      factions: parseCharacterLinks(data.factions),
      quests: parseCharacterLinks(data.quests),
      threads: parseCharacterLinks(data.threads),
      content: description,
      secrets,
      createdAt: toTimestamp(data.createdAt, stat.birthtimeMs),
      updatedAt: toTimestamp(data.updatedAt, stat.mtimeMs),
    }
  }

  private async readLore(dir: string): Promise<LoreFile[]> {
    const loreDir = path.join(dir, LORE_DIR)
    const files = await listFiles(loreDir, '.md')
    const entries: LoreFile[] = []
    for (const fileName of files) {
      const raw = await readTextIfExists(path.join(loreDir, fileName))
      if (raw === null) continue
      const parsed = matter(raw)
      const stat = await fs.stat(path.join(loreDir, fileName))
      const baseName = fileName.replace(/\.md$/i, '')
      entries.push({ fileName, data: parsed.data as Frontmatter, lore: this.loreFromFrontmatter(parsed.data as Frontmatter, baseName, parsed.content, stat) })
    }
    return entries.sort((a, b) => a.lore.title.localeCompare(b.lore.title, 'cs'))
  }

  private assertLoreTitleFree(existing: LoreFile[], title: string, exceptId?: string): void {
    const key = nameKey(title)
    if (existing.some(l => l.lore.id !== exceptId && nameKey(l.lore.title) === key)) {
      throw new ConflictError(`Záznam lore „${title}“ už existuje. Zvol jiný název.`)
    }
  }

  private async writeLoreFile(dir: string, lore: LoreEntry, extra: Frontmatter): Promise<void> {
    const data: Frontmatter = {
      ...extra,
      id: lore.id,
      title: lore.title,
      type: lore.type,
      truth: lore.truth,
      knowledge: lore.knowledge,
      characters: toCharacterLinks(lore.characters),
      locations: toCharacterLinks(lore.locations),
      factions: toCharacterLinks(lore.factions),
      quests: toCharacterLinks(lore.quests),
      threads: toCharacterLinks(lore.threads),
      createdAt: toIso(lore.createdAt),
      updatedAt: toIso(lore.updatedAt),
    }
    const content = lore.content.trim() ? `\n${lore.content.trimEnd()}\n` : ''
    const secrets = lore.secrets.trim() ? `\n<!-- secrets -->\n\n${lore.secrets.trimEnd()}\n` : ''
    await writeFileAtomic(path.join(dir, LORE_DIR, `${safeFileName(lore.title)}.md`), matter.stringify(content + secrets, data))
  }

  /** Názvy questů: jen existující (kanonický zápis), bez duplicit */
  private async normalizeQuestRefs(dir: string, titles: string[]): Promise<string[]> {
    const quests = await this.readQuests(dir)
    const result: string[] = []
    for (const title of titles) {
      const found = quests.find(q => nameKey(q.quest.title) === nameKey(title))
      if (found && !result.includes(found.quest.title)) result.push(found.quest.title)
    }
    return result
  }

  /** Po přejmenování (newTitle) / smazání (null) entity upravit daný seznam vazeb ve všech záznamech lore. */
  private async renameRefInLore(dir: string, field: 'characters' | 'locations' | 'factions' | 'quests' | 'threads', oldTitle: string, newTitle: string | null): Promise<void> {
    for (const file of await this.readLore(dir)) {
      if (!file.lore[field].includes(oldTitle)) continue
      await this.writeLoreFile(dir, { ...file.lore, [field]: replaceRef(file.lore[field], oldTitle, newTitle) }, file.data)
    }
  }

  async listLore(name: string): Promise<LoreEntry[]> {
    const dir = await this.requireGameDir(name)
    return (await this.readLore(dir)).map(l => l.lore)
  }

  async createLore(gameName: string, input: LoreInput): Promise<LoreEntry> {
    const dir = await this.requireGameDir(gameName)
    await ensureDir(path.join(dir, LORE_DIR))
    const existing = await this.readLore(dir)
    const title = input.title.trim()
    this.assertLoreTitleFree(existing, title)
    const now = Date.now()
    const lore: LoreEntry = {
      id: `lore-${now}`,
      title,
      type: input.type,
      truth: input.truth ?? 'unknown',
      knowledge: input.knowledge ?? 'known',
      characters: await this.normalizeSceneCharacters(dir, input.characters ?? []),
      locations: await this.normalizeLocationRefs(dir, input.locations ?? []),
      factions: await this.normalizeThreadFactions(dir, input.factions ?? []),
      quests: await this.normalizeQuestRefs(dir, input.quests ?? []),
      threads: await this.normalizeQuestThreads(dir, input.threads ?? []),
      content: input.content ?? '',
      secrets: input.secrets ?? '',
      createdAt: now,
      updatedAt: now,
    }
    await this.writeLoreFile(dir, lore, {})
    await this.touchGame(dir)
    return lore
  }

  async updateLore(gameName: string, loreId: string, input: LoreInput): Promise<LoreEntry> {
    const dir = await this.requireGameDir(gameName)
    const existing = await this.readLore(dir)
    const current = existing.find(l => l.lore.id === loreId)
    if (!current) throw new NotFoundError(`Záznam lore „${loreId}“ neexistuje.`)
    const previous = current.lore
    const title = input.title.trim()
    this.assertLoreTitleFree(existing, title, loreId)

    // Název = název souboru; id zůstává
    if (title !== previous.title) await removeIfExists(path.join(dir, LORE_DIR, current.fileName))

    const lore: LoreEntry = {
      ...previous,
      title,
      type: input.type,
      truth: input.truth ?? previous.truth,
      knowledge: input.knowledge ?? previous.knowledge,
      characters: input.characters ? await this.normalizeSceneCharacters(dir, input.characters) : previous.characters,
      locations: input.locations ? await this.normalizeLocationRefs(dir, input.locations) : previous.locations,
      factions: input.factions ? await this.normalizeThreadFactions(dir, input.factions) : previous.factions,
      quests: input.quests ? await this.normalizeQuestRefs(dir, input.quests) : previous.quests,
      threads: input.threads ? await this.normalizeQuestThreads(dir, input.threads) : previous.threads,
      content: input.content ?? previous.content,
      secrets: input.secrets ?? previous.secrets,
      updatedAt: Date.now(),
    }
    await this.writeLoreFile(dir, lore, current.data)
    await this.touchGame(dir)
    return lore
  }

  async deleteLore(gameName: string, loreId: string): Promise<void> {
    const dir = await this.requireGameDir(gameName)
    const existing = await this.readLore(dir)
    const current = existing.find(l => l.lore.id === loreId)
    if (!current) throw new NotFoundError(`Záznam lore „${loreId}“ neexistuje.`)
    // Na lore nic neodkazuje (vazby vlastní záznam sám) – stačí smazat soubor
    await removeIfExists(path.join(dir, LORE_DIR, current.fileName))
    await this.touchGame(dir)
  }

  // ---------- herní sezení (sessions.md) ----------

  private async readSessions(dir: string): Promise<GameSession[]> {
    const raw = await readTextIfExists(path.join(dir, SESSIONS_FILE))
    return raw === null ? [] : parseSessions(raw)
  }

  private async writeSessions(dir: string, sessions: GameSession[]): Promise<void> {
    await writeFileAtomic(path.join(dir, SESSIONS_FILE), serializeSessions(sessions))
  }

  async listSessions(name: string): Promise<GameSession[]> {
    const dir = await this.requireGameDir(name)
    return this.readSessions(dir)
  }

  async createSession(gameName: string, input: GameSessionInput): Promise<GameSession> {
    const dir = await this.requireGameDir(gameName)
    const existing = await this.readSessions(dir)
    // Id = začátek v ms; při kolizi (dvě sezení ve stejné ms) posunout o 1 ms
    let startedAt = input.startedAt
    while (existing.some(s => s.startedAt === startedAt)) startedAt++
    const session: GameSession = {
      id: sessionId(startedAt),
      startedAt,
      endedAt: Date.now(),
      durationSeconds: input.durationSeconds,
      fun: input.fun,
      description: input.description?.trim() ?? '',
    }
    await this.writeSessions(dir, [...existing, session])
    await this.touchGame(dir)
    return session
  }

  async updateSession(gameName: string, id: string, input: GameSessionInput): Promise<GameSession> {
    const dir = await this.requireGameDir(gameName)
    const existing = await this.readSessions(dir)
    const current = existing.find(s => s.id === id)
    if (!current) throw new NotFoundError(`Sezení „${id}“ neexistuje.`)
    if (input.startedAt !== current.startedAt && existing.some(s => s.startedAt === input.startedAt)) {
      throw new ConflictError('Sezení se stejným začátkem už existuje.')
    }
    const session: GameSession = {
      ...current,
      id: sessionId(input.startedAt),
      startedAt: input.startedAt,
      durationSeconds: input.durationSeconds,
      fun: input.fun,
      description: input.description?.trim() ?? current.description,
    }
    await this.writeSessions(dir, existing.map(s => (s.id === id ? session : s)))
    await this.touchGame(dir)
    return session
  }

  async deleteSession(gameName: string, id: string): Promise<void> {
    const dir = await this.requireGameDir(gameName)
    const existing = await this.readSessions(dir)
    if (!existing.some(s => s.id === id)) throw new NotFoundError(`Sezení „${id}“ neexistuje.`)
    await this.writeSessions(dir, existing.filter(s => s.id !== id))
    await this.touchGame(dir)
  }
}
