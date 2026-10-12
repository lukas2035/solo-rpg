import type { Character, Narrator, SceneMeta, StoryEntry } from '@solo-rpg/shared'
import { transcriptCutoff } from '../narrative/contextBuilder.js'
import type { ChatMessage } from './types.js'

/**
 * Sestavení požadavku pro AI vypravěče a parsování jeho odpovědi.
 *
 * Pořadí částí požadavku (domluvené):
 *  1. výchozí prompt pro vedení scény (soubor `prompts/scene-prompt.md`) + při zapnutém `rulesInAi` sekce o kostkách/pravidlech
 *     (`prompts/rules-prompt.md` + popis pravidel hry) – system zpráva
 *  2. postavy hráče a postavy hrané AI (s popisem, pokud je)
 *  3. popis scény (+ volitelný doplňující popis situace ze scény `aiPrompt`)
 *  3b. kontext kampaně vybraný `narrative/contextBuilder.ts` (shrnutí předchozích scén, lokace, questy, nitě, frakce, lore, tajemství)
 *  4. dosavadní průběh scény ve formátu „kopírovat do schránky“ (`**Jméno**: text`), ořezaný na rozpočet tokenů od nejstarších
 *  5. doplňkový prompt aktuálního vypravěče
 *  6. důvody odmítnutí předchozích návrhů ve scéně (jsou-li)
 * Odpověď modelu = řádky `Jméno: text`, které se převedou na záznamy scény.
 */

export interface ScenePromptContext {
  defaultPrompt: string
  /** Sekce o kostkách a pravidlech (viz `rulesPrompt.ts`); prázdná = nepřipojí se nic */
  rulesPrompt?: string
  narrator: Narrator
  scene: SceneMeta
  /** Postavy scény hrané hráčem */
  playerCharacters: Character[]
  /** Postavy scény hrané AI */
  aiCharacters: Character[]
  entries: StoryEntry[]
  /** Hotové sekce kontextu kampaně z `narrative/contextBuilder.ts` (vloží se mezi scénu a přepis) */
  contextSections?: string[]
  /** Důvody, proč hráč odmítl předchozí návrhy v této scéně – model se jim má vyhnout */
  rejectedReasons?: string[]
  /** Sekce „Režie“ z Directoru (`director/briefPrompt.ts`); prázdná = psáno bez režie */
  briefSection?: string
  /** Rozpočet tokenů pro přepis scény; starší záznamy nad rozpočet se vynechají */
  transcriptBudgetTokens?: number
  /** Jednorázový pokyn hráče pro tento krok („Zadat prompt“); prázdný = bez pokynu */
  userPrompt?: string
}

/** Jen repliky příběhu – záznamy typu `prompt` (jednorázové pokyny pro AI) do přepisu nepatří */
export const storyEntries = (entries: StoryEntry[]) => entries.filter(e => e.kind !== 'prompt')

/** Zobrazované jméno mluvčího – stejné jako v exportu do schránky (nickname postavy / jméno vypravěče) */
export const normalize = (s: string) => s.trim().toLocaleLowerCase('cs')

function speakerLabel(entry: StoryEntry, characters: Character[], narrator: Narrator): string {
  if (entry.characterName === null) return entry.narratorName ?? narrator.name
  const character = characters.find(c => c.name === entry.characterName)
  return character?.nickname ?? entry.characterName
}

/** Průběh scény ve stejném formátu jako tlačítko „Zkopírovat příběh jako Markdown“ */
export function formatTranscript(entries: StoryEntry[], characters: Character[], narrator: Narrator): string {
  return storyEntries(entries)
    .map(entry => `**${speakerLabel(entry, characters, narrator)}**:${entry.markdown ? '\n' : ' '}${entry.text}`)
    .join('\n\n')
}

/** Jména jiných vypravěčů, pod kterými jsou v přepisu záznamy (po přepnutí vypravěče uprostřed scény) */
export function previousNarratorNames(entries: StoryEntry[], narrator: Narrator): string[] {
  const current = normalize(narrator.name)
  const names = new Map<string, string>()
  for (const entry of entries) {
    if (entry.characterName !== null || !entry.narratorName) continue
    const key = normalize(entry.narratorName)
    if (key !== current && !names.has(key)) names.set(key, entry.narratorName)
  }
  return [...names.values()]
}

function characterBlock(character: Character): string {
  const label = character.nickname === character.name ? character.name : `${character.nickname} (${character.name})`
  const notes = character.notes.trim()
  return notes ? `- **${label}**\n${notes.split('\n').map(l => `  ${l}`).join('\n')}` : `- **${label}**`
}

export function buildMessages(ctx: ScenePromptContext): ChatMessage[] {
  const { narrator, scene, playerCharacters, aiCharacters } = ctx
  const entries = storyEntries(ctx.entries)
  const sections: string[] = []

  const narratorLines = [`## Vypravěč\nŘádky vypravěče uvozuj přesně jménem: \`${narrator.name}:\``]
  const previousNames = previousNarratorNames(entries, narrator)
  if (previousNames.length) {
    narratorLines.push(
      `Dřívější řádky vypravěče uvozené ${previousNames.map(n => `\`${n}:\``).join(', ')} patří předchozím vypravěčům – jejich obsah platí, ale odteď píšeš výhradně jako \`${narrator.name}\`.`
    )
  }
  sections.push(narratorLines.join('\n'))

  sections.push(
    `## Postavy hráče (za ty NIKDY nemluv)\n${playerCharacters.length ? playerCharacters.map(characterBlock).join('\n') : '- (žádné)'}`
  )
  sections.push(
    `## Postavy hrané AI (za ty mluvíš a jednáš ty)\n${aiCharacters.length ? aiCharacters.map(characterBlock).join('\n') : '- (žádné – hraješ jen vypravěče)'}`
  )

  const sceneLines = [`## Scéna: ${scene.title}`]
  if (scene.location) sceneLines.push(`Lokace: ${scene.location}`)
  sceneLines.push(scene.description.trim() || '(bez popisu)')
  sections.push(sceneLines.join('\n'))

  if (scene.aiPrompt.trim()) sections.push(`## Doplňující popis situace (pro vypravěče)\n${scene.aiPrompt.trim()}`)

  if (ctx.contextSections?.length) sections.push(...ctx.contextSections)

  const allCharacters = [...playerCharacters, ...aiCharacters]
  const cutoff = ctx.transcriptBudgetTokens ? transcriptCutoff(entries.map(e => e.text), ctx.transcriptBudgetTokens) : 0
  const transcript = formatTranscript(entries.slice(cutoff), allCharacters, narrator)
  const transcriptNote = cutoff > 0 ? `(starších ${cutoff} záznamů vynecháno – viz shrnutí výše)\n\n` : ''
  sections.push(`## Dosavadní průběh scény\n${transcriptNote}${transcript || '(scéna zatím nezačala – uveď ji úvodním popisem)'}`)

  if (narrator.aiPrompt.trim()) sections.push(`## Pokyny vypravěče „${narrator.name}“\n${narrator.aiPrompt.trim()}`)

  const reasons = (ctx.rejectedReasons ?? []).map(r => r.trim()).filter(Boolean)
  if (reasons.length) {
    sections.push(`## Odmítnuté předchozí návrhy pokračování\nHráč odmítl předchozí návrhy z těchto důvodů – jsou to fakta o světě, respektuj je a napiš jiné pokračování:\n${reasons.map(r => `- ${r}`).join('\n')}`)
  }

  if (ctx.briefSection?.trim()) sections.push(ctx.briefSection.trim())

  if (ctx.userPrompt?.trim()) {
    sections.push(`## Pokyn hráče pro tento krok\nHráč chce, aby se další pokračování řídilo tímto pokynem (má přednost před obecným směřováním scény):\n${ctx.userPrompt.trim()}`)
  }

  sections.push('## Úkol\nNavaž na poslední záznam a pokračuj ve scéně. Odpověz pouze řádky ve formátu `Jméno: text`.')

  return [
    { role: 'system', content: [ctx.defaultPrompt.trim(), ctx.rulesPrompt?.trim()].filter(Boolean).join('\n\n') },
    { role: 'user', content: sections.join('\n\n') },
  ]
}

/** Obecná označení vypravěče, která model může použít místo jeho jména */
const GENERIC_NARRATOR_NAMES = ['narrator', 'vypravěč', 'vypravec', 'gm', 'game master', 'dm', 'storyteller']
/** Řádek `Jméno: text`, volitelně s tučným jménem – `**Jméno**: text` (jako v přepisu) i `**Jméno:** text` */
const SPEAKER_LINE = /^\s*(?:\*\*)?\s*([^:*\n]{1,80}?)\s*(?:\*\*)?\s*:\s*(?:\*\*)?\s*(.*)$/

/** Odstraní z textu repliky zbylé značky tučného písma na okrajích (`** text`, `text**`) */
const stripBoldEdges = (text: string) => text.replace(/^\s*(?:\*\*|__)\s*/, '').replace(/\s*(?:\*\*|__)\s*$/, '').trim()

interface ParsedLine {
  characterName: string | null
  narratorName: string | null
  lines: string[]
}

export interface ParseSpeakerLinesOptions {
  /** Ostatní vypravěči hry (mimo `narrator`) – jejich řádky se uloží pod jejich jménem, ne pod aktuálního vypravěče */
  otherNarrators?: Narrator[]
  /**
   * Co s řádkem `Jméno: text`, kde jméno neodpovídá žádné postavě ani vypravěči:
   * - `narrator` (AI odpověď): připsat vypravěči, jméno zůstane v textu (`Jméno: text`)
   * - `bold-character` (import přepisu): tučné `**Jméno**:` = nová (dočasná) postava s tímto jménem, netučné = pokračování textu
   */
  unknownSpeaker?: 'narrator' | 'bold-character'
  /**
   * Vlastní párování jména na postavu (místo výchozího: celé jméno, pak nickname). `null` = neznámé jméno,
   * `'ambiguous'` = odpovídá více postavám – řádek se zpracuje jako neznámý a jméno se nahlásí přes `onAmbiguous`.
   */
  matchCharacter?: (name: string) => Character | 'ambiguous' | null
  onAmbiguous?: (name: string) => void
}

/**
 * Převede text ve tvaru řádků `Jméno: text` (volitelně `**Jméno**:` / `**Jméno:**`) na záznamy scény. Známí mluvčí =
 * vypravěč (jméno, obecná označení i `narratorAliases` – jména předchozích vypravěčů ze scény, vždy se uloží pod
 * aktuálního), další vypravěči hry (`otherNarrators`) a postavy scény (celé jméno i nickname). Text před prvním mluvčím
 * a řádky bez mluvčího navazují na předchozí záznam (víceřádkový markdown). Neznámé jméno viz `unknownSpeaker`.
 */
export function parseSpeakerLines(raw: string, characters: Character[], narrator: Narrator, narratorAliases: string[] = [], options: ParseSpeakerLinesOptions = {}): StoryEntry[] {
  const unknownSpeaker = options.unknownSpeaker ?? 'narrator'
  // Občas model obalí odpověď do bloku kódu
  const text = raw.replace(/^\s*```[a-z]*\s*\n?/i, '').replace(/\n?```\s*$/, '').trim()
  const parsed: ParsedLine[] = []
  const narratorKeys = new Set([narrator.name, ...narratorAliases, ...GENERIC_NARRATOR_NAMES].map(normalize))
  const otherNarrators = (options.otherNarrators ?? []).filter(n => n.name !== narrator.name)

  const resolveSpeaker = (name: string): { characterName: string | null; narratorName: string | null } | null => {
    const key = normalize(name)
    if (narratorKeys.has(key)) return { characterName: null, narratorName: narrator.name }
    const character = options.matchCharacter
      ? options.matchCharacter(name)
      : characters.find(c => normalize(c.name) === key) ?? characters.find(c => normalize(c.nickname) === key) ?? null
    if (character === 'ambiguous') {
      options.onAmbiguous?.(name.trim())
      return null
    }
    if (character) return { characterName: character.name, narratorName: null }
    const other = otherNarrators.find(n => normalize(n.name) === key)
    return other ? { characterName: null, narratorName: other.name } : null
  }

  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trimEnd()
    const match = line.match(SPEAKER_LINE)
    if (match) {
      const speaker = resolveSpeaker(match[1])
      if (speaker) {
        parsed.push({ ...speaker, lines: [stripBoldEdges(match[2])] })
        continue
      }
      // Neznámý mluvčí (např. nová NPC); delší „jméno“ je spíš věta s dvojtečkou
      const name = match[1].trim()
      const looksLikeName = name.split(/\s+/).length <= 3 && !/["„“]/.test(name)
      if (looksLikeName && unknownSpeaker === 'narrator') {
        // → vypravěč, jméno zůstane v textu
        parsed.push({ characterName: null, narratorName: narrator.name, lines: [`${name}: ${stripBoldEdges(match[2])}`] })
        continue
      }
      if (looksLikeName && unknownSpeaker === 'bold-character' && line.trimStart().startsWith('**')) {
        parsed.push({ characterName: name, narratorName: null, lines: [stripBoldEdges(match[2])] })
        continue
      }
    }
    if (!line.trim()) {
      // Prázdný řádek = odstavec uvnitř víceřádkového záznamu
      if (parsed.length && parsed[parsed.length - 1].lines[parsed[parsed.length - 1].lines.length - 1] !== '') parsed[parsed.length - 1].lines.push('')
      continue
    }
    if (parsed.length) parsed[parsed.length - 1].lines.push(line.trim())
    else parsed.push({ characterName: null, narratorName: narrator.name, lines: [line.trim()] })
  }

  const base = Date.now()
  return parsed
    .map(p => ({ ...p, text: p.lines.join('\n').trim() }))
    .filter(p => p.text)
    .map((p, index) => ({
      id: `${base + index}`,
      characterName: p.characterName,
      narratorName: p.characterName === null ? p.narratorName : undefined,
      text: p.text,
      timestamp: base + index,
      markdown: p.text.includes('\n') ? true : undefined,
    }))
}

/** Převede odpověď AI modelu na záznamy scény (neznámá jména se připíší vypravěči) – viz `parseSpeakerLines` */
export function parseAiReply(raw: string, characters: Character[], narrator: Narrator, narratorAliases: string[] = []): StoryEntry[] {
  return parseSpeakerLines(raw, characters, narrator, narratorAliases, { unknownSpeaker: 'narrator' })
}
