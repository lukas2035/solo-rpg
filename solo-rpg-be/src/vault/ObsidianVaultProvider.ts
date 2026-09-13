import fs from 'node:fs/promises'
import path from 'node:path'
import matter from 'gray-matter'
import {
  fullName,
  isValidGameName,
  isRemoteImage,
  type Character,
  type CharacterInput,
  type GameDetail,
  type GameMeta,
  type GameSettings,
  type GameSetup,
  type SceneMeta,
  type StoryEntry,
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

const GAME_FILE = 'game.md'
const CHARACTER_DIR = 'characters'
/** Původní název složky postav – při čtení se automaticky přejmenuje na `characters` */
const LEGACY_CHARACTER_DIR = 'npcs'
const PORTRAIT_DIR = 'portraits'
const BACKGROUND_DIR = 'backgrounds'
const SCENE_DIR = 'scenes'
const DEFAULT_DM_NAME = 'DM'
const DEFAULT_SCENE_TITLE = 'Scéna 1'

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

interface SceneFile {
  fileName: string
  data: Frontmatter
  body: string
  meta: SceneMeta
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
 * Úložiště her ve struktuře čitelné Obsidianem:
 *
 * <vault>/<Hra>/game.md, characters/*.md, portraits/, backgrounds/, scenes/*.md
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

  private setupFromGameFile(file: GameFile, characters: Character[]): GameSetup {
    const dm = (typeof file.data.dm === 'object' && file.data.dm !== null ? file.data.dm : {}) as Frontmatter
    return {
      characters,
      backgroundImage: stringOrNull(file.data.background),
      brightBackground: file.data.brightBackground === true,
      dm: {
        name: stringOrNull(dm.name) ?? DEFAULT_DM_NAME,
        image: stringOrNull(dm.portrait),
      },
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
    await Promise.all([CHARACTER_DIR, PORTRAIT_DIR, BACKGROUND_DIR, SCENE_DIR].map(sub => ensureDir(path.join(dir, sub))))
    await this.writeGameFile(dir, {
      data: {
        name: trimmed,
        createdAt: now,
        updatedAt: now,
        background: null,
        brightBackground: false,
        dm: { name: DEFAULT_DM_NAME, portrait: null },
      },
      body: `# ${trimmed}\n\nPoznámky ke hře (volný text, aplikace jej nemění).\n`,
    })
    await this.createScene(trimmed, DEFAULT_SCENE_TITLE)
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
    const file = await this.readGameFile(dir)
    if (!file) return null
    const stat = await fs.stat(path.join(dir, GAME_FILE))
    const characters = await this.readCharacters(dir)
    let scenes = await this.listScenes(name)
    if (scenes.length === 0) {
      await this.createScene(name, DEFAULT_SCENE_TITLE)
      scenes = await this.listScenes(name)
    }
    return {
      meta: this.metaFromGameFile(name.trim(), file, stat),
      setup: this.setupFromGameFile(file, characters.map(c => c.character)),
      scenes,
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

  /** Smaže portrét ve vaultu, pokud ho nepoužívá jiná postava ani vypravěč. */
  private async removePortraitIfUnused(dir: string, portrait: string, characters: CharacterFile[], exceptId: string): Promise<void> {
    if (isRemoteImage(portrait) || !portrait.startsWith(`${PORTRAIT_DIR}/`)) return
    const game = await this.readGameFile(dir)
    const dmPortrait = stringOrNull((game?.data.dm as Frontmatter | undefined)?.portrait)
    const used = characters.some(c => c.character.id !== exceptId && c.character.image === portrait) || dmPortrait === portrait
    if (!used) await removeIfExists(path.join(dir, portrait))
  }

  /** Po přejmenování postavy / změně nicku přepsat hlavičky mluvčího ve všech scénách. */
  private async renameSpeakerInScenes(dir: string, oldName: string, newName: string, nickname: string): Promise<void> {
    for (const scene of await this.readScenes(dir)) {
      const body = renameSpeaker(scene.body, oldName, newName, nickname)
      if (body === null) continue
      await writeFileAtomic(path.join(dir, SCENE_DIR, scene.fileName), matter.stringify(body, scene.data))
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
    await this.touchGame(dir)
  }

  // ---------- setup (pozadí, DM) ----------

  async saveSetup(name: string, settings: GameSettings): Promise<GameSetup> {
    const dir = await this.requireGameDir(name)
    await this.touchGame(dir, file => {
      file.data.background = settings.backgroundImage
      file.data.brightBackground = settings.brightBackground
      file.data.dm = { name: settings.dm.name, portrait: settings.dm.image }
    })
    const characters = await this.readCharacters(dir)
    const file = await this.readGameFile(dir)
    return this.setupFromGameFile(file!, characters.map(c => c.character))
  }

  // ---------- obrázky ----------

  async saveAsset(name: string, asset: AssetInput): Promise<string> {
    const dir = await this.requireGameDir(name)
    const ext = imageExtension(asset.filename, asset.mimeType)
    let relPath: string

    switch (asset.kind) {
      case 'portrait': {
        const base = safeFileName(asset.characterName ?? '', 'postava')
        relPath = `${PORTRAIT_DIR}/${base}${ext}`
        await this.removeSiblingsWithOtherExt(path.join(dir, PORTRAIT_DIR), base, ext)
        break
      }
      case 'dm': {
        relPath = `${PORTRAIT_DIR}/_dm${ext}`
        await this.removeSiblingsWithOtherExt(path.join(dir, PORTRAIT_DIR), '_dm', ext)
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
    for (const [index, fileName] of files.entries()) {
      const raw = await readTextIfExists(path.join(sceneDir, fileName))
      if (raw === null) continue
      const parsed = matter(raw)
      const data = parsed.data as Frontmatter
      const stat = await fs.stat(path.join(sceneDir, fileName))
      const baseName = fileName.replace(/\.md$/i, '')
      const orderFromName = parseInt(baseName, 10)
      scenes.push({
        fileName,
        data,
        body: parsed.content,
        meta: {
          id: stringOrNull(data.id) ?? baseName,
          title: stringOrNull(data.title) ?? baseName.replace(/^\d+\s*-\s*/, ''),
          order: typeof data.order === 'number' ? data.order : Number.isFinite(orderFromName) ? orderFromName : index + 1,
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

  async listScenes(name: string): Promise<SceneMeta[]> {
    const dir = await this.requireGameDir(name)
    return (await this.readScenes(dir)).map(s => s.meta)
  }

  async createScene(name: string, title: string): Promise<SceneMeta> {
    const dir = await this.requireGameDir(name)
    const scenes = await this.readScenes(dir)
    const order = scenes.reduce((max, s) => Math.max(max, s.meta.order), 0) + 1
    const now = Date.now()
    const meta: SceneMeta = { id: `scene-${now}`, title: title.trim(), order, createdAt: now, updatedAt: now }
    const filePath = path.join(dir, SCENE_DIR, this.sceneFileName(order, meta.title))
    await writeFileAtomic(
      filePath,
      matter.stringify('', { id: meta.id, title: meta.title, order, createdAt: toIso(now), updatedAt: toIso(now) })
    )
    await this.touchGame(dir)
    return meta
  }

  async getSceneEntries(name: string, sceneId: string): Promise<StoryEntry[] | null> {
    const dir = await this.requireGameDir(name)
    const scene = await this.findScene(dir, sceneId)
    if (!scene) return null
    const game = await this.readGameFile(dir)
    const dmName = stringOrNull((game?.data.dm as Frontmatter | undefined)?.name) ?? DEFAULT_DM_NAME
    const characters = await this.readCharacters(dir)
    // Ručně dopsané repliky mohou používat celé jméno i nickname
    const knownSpeakers = characters.flatMap(c => [c.character.name, c.character.nickname])
    return parseEntries(scene.body, dmName, knownSpeakers)
  }

  async saveSceneEntries(name: string, sceneId: string, entries: StoryEntry[]): Promise<void> {
    const dir = await this.requireGameDir(name)
    const scene = await this.findScene(dir, sceneId)
    if (!scene) throw new NotFoundError(`Scéna „${sceneId}“ neexistuje.`)
    const game = await this.readGameFile(dir)
    const dmName = stringOrNull((game?.data.dm as Frontmatter | undefined)?.name) ?? DEFAULT_DM_NAME
    const characters = await this.readCharacters(dir)
    const nicknames = new Map(characters.map(c => [c.character.name, c.character.nickname]))

    const body = `\n${serializeEntries(entries, dmName, nicknames)}`
    const data: Frontmatter = { ...scene.data, id: scene.meta.id, title: scene.meta.title, order: scene.meta.order, updatedAt: toIso(Date.now()) }
    if (!data.createdAt) data.createdAt = toIso(scene.meta.createdAt)
    await writeFileAtomic(path.join(dir, SCENE_DIR, scene.fileName), matter.stringify(body, data))
    await this.touchGame(dir)
  }

  async deleteScene(name: string, sceneId: string): Promise<void> {
    const dir = await this.requireGameDir(name)
    const scene = await this.findScene(dir, sceneId)
    if (!scene) throw new NotFoundError(`Scéna „${sceneId}“ neexistuje.`)
    await removeIfExists(path.join(dir, SCENE_DIR, scene.fileName))
    await this.touchGame(dir)
  }
}
