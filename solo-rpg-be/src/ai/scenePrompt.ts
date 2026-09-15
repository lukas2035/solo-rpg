import type { Character, Narrator, SceneMeta, StoryEntry } from '@solo-rpg/shared'
import type { ChatMessage } from './openRouter.js'

/**
 * Sestavení požadavku pro AI vypravěče a parsování jeho odpovědi.
 *
 * Pořadí částí požadavku (domluvené):
 *  1. výchozí prompt pro vedení scény (soubor `prompts/scene-prompt.md`) + při `rulesInAi` sekce o kostkách/pravidlech
 *     (`prompts/rules-prompt.md` + popis pravidel hry) – system zpráva
 *  2. postavy hráče a postavy hrané AI (s popisem, pokud je)
 *  3. popis scény (+ volitelný doplňující popis situace ze scény `aiPrompt`)
 *  4. celý dosavadní průběh scény ve formátu „kopírovat do schránky“ (`**Jméno**: text`)
 *  5. doplňkový prompt aktuálního vypravěče
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
}

/** Zobrazované jméno mluvčího – stejné jako v exportu do schránky (nickname postavy / jméno vypravěče) */
const normalize = (s: string) => s.trim().toLocaleLowerCase('cs')

function speakerLabel(entry: StoryEntry, characters: Character[], narrator: Narrator): string {
  if (entry.characterName === null) return entry.narratorName ?? narrator.name
  const character = characters.find(c => c.name === entry.characterName)
  return character?.nickname ?? entry.characterName
}

/** Průběh scény ve stejném formátu jako tlačítko „Zkopírovat příběh jako Markdown“ */
export function formatTranscript(entries: StoryEntry[], characters: Character[], narrator: Narrator): string {
  return entries
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
  const { narrator, scene, playerCharacters, aiCharacters, entries } = ctx
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

  const transcript = formatTranscript(entries, [...playerCharacters, ...aiCharacters], narrator)
  sections.push(`## Dosavadní průběh scény\n${transcript || '(scéna zatím nezačala – uveď ji úvodním popisem)'}`)

  if (narrator.aiPrompt.trim()) sections.push(`## Pokyny vypravěče „${narrator.name}“\n${narrator.aiPrompt.trim()}`)

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

/**
 * Převede odpověď modelu na záznamy scény. Známí mluvčí = vypravěč (jméno, obecná označení i `narratorAliases` –
 * jména předchozích vypravěčů ze scény, vždy se uloží pod aktuálního) a postavy scény (celé jméno i nickname).
 * Neznámé jméno se připíše vypravěči jako `Jméno: text`, text před prvním mluvčím a řádky bez mluvčího navazují
 * na předchozí záznam (víceřádkový markdown).
 */
export function parseAiReply(raw: string, characters: Character[], narrator: Narrator, narratorAliases: string[] = []): StoryEntry[] {
  // Občas model obalí odpověď do bloku kódu
  const text = raw.replace(/^\s*```[a-z]*\s*\n?/i, '').replace(/\n?```\s*$/, '').trim()
  const parsed: ParsedLine[] = []
  const narratorKeys = new Set([narrator.name, ...narratorAliases, ...GENERIC_NARRATOR_NAMES].map(normalize))

  const resolveSpeaker = (name: string): { characterName: string | null; narratorName: string | null } | null => {
    const key = normalize(name)
    if (narratorKeys.has(key)) return { characterName: null, narratorName: narrator.name }
    const character = characters.find(c => normalize(c.name) === key) ?? characters.find(c => normalize(c.nickname) === key)
    return character ? { characterName: character.name, narratorName: null } : null
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
      // Neznámý mluvčí (např. nová NPC) → vypravěč, jméno zůstane v textu; delší „jméno“ je spíš věta s dvojtečkou
      const name = match[1].trim()
      if (name.split(/\s+/).length <= 3 && !/["„“]/.test(name)) {
        parsed.push({ characterName: null, narratorName: narrator.name, lines: [`${name}: ${stripBoldEdges(match[2])}`] })
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
