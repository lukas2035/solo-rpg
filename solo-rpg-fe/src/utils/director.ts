import type { AiMode, BeatKind, DirectorEvent, EventType, ObstacleKind, PacingPhase, RollOutcome, Stakes } from '@solo-rpg/shared'

/** České popisky výčtů Directoru (sdílené mezi panelem Režie a dialogem AI scény) */

export const PHASE_LABEL: Record<PacingPhase, string> = { calm: 'klid', rising: 'stoupá', peak: 'vrchol', aftermath: 'dozvuky' }
export const EVENT_LABEL: Record<EventType, string> = { obstacle: 'překážka', neutral: 'neutrální událost', opportunity: 'příležitost', reward: 'odměna' }
export const OBSTACLE_LABEL: Record<ObstacleKind, string> = {
  check: 'zkouška dovednosti',
  social: 'sociální střet',
  encounter: 'střet / boj',
  hazard: 'nebezpečí prostředí',
  dilemma: 'dilema (volba bez hodu)',
}
export const BEAT_LABEL: Record<BeatKind, string> = { escalation: 'eskalace', consequence: 'následek', resolution: 'rozuzlení', reveal: 'odhalení / zvrat' }
export const BEAT_SHORT: Record<BeatKind, string> = { escalation: 'eskalace', consequence: 'následek', resolution: 'rozuzlení', reveal: 'zvrat' }
export const STAKES_LABEL: Record<Stakes, string> = { low: 'nízké', medium: 'střední', high: 'vysoké' }
export const OUTCOME_LABEL: Record<RollOutcome, string> = { success: 'úspěch', partial: 'částečný úspěch', fail: 'neúspěch' }

export const AI_MODE_LABEL: Record<AiMode, string> = { basic: 'Základní', advanced: 'Pokročilá' }

/** Název události: typ + případná podoba překážky */
export function eventTitle(event: DirectorEvent): string {
  return `${EVENT_LABEL[event.eventType]}${event.obstacleKind ? ` – ${OBSTACLE_LABEL[event.obstacleKind]}` : ''}`
}
