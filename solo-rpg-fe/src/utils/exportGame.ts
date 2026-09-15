import type { Character, Faction, GameSettings, LoreEntry, Narrator, Quest, SceneMeta, StoryEntry, StoryLocation, StoryThread } from '@solo-rpg/shared'
import { locationPath, questProgress } from '@solo-rpg/shared'
import { THREAD_CERTAINTY_LABELS, THREAD_HORIZON_LABELS, THREAD_STATUS_LABELS, THREAD_TYPE_LABELS } from './threads'
import { FACTION_STANCE_LABELS, FACTION_STATUS_LABELS, FACTION_TYPE_LABELS } from './factions'
import { OBJECTIVE_STATUS_LABELS, QUEST_STATUS_LABELS, QUEST_TYPE_LABELS } from './quests'
import { LOCATION_STATUS_LABELS, LOCATION_TYPE_LABELS } from './locations'
import { LORE_KNOWLEDGE_LABELS, LORE_TRUTH_LABELS, LORE_TYPE_LABELS } from './lore'

/**
 * Export celé hry do jednoho čistě textového Markdown souboru – kontext pro externí AI chat (ChatGPT, Gemini…)
 * nebo pro čtení. Bez obrázků a odkazů na soubory; wikilinky se převádějí na prostý text.
 */

export interface GameExportData {
  gameName: string
  settings: Pick<GameSettings, 'narrator' | 'rules'>
  characters: Character[]
  narrators: Narrator[]
  scenes: SceneMeta[]
  /** Záznamy jednotlivých scén podle id scény (surová podoba z API – mluvčí podle jména) */
  entriesByScene: Record<string, StoryEntry[]>
  threads: StoryThread[]
  factions: Faction[]
  quests: Quest[]
  locations: StoryLocation[]
  lore: LoreEntry[]
}

/** Odstraní obrázky (`![alt](url)`, `![[soubor]]`, `<img>`) a wikilinky převede na text (`[[Cíl|alias]]` → alias) */
export function toPlainMarkdown(text: string): string {
  return text
    .replace(/!\[\[[^\]]*\]\]/g, '')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
    .replace(/<img\b[^>]*>/gi, '')
    .replace(/\[\[([^\]|]+)\|([^\]]+)\]\]/g, '$2')
    .replace(/\[\[([^\]]+)\]\]/g, '$1')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

const list = (items: readonly string[]) => items.map(toPlainMarkdown).filter(Boolean).join(', ')

/** Řádek `- **Popisek:** hodnota`; prázdné hodnoty se vynechají */
function field(label: string, value: string | null | undefined): string | null {
  const v = value?.trim()
  return v ? `- **${label}:** ${toPlainMarkdown(v)}` : null
}

function fields(...rows: (string | null)[]): string {
  return rows.filter((r): r is string => r !== null).join('\n')
}

/** Delší markdown blok pod nadpisem; prázdný = nic */
function block(label: string | null, text: string): string {
  const body = toPlainMarkdown(text)
  if (!body) return ''
  return label ? `**${label}**\n\n${body}` : body
}

function section(parts: (string | null | undefined)[]): string {
  return parts.filter((p): p is string => Boolean(p && p.trim())).join('\n\n')
}

function entryLine(entry: StoryEntry, characters: readonly Character[]): string {
  const speaker = entry.characterName
    ? (characters.find(c => c.name === entry.characterName)?.nickname ?? entry.characterName)
    : entry.narratorName ?? 'Vypravěč'
  const text = toPlainMarkdown(entry.text)
  // Víceřádkový markdown začíná na novém řádku pod jménem mluvčího
  return `**${toPlainMarkdown(speaker)}:**${entry.markdown || text.includes('\n') ? '\n' : ' '}${text}`
}

export function buildGameMarkdown(data: GameExportData): string {
  const { gameName, settings, characters, narrators, scenes, entriesByScene, threads, factions, quests, locations, lore } = data
  const out: string[] = []
  const h = (level: number, title: string) => out.push(`${'#'.repeat(level)} ${toPlainMarkdown(title)}`)

  h(1, gameName)
  out.push(
    'Kompletní textový export sólové RPG hry (postavy, svět, dějové nitě, questy a přepis všech scén). ' +
      'Slouží jako kontext o hře – obsahuje i tajemství a skutečnou pravdu kampaně, které postavy nemusí znát.'
  )

  // ---------- kostky a pravidla (vždy, i bez konkrétního systému) ----------
  h(2, 'Kostky a pravidla')
  out.push(
    'Hráč při hře hází kostkami jako **orákulem** (oracle rolls): nechává náhodu rozhodnout o vývoji děje, zvratech a odpovědích ' +
      'na otázky, výsledek hodu zapíše přímo do textu (např. „d20: 17“, „procenta: 23 %“) a sám ho interpretuje. ' +
      'Hody a jejich výsledky v přepisu jsou fakta fikce, která už nastala. ' +
      (settings.rules.trim()
        ? 'Pod příběhem navíc běží tento pravidlový systém – hody a mechaniky v textu vykládej podle něj:'
        : 'Pod příběhem neběží žádný konkrétní pravidlový systém – hody ber jen jako orákulum.')
  )
  if (settings.rules.trim()) out.push(toPlainMarkdown(settings.rules))

  // ---------- vypravěči ----------
  if (narrators.length) {
    h(2, 'Vypravěči')
    for (const n of narrators) {
      h(3, `${n.name}${settings.narrator === n.name ? ' (aktuální vypravěč)' : ''}`)
      out.push(section([block(null, n.description), block('Styl a pravidla vypravěče', n.aiPrompt)]) || '_Bez popisu._')
    }
  }

  // ---------- postavy ----------
  h(2, 'Postavy')
  if (!characters.length) out.push('_Žádné postavy._')
  for (const c of characters) {
    h(3, c.name === c.nickname ? c.name : `${c.name} („${c.nickname}“)`)
    out.push(toPlainMarkdown(c.notes) || '_Bez poznámek._')
  }

  // ---------- lokace ----------
  if (locations.length) {
    h(2, 'Lokace')
    const sorted = [...locations].sort((a, b) => locationPath(a, locations).length - locationPath(b, locations).length || a.title.localeCompare(b.title, 'cs'))
    for (const l of sorted) {
      h(3, l.title)
      const path = locationPath(l, locations)
      out.push(
        section([
          fields(
            field('Typ', LOCATION_TYPE_LABELS[l.type]),
            field('Stav', LOCATION_STATUS_LABELS[l.status]),
            field('Zařazení', path.length > 1 ? path.map(p => p.title).join(' › ') : null)
          ),
          block(null, l.description),
          block('Tajemství místa', l.secrets),
        ])
      )
    }
  }

  // ---------- frakce ----------
  if (factions.length) {
    h(2, 'Frakce')
    for (const f of factions) {
      h(3, f.title)
      out.push(
        section([
          fields(
            field('Typ', FACTION_TYPE_LABELS[f.type]),
            field('Stav', FACTION_STATUS_LABELS[f.status]),
            field('Postoj k postavám', FACTION_STANCE_LABELS[f.stance]),
            field('Vůdce', f.leader),
            field('Nadřazená frakce', f.parentFaction),
            field('Důležité postavy', list(f.characters)),
            field('Lokace', list(f.locations)),
            field('Cíle', f.goals.length ? f.goals.map(toPlainMarkdown).join('; ') : null),
            field(
              'Vztahy',
              f.relations.length
                ? f.relations.map(r => `${toPlainMarkdown(r.faction)} – ${FACTION_STANCE_LABELS[r.stance]}${r.note ? ` (${toPlainMarkdown(r.note)})` : ''}`).join('; ')
                : null
            )
          ),
          block(null, f.description),
          block('Tajemství', f.secrets),
        ])
      )
    }
  }

  // ---------- questy ----------
  if (quests.length) {
    h(2, 'Questy')
    for (const q of quests) {
      h(3, q.title)
      const progress = questProgress(q.objectives)
      const objectives = q.objectives.length
        ? q.objectives
            .map(o => `- [${o.status === 'completed' ? 'x' : ' '}] ${toPlainMarkdown(o.title)} (${OBJECTIVE_STATUS_LABELS[o.status]}${o.optional ? ', volitelný' : ''})`)
            .join('\n')
        : null
      out.push(
        section([
          fields(
            field('Typ', QUEST_TYPE_LABELS[q.type]),
            field('Stav', QUEST_STATUS_LABELS[q.status]),
            field('Postup', progress.total ? `${progress.done}/${progress.total}` : null),
            field('Zadavatel', q.questGiver),
            field('Nadřazený quest', q.parentQuest),
            field('Postavy', list(q.characters)),
            field('Frakce', list(q.factions)),
            field('Lokace', list(q.locations)),
            field('Dějové nitě', list(q.threads)),
            field('Odměny', q.rewards.length ? q.rewards.map(toPlainMarkdown).join('; ') : null)
          ),
          block(null, q.description),
          objectives ? `**Dílčí cíle**\n\n${objectives}` : null,
          block('Výsledek', q.outcome),
          block('Poznámky', q.notes),
        ])
      )
    }
  }

  // ---------- dějové nitě ----------
  if (threads.length) {
    h(2, 'Dějové nitě')
    for (const t of threads) {
      h(3, t.title)
      out.push(
        section([
          fields(
            field('Typ', THREAD_TYPE_LABELS[t.type]),
            field('Stav', THREAD_STATUS_LABELS[t.status]),
            field('Horizont', THREAD_HORIZON_LABELS[t.horizon]),
            field('Jistota', THREAD_CERTAINTY_LABELS[t.certainty]),
            field('Kdy vyhodnotit', t.revealCondition),
            field('Hodiny', t.clock ? `${t.clock.current}/${t.clock.max}` : null),
            field('Vznikla ve scéně', t.scene),
            field('Postavy', list(t.characters)),
            field('Frakce', list(t.factions)),
            field('Lokace', list(t.locations))
          ),
          block(null, t.description),
        ])
      )
    }
  }

  // ---------- lore ----------
  if (lore.length) {
    h(2, 'Lore – encyklopedie světa')
    for (const l of lore) {
      h(3, l.title)
      out.push(
        section([
          fields(
            field('Typ', LORE_TYPE_LABELS[l.type]),
            field('Pravdivost', LORE_TRUTH_LABELS[l.truth]),
            field('Znalost postav', LORE_KNOWLEDGE_LABELS[l.knowledge]),
            field('Postavy', list(l.characters)),
            field('Lokace', list(l.locations)),
            field('Frakce', list(l.factions)),
            field('Questy', list(l.quests)),
            field('Dějové nitě', list(l.threads))
          ),
          block(null, l.content),
          block('Skutečná pravda', l.secrets),
        ])
      )
    }
  }

  // ---------- scény ----------
  h(2, 'Příběh – scény')
  if (!scenes.length) out.push('_Žádné scény._')
  const ordered = [...scenes].sort((a, b) => a.order - b.order)
  ordered.forEach((s, i) => {
    h(3, `Scéna ${i + 1}: ${s.title}`)
    const entries = entriesByScene[s.id] ?? []
    out.push(
      section([
        fields(field('Lokace', s.location), field('Postavy ve scéně', list(s.characters))),
        block(null, s.description),
        block('Shrnutí scény', s.summary),
        entries.length ? `**Přepis**\n\n${entries.map(e => entryLine(e, characters)).join('\n\n')}` : '_Scéna zatím nemá žádné záznamy._',
      ])
    )
  })

  return out.join('\n\n').trim() + '\n'
}

/** Bezpečný název souboru z názvu hry */
export function exportFileName(gameName: string): string {
  const safe = gameName.replace(/[\\/:*?"<>|]+/g, '_').trim() || 'hra'
  return `${safe}.md`
}

/** Stáhne text jako soubor přes dočasný odkaz (bez serveru) */
export function downloadTextFile(filename: string, text: string, mime = 'text/markdown'): void {
  const blob = new Blob([text], { type: `${mime};charset=utf-8` })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
