import {
  NO_ROLL_OBSTACLES,
  OPEN_QUEST_STATUSES,
  OPEN_THREAD_STATUSES,
  type BeatKind,
  type BriefMode,
  type BriefPatch,
  type CampaignPulse,
  type EventType,
  type GameDetail,
  type NarrativeBrief,
  type ObstacleKind,
  type Quest,
  type RulesSystem,
  type SceneMeta,
  type StoryThread,
} from '@solo-rpg/shared'
import { newId } from '../storage/ids.js'
import { createRng, weightedPick, type Rng } from './rng.js'
import { difficultyLabel } from './rulesAdapter.js'
import { loadDirectorTables, tensionBand, type DirectorTables } from './tables.js'

/**
 * Director v1 – z pulsu a tabulek sestaví `NarrativeBrief` (docs/ARCHITECTURE_V2.md §4.1). Čistá funkce se seeded RNG:
 * stejný seed nad stejným stavem = stejný brief. Konkrétní entity (nit, quest, frakce) vybírá aplikace podle vazeb
 * na scénu, ne AI.
 */

export interface BuildBriefInput {
  detail: GameDetail
  scene: SceneMeta
  pulse: CampaignPulse
  seed: number
  rulesSystem: RulesSystem
  now?: number
  tables?: DirectorTables
}

const overlap = (a: readonly string[], b: ReadonlySet<string>): number => a.filter(x => b.has(x)).length

/** Skóre nitě vůči scéně: stav + sdílené postavy + lokace + hodiny */
function threadScore(t: StoryThread, chars: ReadonlySet<string>, location: string | null): number {
  let s = t.status === 'escalated' ? 3 : t.status === 'active' ? 2 : 1
  s += Math.min(2, overlap(t.characters, chars)) * 2
  if (location && t.locations.includes(location)) s += 1
  if (t.clock && t.clock.current / t.clock.max >= 0.5) s += 1
  return s
}

function questScore(q: Quest, chars: ReadonlySet<string>, location: string | null): number {
  let s = q.status === 'active' ? 2 : q.status === 'available' ? 1 : 0.5
  s += Math.min(2, overlap(q.characters, chars)) * 2
  if (location && q.locations.includes(location)) s += 1
  return s
}

/** Vážený los mezi nejvýš třemi nejlepšími kandidáty (ať se nestřídá pořád jen jeden) */
function pickTop<T>(rng: Rng, items: readonly T[], score: (item: T) => number): T | null {
  if (items.length === 0) return null
  const ranked = items.map(item => ({ item, score: score(item) })).sort((a, b) => b.score - a.score).slice(0, 3)
  const weights: Record<string, number> = {}
  ranked.forEach((r, i) => (weights[String(i)] = Math.max(0.1, r.score)))
  return ranked[Number(weightedPick(rng, weights))]!.item
}

export function buildBrief(input: BuildBriefInput): NarrativeBrief {
  const tables = input.tables ?? loadDirectorTables()
  const { detail, scene, pulse } = input
  const rng = createRng(input.seed)
  const band = tensionBand(pulse.tension)

  // Dluh následků má přednost před tabulkami: příběh musí nejdřív zaplatit
  const forcedConsequence = pulse.consequenceDebt > 0
  let mode: BriefMode = forcedConsequence ? 'event' : weightedPick(rng, tables.mode[pulse.phase])
  let beatKind: BeatKind = forcedConsequence ? 'consequence' : weightedPick(rng, tables.beatKind[pulse.phase])

  const twistChance = Math.min(tables.twist.max, tables.twist.base + tables.twist.perBeat * pulse.beatsSinceTwist)
  const twist = !forcedConsequence && rng.next() < twistChance
  if (twist) {
    beatKind = 'reveal'
    mode = 'event'
  }

  let eventType: EventType | null = null
  if (mode === 'event') {
    eventType = weightedPick(rng, tables.eventType[pulse.phase])
    if (forcedConsequence && eventType === 'reward') eventType = 'obstacle'
  }
  // Překážka má podobu – boj/střet nebo dilema se neřeší jedním hodem na obtížnost
  const obstacleKind: ObstacleKind | null = eventType === 'obstacle' ? weightedPick(rng, tables.obstacleKind[band]) : null

  const noRoll = eventType === 'reward' || (obstacleKind !== null && NO_ROLL_OBSTACLES.includes(obstacleKind)) || rng.next() < tables.noRollChance[mode]
  const difficulty = noRoll ? null : Number(weightedPick(rng, tables.difficulty[band]))
  const stakes = weightedPick(rng, tables.stakes[band])

  const chars = new Set(scene.characters)
  const thread = pickTop(
    rng,
    detail.threads.filter(t => OPEN_THREAD_STATUSES.includes(t.status)),
    t => threadScore(t, chars, scene.location),
  )
  const quest = pickTop(
    rng,
    detail.quests.filter(q => OPEN_QUEST_STATUSES.includes(q.status)),
    q => questScore(q, chars, scene.location),
  )
  const faction = thread?.factions[0] ?? quest?.factions[0] ?? null

  return {
    id: newId('brief'),
    sceneId: scene.id,
    seed: input.seed,
    mode,
    eventType,
    obstacleKind,
    beatKind,
    difficulty,
    difficultyLabel: difficultyLabel(input.rulesSystem, difficulty),
    stakes,
    twist,
    focus: {
      characters: [...scene.characters],
      thread: thread?.title ?? null,
      quest: quest?.title ?? null,
      faction,
      location: scene.location,
    },
    outcome: null,
    notes: '',
    pulse,
    createdAt: input.now ?? Date.now(),
  }
}

/**
 * Ruční úprava hráče; drží konzistenci (continue → bez eventType, překážka má podobu, boj/dilema bez hodu,
 * bez hodu → bez outcome) a přepočítá popisek obtížnosti
 */
export function applyBriefPatch(brief: NarrativeBrief, patch: BriefPatch, rulesSystem: RulesSystem): NarrativeBrief {
  const next: NarrativeBrief = { ...brief, ...stripUndefined(patch), focus: { ...brief.focus, ...stripUndefined(patch.focus ?? {}) } }
  if (next.mode === 'continue') next.eventType = null
  else if (next.eventType === null) next.eventType = 'neutral'
  if (next.eventType !== 'obstacle') next.obstacleKind = null
  else if (next.obstacleKind === null) next.obstacleKind = 'check'
  if (next.obstacleKind !== null && NO_ROLL_OBSTACLES.includes(next.obstacleKind)) next.difficulty = null
  if (next.twist) next.beatKind = 'reveal'
  if (next.difficulty === null) next.outcome = null
  next.difficultyLabel = difficultyLabel(rulesSystem, next.difficulty)
  return next
}

function stripUndefined<T extends object>(o: T): Partial<T> {
  return Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined)) as Partial<T>
}
