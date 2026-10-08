import {
  OPEN_QUEST_STATUSES,
  OPEN_THREAD_STATUSES,
  type BeatKind,
  type CampaignPulse,
  type EventType,
  type GameDetail,
  type PacingPhase,
  type PulseOverride,
  type RollOutcome,
} from '@solo-rpg/shared'

/**
 * `CampaignPulse` – stav kampaně, podle kterého Director mění váhy tabulek (docs/ARCHITECTURE_V2.md §4.1).
 * Čistá funkce nad `GameDetail` + historií přijatých beatů (z `events`, druh `director.beat.accepted`).
 */

/** Přijatý beat tak, jak ho čteme z `events` (nejnovější první) */
export interface BeatRecord {
  beatKind: BeatKind
  eventType: EventType | null
  outcome: RollOutcome | null
  twist: boolean
  createdAt: number
}

/** Kolik posledních beatů ovlivňuje napětí */
const RECENT_BEATS = 5
const MAX_DEBT = 3

function clamp(n: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, n))
}

/** Vlastní fáze z napětí; `aftermath` když poslední beat něco uzavřel */
export function phaseFromTension(tension: number, lastBeat: BeatRecord | null): PacingPhase {
  if (lastBeat && (lastBeat.beatKind === 'resolution' || lastBeat.eventType === 'reward')) return 'aftermath'
  if (tension <= 3) return 'calm'
  if (tension <= 6) return 'rising'
  return 'peak'
}

export function computePulse(detail: GameDetail, beats: readonly BeatRecord[], override: PulseOverride): CampaignPulse {
  const signals: string[] = []
  let tension = 0

  const open = detail.threads.filter(t => OPEN_THREAD_STATUSES.includes(t.status))
  const escalated = open.filter(t => t.status === 'escalated')
  const active = open.filter(t => t.status === 'active')
  if (escalated.length) {
    const add = Math.min(4, escalated.length * 2)
    tension += add
    signals.push(`${escalated.length}× eskalovaná nit (+${add})`)
  }
  if (active.length) {
    const add = Math.min(3, active.length)
    tension += add
    signals.push(`${active.length}× aktivní nit (+${add})`)
  }
  const ticking = open.filter(t => t.clock && t.clock.current / t.clock.max >= 0.75)
  if (ticking.length) {
    const add = Math.min(2, ticking.length)
    tension += add
    signals.push(`hodiny ≥ 75 %: ${ticking.map(t => t.title).join(', ')} (+${add})`)
  }

  const openQuests = detail.quests.filter(q => OPEN_QUEST_STATUSES.includes(q.status))
  const activeQuests = openQuests.filter(q => q.status === 'active')
  if (activeQuests.length >= 2) {
    tension += 1
    signals.push(`${activeQuests.length} aktivní questy (+1)`)
  }

  const recent = beats.slice(0, RECENT_BEATS)
  let recentDelta = 0
  for (const b of recent) {
    if (b.eventType === 'obstacle') recentDelta += 0.5
    if (b.outcome === 'fail') recentDelta += 0.5
    if (b.eventType === 'reward' || b.beatKind === 'resolution') recentDelta -= 1
  }
  recentDelta = Math.round(recentDelta)
  if (recentDelta !== 0) {
    tension += recentDelta
    signals.push(`posledních ${recent.length} beatů (${recentDelta > 0 ? '+' : ''}${recentDelta})`)
  }

  tension = clamp(Math.round(tension), 0, 10)
  if (signals.length === 0) signals.push('žádné otevřené nitě ani questy – klid')

  // Dluh následků: neúspěch přidá, beat typu consequence umoří (od nejstaršího k nejnovějšímu)
  let consequenceDebt = 0
  for (const b of [...beats].reverse()) {
    if (b.beatKind === 'consequence') consequenceDebt = Math.max(0, consequenceDebt - 1)
    if (b.outcome === 'fail') consequenceDebt = Math.min(MAX_DEBT, consequenceDebt + 1)
  }
  if (consequenceDebt > 0) signals.push(`dluh následků: ${consequenceDebt}`)

  const twistIndex = beats.findIndex(b => b.twist)
  const beatsSinceTwist = twistIndex === -1 ? beats.length : twistIndex

  const finalTension = override.tension ?? tension
  const phase = override.phase ?? phaseFromTension(finalTension, beats[0] ?? null)

  return {
    tension: finalTension,
    phase,
    consequenceDebt,
    beatsSinceTwist,
    openThreads: open.length,
    escalatedThreads: escalated.length,
    openQuests: openQuests.length,
    overridden: { tension: override.tension !== null, phase: override.phase !== null },
    signals,
  }
}

/** Převod payloadu události `director.beat.accepted` na záznam (neznámý tvar se přeskočí) */
export function beatFromPayload(payload: unknown, createdAt: number): BeatRecord | null {
  if (!payload || typeof payload !== 'object') return null
  const p = payload as Record<string, unknown>
  const brief = (p.brief && typeof p.brief === 'object' ? p.brief : p) as Record<string, unknown>
  if (typeof brief.beatKind !== 'string') return null
  return {
    beatKind: brief.beatKind as BeatKind,
    eventType: typeof brief.eventType === 'string' ? (brief.eventType as EventType) : null,
    outcome: typeof brief.outcome === 'string' ? (brief.outcome as RollOutcome) : null,
    twist: brief.twist === true,
    createdAt,
  }
}
