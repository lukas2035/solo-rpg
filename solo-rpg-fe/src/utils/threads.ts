import type { StoryThread, ThreadCertainty, ThreadHorizon, ThreadStatus, ThreadType } from '@solo-rpg/shared'

/** České popisky a barvy výčtů dějových nití; hodnoty v souborech jsou stabilní anglické klíče */

export const THREAD_TYPE_LABELS: Record<ThreadType, string> = {
  complication: 'Komplikace',
  threat: 'Hrozba',
  mystery: 'Záhada',
  opportunity: 'Příležitost',
  obligation: 'Závazek',
  relationship: 'Vztah',
}

export const THREAD_TYPE_HINTS: Record<ThreadType, string> = {
  complication: 'Následek akce nebo selhání, který může později způsobit problém.',
  threat: 'Existující hrozba, která může aktivně postupovat proti postavám.',
  mystery: 'Nezodpovězená otázka, která může být později odhalena.',
  opportunity: 'Možnost, kterou lze využít, ale nemusí zůstat dostupná navždy.',
  obligation: 'Dluh, slib, dohoda nebo jiná povinnost.',
  relationship: 'Nevyřešený nebo vyvíjející se vztah mezi postavami.',
}

export const THREAD_STATUS_LABELS: Record<ThreadStatus, string> = {
  latent: 'Skrytá',
  active: 'Aktivní',
  escalated: 'Eskalovaná',
  resolved: 'Vyřešená',
  expired: 'Vyhaslá',
}

export const THREAD_STATUS_HINTS: Record<ThreadStatus, string> = {
  latent: 'Nit existuje, ale zatím se ve hře neprojevuje.',
  active: 'Nit se už reálně projevuje ve hře.',
  escalated: 'Situace se výrazně zhoršila nebo posunula výš.',
  resolved: 'Nit je uzavřená (ne nutně dobře), už nevisí nad kampaní.',
  expired: 'Nit přestala být relevantní, aniž by se vyřešila.',
}

export const THREAD_HORIZON_LABELS: Record<ThreadHorizon, string> = {
  immediate: 'Hned',
  'short-term': 'Brzy',
  'long-term': 'Dlouhodobě',
}

export const THREAD_HORIZON_HINTS: Record<ThreadHorizon, string> = {
  immediate: 'Může ovlivnit aktuální nebo bezprostředně následující scénu.',
  'short-term': 'Může se projevit během několika dalších scén.',
  'long-term': 'Dlouhodobá nit nebo hrozba na pozadí kampaně.',
}

export const THREAD_CERTAINTY_LABELS: Record<ThreadCertainty, string> = {
  confirmed: 'Potvrzené',
  unresolved: 'Nejisté',
}

export const THREAD_CERTAINTY_HINTS: Record<ThreadCertainty, string> = {
  confirmed: 'Okolnost nitě ve fikci skutečně existuje.',
  unresolved: 'Zatím není jisté, zda se to skutečně stalo (rozhodne se později, např. orákulem).',
}

/** Barva odznaku stavu (Tailwind třídy) */
export const THREAD_STATUS_CLASS: Record<ThreadStatus, string> = {
  latent: 'border-slate-400/60 text-slate-200 bg-slate-500/20',
  active: 'border-amber-400/70 text-amber-200 bg-amber-500/20',
  escalated: 'border-red-500/70 text-red-200 bg-red-600/25',
  resolved: 'border-emerald-500/60 text-emerald-200 bg-emerald-600/20',
  expired: 'border-gray-500/50 text-gray-400 bg-gray-700/30',
}

export const THREAD_TYPE_ICONS: Record<ThreadType, string> = {
  complication: '⚠️',
  threat: '☠️',
  mystery: '❓',
  opportunity: '✨',
  obligation: '🤝',
  relationship: '💞',
}

export const THREAD_TYPES = Object.keys(THREAD_TYPE_LABELS) as ThreadType[]
export const THREAD_STATUSES = Object.keys(THREAD_STATUS_LABELS) as ThreadStatus[]
export const THREAD_HORIZONS = Object.keys(THREAD_HORIZON_LABELS) as ThreadHorizon[]
export const THREAD_CERTAINTIES = Object.keys(THREAD_CERTAINTY_LABELS) as ThreadCertainty[]

/** Textová podoba hodin: `● ● ○ ○  2/4` */
export function clockDots(clock: NonNullable<StoryThread['clock']>): string {
  return `${'●'.repeat(clock.current)}${'○'.repeat(clock.max - clock.current)}`.split('').join(' ')
}
