import type { StoryEntry } from '@solo-rpg/shared'

/**
 * Formát scény v Markdownu (čitelný a editovatelný v Obsidianu):
 *
 * <!-- entry id="1700000000000" ts="1700000000000" -->
 * **[[Aria]]**: Jednořádková replika postavy.
 *
 * <!-- entry id="1700000000001" ts="1700000000001" -->
 * **[[Kronikář]]**:
 * Víceřádkový markdown vypravěče
 * pokračuje na dalších řádcích.
 *
 * Postavy jsou wikilinky na soubory v `characters/` (celé jméno) s aliasem = nickname,
 * vypravěči jsou wikilinky na soubory v `narrators/`. Záznam vypravěče bez souboru
 * (starý zápis `**DM**:` / `**Vypravěč**:`) se čte jako vypravěč bez jména.
 * Text za dvojtečkou na téže řádce = jednořádkový záznam, text od nové řádky = markdown.
 */

const ENTRY_MARKER = /<!--\s*entry\s+([^>]*?)\s*-->/g
const ATTR = /(\w+)="([^"]*)"/g
const SPEAKER_LINE = /^\*\*(?:\[\[([^\]]+?)(?:\|[^\]]*)?\]\]|([^*\n]+?))\*\*:(?:[ \t]+|(?=\n)|$)/
/** Začátek řádku s mluvčím kdekoli v textu – pro záznamy dopsané ručně bez markeru */
const SPEAKER_LINE_GLOBAL = /^\*\*(?:\[\[[^\]]+?\]\]|[^*\n]+?)\*\*:/gm
/** Hlavička vypravěče bez souboru; `DM` je historický zápis */
const NARRATOR_FALLBACK = 'Vypravěč'
const LEGACY_NARRATOR_NAMES = new Set(['DM', NARRATOR_FALLBACK])

/** Známí mluvčí scény: celá jména + nicknamy postav a jména vypravěčů */
export interface SceneSpeakers {
  characters: Iterable<string>
  narrators: Iterable<string>
}

function escapeSpeaker(name: string): string {
  return name.replace(/[[\]|*]/g, '')
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/** Hlavička mluvčího-postavy: `**[[Celé jméno|nick]]**:` (alias jen pokud se liší od jména) */
export function speakerLink(name: string, nickname?: string): string {
  const safeName = escapeSpeaker(name)
  const alias = nickname ? escapeSpeaker(nickname) : ''
  return alias && alias !== safeName ? `**[[${safeName}|${alias}]]**:` : `**[[${safeName}]]**:`
}

/** Přepíše ve scéně hlavičky mluvčího jedné postavy (přejmenování / změna nicku). Vrací null bez změny. */
export function renameSpeaker(body: string, oldName: string, newName: string, newNickname: string): string | null {
  const pattern = new RegExp(`\\*\\*\\[\\[${escapeRegExp(escapeSpeaker(oldName))}(?:\\|[^\\]]*)?\\]\\]\\*\\*:`, 'g')
  if (!pattern.test(body)) return null
  return body.replace(pattern, speakerLink(newName, newNickname))
}

export function serializeEntries(entries: StoryEntry[], nicknames: ReadonlyMap<string, string> = new Map()): string {
  return entries
    .map(entry => {
      const speaker = entry.characterName !== null
        ? speakerLink(entry.characterName, nicknames.get(entry.characterName))
        : entry.narratorName
          ? speakerLink(entry.narratorName)
          : `**${NARRATOR_FALLBACK}**:`
      const text = entry.text.trim()
      // Víceřádkový text musí začínat na nové řádce, jinak by se při čtení rozpadl na více záznamů
      const separator = entry.markdown || text.includes('\n') ? '\n' : ' '
      return `<!-- entry id="${entry.id}" ts="${entry.timestamp}" -->\n${speaker}${separator}${text}`
    })
    .join('\n\n')
    .concat(entries.length ? '\n' : '')
}

export function parseEntries(body: string, known: SceneSpeakers = { characters: [], narrators: [] }): StoryEntry[] {
  const entries: StoryEntry[] = []
  const markers = [...body.matchAll(ENTRY_MARKER)]
  const characters = new Set(known.characters)
  const narrators = new Set(known.narrators)
  const speakers = new Set([...LEGACY_NARRATOR_NAMES, ...narrators, ...characters])
  let generated = 0

  const pushSingle = (attrs: Record<string, string>, chunk: string) => {
    const trimmed = chunk.trim()
    if (!trimmed) return
    const parsed = parseSpeaker(trimmed, characters, narrators)
    const fallbackTs = Date.now() + generated++
    const timestamp = Number(attrs.ts)
    entries.push({
      id: attrs.id || `md-${fallbackTs}`,
      characterName: parsed.characterName,
      narratorName: parsed.characterName === null ? parsed.narratorName : undefined,
      text: parsed.text,
      timestamp: Number.isFinite(timestamp) && timestamp > 0 ? timestamp : fallbackTs,
      markdown: parsed.markdown || undefined,
    })
  }

  /** Jeden blok za markerem může obsahovat další ručně dopsané záznamy `**Jméno**:` – rozdělíme je. */
  const pushChunk = (attrs: Record<string, string>, chunk: string) => {
    const trimmed = chunk.trim()
    if (!trimmed) return
    // Wikilink dělí vždy; prosté `**Text**:` jen pokud jde o známého mluvčího (jinak je to jen tučný text)
    const starts = [...trimmed.matchAll(SPEAKER_LINE_GLOBAL)]
      .filter(m => m.index === 0 || m[0].includes('[[') || speakers.has(m[0].slice(2, -3).trim()))
      .map(m => m.index ?? 0)
    // Úvodní text bez hlavičky mluvčího je také samostatný záznam
    if (starts[0] !== 0) starts.unshift(0)
    starts.forEach((start, i) => {
      const end = starts[i + 1] ?? trimmed.length
      pushSingle(i === 0 ? attrs : {}, trimmed.slice(start, end))
    })
  }

  // Text před prvním markerem (např. ručně dopsaný v Obsidianu)
  const leading = body.slice(0, markers[0]?.index ?? body.length)
  pushChunk({}, leading)

  markers.forEach((marker, i) => {
    const start = (marker.index ?? 0) + marker[0].length
    const end = markers[i + 1]?.index ?? body.length
    const attrs: Record<string, string> = {}
    for (const m of marker[1].matchAll(ATTR)) attrs[m[1]] = m[2]
    pushChunk(attrs, body.slice(start, end))
  })

  return entries
}

interface ParsedSpeaker {
  characterName: string | null
  narratorName: string | null
  text: string
  markdown: boolean
}

function parseSpeaker(chunk: string, characters: ReadonlySet<string>, narrators: ReadonlySet<string>): ParsedSpeaker {
  const match = chunk.match(SPEAKER_LINE)
  if (!match) {
    // Bez hlavičky mluvčího – bereme jako text vypravěče
    return { characterName: null, narratorName: null, text: chunk, markdown: chunk.includes('\n') }
  }
  const linked = match[1]
  const plain = match[2]
  const rest = chunk.slice(match[0].length)
  const text = rest.replace(/^\n/, '').trim()
  const markdown = rest.startsWith('\n') || text.includes('\n')

  const name = (linked ?? plain ?? '').trim()
  // Wikilink na vypravěče (pokud stejné jméno nemá i postava); prosté jméno vypravěče nebo starý zápis `DM`
  if (narrators.has(name) && !characters.has(name)) return { characterName: null, narratorName: name, text, markdown }
  if (!linked && LEGACY_NARRATOR_NAMES.has(name)) return { characterName: null, narratorName: null, text, markdown }
  return { characterName: name, narratorName: null, text, markdown }
}
