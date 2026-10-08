import {
  OPEN_QUEST_STATUSES,
  OPEN_THREAD_STATUSES,
  type Faction,
  type GameDetail,
  type LoreEntry,
  type Quest,
  type SceneMeta,
  type StoryLocation,
  type StoryThread,
} from '@solo-rpg/shared'

/**
 * Výběr kontextu kampaně pro prompt AI vypravěče (docs/ARCHITECTURE_V2.md §4.4).
 *
 * Čistá funkce nad `GameDetail`: postavy a lokace scény jsou semínka, odtud se jde grafem vazeb (nitě, questy, frakce,
 * lokace, lore) do hloubky 2. Každý kandidát dostane skóre (vzdálenost v grafu, otevřený stav, vazba na scénu,
 * čerstvost) a bloky se do promptu přidávají od nejrelevantnějšího, dokud stačí rozpočet tokenů.
 * Do promptu jde vždy jméno i id (`Zrada v cechu (id: thr_…)`), tajemství jdou do oddělené sekce „Tajemství (hráč nezná)“.
 */

export interface ContextBuilderOptions {
  /** Rozpočet tokenů pro celý kontext (entity + shrnutí scén) */
  budgetTokens: number
  /** Odhad počtu znaků na token (čeština ~3,5) */
  charsPerToken?: number
  /** Podíl rozpočtu vyhrazený přednostně pro shrnutí předchozích scén (0–1); nevyužitý zbytek připadne entitám */
  summaryShare?: number
  /** Kolik dní zpět se změna entity počítá jako „čerstvá“ */
  recencyDays?: number
  /** Čas „teď“ (pro testy) */
  now?: number
}

export interface ContextBlock {
  kind: 'thread' | 'quest' | 'faction' | 'location' | 'lore' | 'character' | 'summary'
  id: string
  name: string
  /** Text do veřejné sekce daného druhu */
  text: string
  /** Text do sekce „Tajemství (hráč nezná)“ */
  secret: string
  score: number
}

export interface SceneContext {
  /** Hotové markdown sekce (`## …`) v pořadí, v jakém patří do promptu */
  sections: string[]
  /** Čitelný seznam zařazených položek (`Nit: Zrada v cechu (thr_…)`) – vrací se FE kvůli ladění */
  included: string[]
  /** Počet kandidátů, na které už nevyšel rozpočet */
  dropped: number
  tokensUsed: number
}

const DEFAULT_CHARS_PER_TOKEN = 3.5

export function estimateTokens(text: string, charsPerToken = DEFAULT_CHARS_PER_TOKEN): number {
  return Math.ceil(text.length / charsPerToken)
}

// ---------- české popisky výčtů (prompt je česky) ----------

const THREAD_TYPE: Record<StoryThread['type'], string> = {
  complication: 'komplikace',
  threat: 'hrozba',
  mystery: 'záhada',
  opportunity: 'příležitost',
  obligation: 'závazek',
  relationship: 'vztah',
}
const THREAD_STATUS: Record<StoryThread['status'], string> = { latent: 'skrytá', active: 'aktivní', escalated: 'eskalovaná', resolved: 'vyřešená', expired: 'vyhaslá' }
const THREAD_HORIZON: Record<StoryThread['horizon'], string> = { immediate: 'okamžitý', 'short-term': 'krátkodobý', 'long-term': 'dlouhodobý' }
const QUEST_STATUS: Record<Quest['status'], string> = { available: 'dostupný', active: 'aktivní', paused: 'pozastavený', completed: 'splněný', failed: 'neúspěšný', abandoned: 'opuštěný' }
const OBJECTIVE_MARK: Record<Quest['objectives'][number]['status'], string> = { pending: '[ ]', active: '[~]', completed: '[x]', failed: '[✗]', skipped: '[-]' }
const FACTION_STATUS: Record<Faction['status'], string> = { active: 'aktivní', dormant: 'spící', disbanded: 'rozpuštěná', destroyed: 'zničená', unknown: 'neznámý stav' }
const STANCE: Record<Faction['stance'], string> = { allied: 'spojenec', friendly: 'přátelský', neutral: 'neutrální', tense: 'napjatý', hostile: 'nepřátelský', unknown: 'neznámý' }
const LOCATION_STATUS: Record<StoryLocation['status'], string> = { unknown: 'neznámá', known: 'známá', visited: 'navštívená', abandoned: 'opuštěná', destroyed: 'zničená' }
const LORE_TRUTH: Record<LoreEntry['truth'], string> = { unknown: 'pravdivost neznámá', confirmed: 'potvrzené', partial: 'částečně pravdivé', debunked: 'vyvrácené' }
const LORE_KNOWLEDGE: Record<LoreEntry['knowledge'], string> = { unknown: 'hráč nezná', rumored: 'hráč zná jako pověst', known: 'hráč zná' }

const SECTION_TITLE: Record<ContextBlock['kind'], string> = {
  summary: 'Co se stalo v předchozích scénách',
  thread: 'Dějové nitě',
  quest: 'Questy',
  faction: 'Frakce',
  location: 'Lokace',
  lore: 'Lore',
  character: 'Další postavy (nejsou ve scéně, ale souvisí)',
}
const SECTION_ORDER: ContextBlock['kind'][] = ['summary', 'location', 'quest', 'thread', 'faction', 'character', 'lore']
const KIND_LABEL: Record<ContextBlock['kind'], string> = { summary: 'Shrnutí', thread: 'Nit', quest: 'Quest', faction: 'Frakce', location: 'Lokace', lore: 'Lore', character: 'Postava' }

// ---------- graf ----------

type NodeKind = 'character' | 'location' | 'thread' | 'quest' | 'faction' | 'lore'

interface Node {
  kind: NodeKind
  id: string
  name: string
  neighbours: Set<string>
}

const key = (kind: NodeKind, name: string) => `${kind}:${name}`

function buildGraph(detail: GameDetail): Map<string, Node> {
  const nodes = new Map<string, Node>()
  const add = (kind: NodeKind, id: string, name: string) => {
    nodes.set(key(kind, name), { kind, id, name, neighbours: new Set() })
  }
  for (const c of detail.setup.characters) add('character', c.id, c.name)
  for (const l of detail.locations) add('location', l.id, l.title)
  for (const t of detail.threads) add('thread', t.id, t.title)
  for (const q of detail.quests) add('quest', q.id, q.title)
  for (const f of detail.factions) add('faction', f.id, f.title)
  for (const l of detail.lore) add('lore', l.id, l.title)

  const connect = (a: string, bKind: NodeKind, bName: string | null | undefined) => {
    if (!bName) return
    const b = key(bKind, bName)
    const na = nodes.get(a)
    const nb = nodes.get(b)
    if (!na || !nb || a === b) return
    na.neighbours.add(b)
    nb.neighbours.add(a)
  }
  for (const l of detail.locations) connect(key('location', l.title), 'location', l.parentLocation)
  for (const t of detail.threads) {
    const k = key('thread', t.title)
    t.characters.forEach(n => connect(k, 'character', n))
    t.factions.forEach(n => connect(k, 'faction', n))
    t.locations.forEach(n => connect(k, 'location', n))
  }
  for (const q of detail.quests) {
    const k = key('quest', q.title)
    q.characters.forEach(n => connect(k, 'character', n))
    q.threads.forEach(n => connect(k, 'thread', n))
    q.factions.forEach(n => connect(k, 'faction', n))
    q.locations.forEach(n => connect(k, 'location', n))
    connect(k, 'character', q.questGiver)
    connect(k, 'quest', q.parentQuest)
  }
  for (const f of detail.factions) {
    const k = key('faction', f.title)
    f.characters.forEach(n => connect(k, 'character', n))
    f.locations.forEach(n => connect(k, 'location', n))
    f.relations.forEach(r => connect(k, 'faction', r.faction))
    connect(k, 'character', f.leader)
    connect(k, 'faction', f.parentFaction)
  }
  for (const l of detail.lore) {
    const k = key('lore', l.title)
    l.characters.forEach(n => connect(k, 'character', n))
    l.locations.forEach(n => connect(k, 'location', n))
    l.factions.forEach(n => connect(k, 'faction', n))
    l.quests.forEach(n => connect(k, 'quest', n))
    l.threads.forEach(n => connect(k, 'thread', n))
  }
  return nodes
}

/** BFS od semínek; vrací vzdálenost každého dosaženého uzlu (max `maxDepth`) */
function distances(nodes: Map<string, Node>, seeds: string[], maxDepth: number): Map<string, number> {
  const dist = new Map<string, number>()
  let frontier = seeds.filter(s => nodes.has(s))
  frontier.forEach(s => dist.set(s, 0))
  for (let d = 1; d <= maxDepth && frontier.length; d++) {
    const next: string[] = []
    for (const k of frontier) {
      for (const n of nodes.get(k)!.neighbours) {
        if (dist.has(n)) continue
        dist.set(n, d)
        next.push(n)
      }
    }
    frontier = next
  }
  return dist
}

// ---------- formátování bloků ----------

const label = (name: string, id: string) => `**${name}** (id: ${id})`
const indent = (text: string) => text.trim().split('\n').map(l => `  ${l}`).join('\n')
const list = (items: readonly string[]) => (items.length ? items.join(', ') : null)

function threadBlock(t: StoryThread): Pick<ContextBlock, 'text' | 'secret'> {
  const meta = [THREAD_TYPE[t.type], THREAD_STATUS[t.status], `horizont ${THREAD_HORIZON[t.horizon]}`]
  if (t.clock) meta.push(`hodiny ${t.clock.current}/${t.clock.max}`)
  const lines = [`- ${label(t.title, t.id)} – ${meta.join(', ')}`]
  const links = [list(t.characters) && `postavy: ${list(t.characters)}`, list(t.factions) && `frakce: ${list(t.factions)}`, list(t.locations) && `lokace: ${list(t.locations)}`].filter(Boolean)
  if (links.length) lines.push(`  (${links.join('; ')})`)
  if (t.description.trim()) lines.push(indent(t.description))
  const secret = t.certainty === 'unresolved'
    ? `- ${label(t.title, t.id)}: hráč si touto nití není jistý${t.revealCondition.trim() ? ` – odhalí se, až: ${t.revealCondition.trim()}` : ''}`
    : ''
  return { text: lines.join('\n'), secret }
}

function questBlock(q: Quest): Pick<ContextBlock, 'text' | 'secret'> {
  const lines = [`- ${label(q.title, q.id)} – ${q.type}, ${QUEST_STATUS[q.status]}${q.questGiver ? `, zadavatel ${q.questGiver}` : ''}${q.parentQuest ? `, součást „${q.parentQuest}“` : ''}`]
  const links = [list(q.characters) && `postavy: ${list(q.characters)}`, list(q.factions) && `frakce: ${list(q.factions)}`, list(q.locations) && `lokace: ${list(q.locations)}`, list(q.threads) && `nitě: ${list(q.threads)}`].filter(Boolean)
  if (links.length) lines.push(`  (${links.join('; ')})`)
  if (q.description.trim()) lines.push(indent(q.description))
  if (q.objectives.length) lines.push(indent(q.objectives.map(o => `${OBJECTIVE_MARK[o.status]} ${o.title}${o.optional ? ' (volitelný)' : ''}`).join('\n')))
  if (q.rewards.length) lines.push(`  Odměny: ${q.rewards.join(', ')}`)
  if (q.outcome.trim()) lines.push(`  Výsledek: ${q.outcome.trim()}`)
  return { text: lines.join('\n'), secret: '' }
}

function factionBlock(f: Faction): Pick<ContextBlock, 'text' | 'secret'> {
  const lines = [`- ${label(f.title, f.id)} – ${f.type}, ${FACTION_STATUS[f.status]}, postoj k družině: ${STANCE[f.stance]}${f.leader ? `, vůdce ${f.leader}` : ''}${f.parentFaction ? `, součást „${f.parentFaction}“` : ''}`]
  const links = [list(f.characters) && `členové: ${list(f.characters)}`, list(f.locations) && `lokace: ${list(f.locations)}`].filter(Boolean)
  if (links.length) lines.push(`  (${links.join('; ')})`)
  if (f.goals.length) lines.push(`  Cíle: ${f.goals.join('; ')}`)
  if (f.relations.length) lines.push(`  Vztahy: ${f.relations.map(r => `${r.faction} – ${STANCE[r.stance]}${r.note.trim() ? ` (${r.note.trim()})` : ''}`).join('; ')}`)
  if (f.description.trim()) lines.push(indent(f.description))
  const secret = f.secrets.trim() ? `- ${label(f.title, f.id)}:\n${indent(f.secrets)}` : ''
  return { text: lines.join('\n'), secret }
}

function locationBlock(l: StoryLocation): Pick<ContextBlock, 'text' | 'secret'> {
  const lines = [`- ${label(l.title, l.id)} – ${l.type}, ${LOCATION_STATUS[l.status]}${l.parentLocation ? `, leží v „${l.parentLocation}“` : ''}`]
  if (l.description.trim()) lines.push(indent(l.description))
  const secret = l.secrets.trim() ? `- ${label(l.title, l.id)}:\n${indent(l.secrets)}` : ''
  return { text: lines.join('\n'), secret }
}

function loreBlock(l: LoreEntry): Pick<ContextBlock, 'text' | 'secret'> {
  const lines = [`- ${label(l.title, l.id)} – ${l.type}, ${LORE_TRUTH[l.truth]}, ${LORE_KNOWLEDGE[l.knowledge]}`]
  if (l.content.trim()) lines.push(indent(l.content))
  const secret = l.secrets.trim() ? `- ${label(l.title, l.id)}:\n${indent(l.secrets)}` : ''
  return { text: lines.join('\n'), secret }
}

// ---------- výběr ----------

const DISTANCE_SCORE = [100, 60, 30]

/** Sestaví kontext kampaně pro danou scénu. */
export function buildSceneContext(detail: GameDetail, scene: SceneMeta, options: ContextBuilderOptions): SceneContext {
  const charsPerToken = options.charsPerToken ?? DEFAULT_CHARS_PER_TOKEN
  const summaryShare = options.summaryShare ?? 0.3
  const recencyMs = (options.recencyDays ?? 7) * 86_400_000
  const now = options.now ?? Date.now()
  const tokens = (text: string) => estimateTokens(text, charsPerToken)

  const nodes = buildGraph(detail)
  const seeds = [...scene.characters.map(n => key('character', n)), ...(scene.location ? [key('location', scene.location)] : [])]
  const dist = distances(nodes, seeds, 2)
  const sceneCharacters = new Set(scene.characters)

  const candidates: ContextBlock[] = []
  const push = (kind: ContextBlock['kind'], id: string, name: string, block: Pick<ContextBlock, 'text' | 'secret'>, score: number) => {
    candidates.push({ kind, id, name, score, ...block })
  }
  const base = (kind: NodeKind, name: string, updatedAt: number): number | null => {
    const d = dist.get(key(kind, name))
    if (d === undefined) return null
    return DISTANCE_SCORE[d] + (now - updatedAt < recencyMs ? 10 : 0)
  }

  for (const t of detail.threads) {
    let score = base('thread', t.title, t.updatedAt)
    // Nitě vzniklé v této scéně jsou relevantní i bez vazby na její postavy
    if (t.scene === scene.title) score = (score ?? 20) + 30
    if (score === null) continue
    if (!OPEN_THREAD_STATUSES.includes(t.status)) score -= 40
    else if (t.status === 'escalated') score += 15
    push('thread', t.id, t.title, threadBlock(t), score)
  }
  for (const q of detail.quests) {
    let score = base('quest', q.title, q.updatedAt)
    if (score === null) continue
    if (!OPEN_QUEST_STATUSES.includes(q.status)) score -= 40
    else if (q.status === 'active') score += 15
    push('quest', q.id, q.title, questBlock(q), score)
  }
  for (const f of detail.factions) {
    let score = base('faction', f.title, f.updatedAt)
    if (score === null) continue
    if (f.status !== 'active') score -= 20
    push('faction', f.id, f.title, factionBlock(f), score)
  }
  for (const l of detail.locations) {
    const score = base('location', l.title, l.updatedAt)
    if (score === null) continue
    push('location', l.id, l.title, locationBlock(l), score)
  }
  for (const l of detail.lore) {
    const score = base('lore', l.title, l.updatedAt)
    if (score === null) continue
    push('lore', l.id, l.title, loreBlock(l), score)
  }
  for (const c of detail.setup.characters) {
    if (sceneCharacters.has(c.name)) continue
    const score = base('character', c.name, 0)
    if (score === null) continue
    const text = `- ${label(c.nickname === c.name ? c.name : `${c.nickname} (${c.name})`, c.id)}${c.notes.trim() ? `\n${indent(c.notes)}` : ''}`
    push('character', c.id, c.name, { text, secret: '' }, score - 20)
  }
  candidates.sort((a, b) => b.score - a.score || a.name.localeCompare(b.name, 'cs'))

  // Shrnutí předchozích scén – od nejnovější, přednostně do vyhrazeného podílu rozpočtu
  const summaries: ContextBlock[] = detail.scenes
    .filter(s => s.id !== scene.id && s.order < scene.order && s.summary.trim())
    .sort((a, b) => b.order - a.order)
    .map(s => ({ kind: 'summary', id: s.id, name: s.title, text: `### ${s.title} (id: ${s.id})\n${s.summary.trim()}`, secret: '', score: 0 }))

  const budget = options.budgetTokens
  const summaryBudget = Math.floor(budget * summaryShare)
  const chosen: ContextBlock[] = []
  let used = 0
  let dropped = 0
  for (const s of summaries) {
    const cost = tokens(s.text)
    if (used + cost > summaryBudget) {
      dropped++
      continue
    }
    used += cost
    chosen.push(s)
  }
  for (const c of candidates) {
    const cost = tokens(c.text) + tokens(c.secret)
    if (used + cost > budget) {
      dropped++
      continue
    }
    used += cost
    chosen.push(c)
  }

  // Sekce v pevném pořadí; shrnutí chronologicky (nejstarší první), ostatní podle skóre
  const sections: string[] = []
  for (const kind of SECTION_ORDER) {
    const blocks = chosen.filter(b => b.kind === kind)
    if (!blocks.length) continue
    if (kind === 'summary') blocks.reverse()
    sections.push(`## ${SECTION_TITLE[kind]}\n${blocks.map(b => b.text).join('\n')}`)
  }
  const secrets = chosen.filter(b => b.secret).map(b => b.secret)
  if (secrets.length) sections.push(`## Tajemství (hráč nezná – využij je, ale neprozrazuj přímo)\n${secrets.join('\n')}`)

  return {
    sections,
    included: chosen.map(b => `${KIND_LABEL[b.kind]}: ${b.name} (${b.id})`),
    dropped,
    tokensUsed: used,
  }
}

/**
 * Ořez přepisu scény na rozpočet tokenů – zachová nejnovější záznamy. Vrací index prvního zachovaného záznamu
 * (0 = nic se nevynechalo).
 */
export function transcriptCutoff(entryTexts: readonly string[], budgetTokens: number, charsPerToken = DEFAULT_CHARS_PER_TOKEN): number {
  let used = 0
  for (let i = entryTexts.length - 1; i >= 0; i--) {
    used += estimateTokens(entryTexts[i], charsPerToken) + 2
    if (used > budgetTokens) return i + 1
  }
  return 0
}
