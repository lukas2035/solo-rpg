import type { ObjectiveStatus, QuestStatus, QuestType } from '@solo-rpg/shared'

/** České popisky a barvy výčtů questů; hodnoty v souborech jsou stabilní anglické klíče */

export const QUEST_TYPE_LABELS: Record<QuestType, string> = {
  main: 'Hlavní',
  side: 'Vedlejší',
  personal: 'Osobní',
  investigation: 'Pátrání',
  faction: 'Frakční',
  exploration: 'Průzkum',
  survival: 'Přežití',
}

export const QUEST_TYPE_HINTS: Record<QuestType, string> = {
  main: 'Důležitý pro hlavní děj kampaně.',
  side: 'Vedlejší úkol, který není nutný pro hlavní děj.',
  personal: 'Přímo spojený s jednou nebo více konkrétními postavami.',
  investigation: 'Založený na pátrání, hledání informací nebo odhalování pravdy.',
  faction: 'Navázaný na konkrétní organizaci, klan, stát, gang…',
  exploration: 'Objevování lokací, cestování, průzkum.',
  survival: 'Přežití, útěk, ochrana nebo zvládnutí krize.',
}

export const QUEST_TYPE_ICONS: Record<QuestType, string> = {
  main: '⭐',
  side: '📌',
  personal: '👤',
  investigation: '🔍',
  faction: '🏴',
  exploration: '🧭',
  survival: '🔥',
}

export const QUEST_STATUS_LABELS: Record<QuestStatus, string> = {
  available: 'Dostupný',
  active: 'Aktivní',
  paused: 'Odložený',
  completed: 'Splněný',
  failed: 'Neúspěšný',
  abandoned: 'Opuštěný',
}

export const QUEST_STATUS_HINTS: Record<QuestStatus, string> = {
  available: 'Postavy o questu vědí a mohou ho přijmout, ale zatím ho neřeší.',
  active: 'Quest se právě aktivně řeší.',
  paused: 'Dočasně odložený; lze se k němu vrátit.',
  completed: 'Úspěšně dokončený.',
  failed: 'Původní cíl už nelze splnit nebo skončil neúspěchem.',
  abandoned: 'Postavy se rozhodly quest přestat řešit.',
}

/** Barva odznaku stavu (Tailwind třídy) */
export const QUEST_STATUS_CLASS: Record<QuestStatus, string> = {
  available: 'border-slate-400/60 text-slate-200 bg-slate-500/20',
  active: 'border-amber-400/70 text-amber-200 bg-amber-500/20',
  paused: 'border-sky-400/60 text-sky-200 bg-sky-500/20',
  completed: 'border-emerald-500/60 text-emerald-200 bg-emerald-600/20',
  failed: 'border-red-500/70 text-red-200 bg-red-600/25',
  abandoned: 'border-gray-500/50 text-gray-400 bg-gray-700/30',
}

export const OBJECTIVE_STATUS_LABELS: Record<ObjectiveStatus, string> = {
  pending: 'Čeká',
  active: 'Právě řešíme',
  completed: 'Splněný',
  failed: 'Neúspěšný',
  skipped: 'Přeskočený',
}

/** Značka před názvem cíle v seznamech */
export const OBJECTIVE_STATUS_ICONS: Record<ObjectiveStatus, string> = {
  pending: '○',
  active: '◉',
  completed: '●',
  failed: '✕',
  skipped: '–',
}

export const OBJECTIVE_STATUS_CLASS: Record<ObjectiveStatus, string> = {
  pending: 'text-slate-300',
  active: 'text-amber-300',
  completed: 'text-emerald-300',
  failed: 'text-red-300',
  skipped: 'text-gray-500',
}

export const QUEST_TYPES = Object.keys(QUEST_TYPE_LABELS) as QuestType[]
export const QUEST_STATUSES = Object.keys(QUEST_STATUS_LABELS) as QuestStatus[]
export const OBJECTIVE_STATUSES = Object.keys(OBJECTIVE_STATUS_LABELS) as ObjectiveStatus[]
