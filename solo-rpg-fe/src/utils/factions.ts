import type { FactionStance, FactionStatus, FactionType } from '@solo-rpg/shared'

/** České popisky a barvy výčtů frakcí; hodnoty v souborech jsou stabilní anglické klíče */

export const FACTION_TYPE_LABELS: Record<FactionType, string> = {
  political: 'Politická / vládní',
  military: 'Vojenská',
  religious: 'Náboženská',
  criminal: 'Zločinecká',
  commercial: 'Obchodní / cech',
  clan: 'Klan / kmen',
  secret: 'Tajná společnost',
  supernatural: 'Nadpřirozená',
  other: 'Jiná',
}

export const FACTION_TYPE_ICONS: Record<FactionType, string> = {
  political: '🏛️',
  military: '⚔️',
  religious: '🕯️',
  criminal: '🗡️',
  commercial: '💰',
  clan: '🛡️',
  secret: '🎭',
  supernatural: '🔮',
  other: '🏴',
}

export const FACTION_STATUS_LABELS: Record<FactionStatus, string> = {
  active: 'Aktivní',
  dormant: 'Spící',
  disbanded: 'Rozpuštěná',
  destroyed: 'Zničená',
  unknown: 'Neznámý stav',
}

export const FACTION_STATUS_HINTS: Record<FactionStatus, string> = {
  active: 'Frakce normálně existuje a funguje.',
  dormant: 'Existuje, ale je (téměř) neaktivní – spící kult, rozptýlená společnost.',
  disbanded: 'Přestala fungovat jako celek, nebyla nutně zničena.',
  destroyed: 'Fakticky zničená.',
  unknown: 'Není známo, zda a v jakém stavu ještě existuje.',
}

export const FACTION_STANCE_LABELS: Record<FactionStance, string> = {
  allied: 'Spojenec',
  friendly: 'Přátelský',
  neutral: 'Neutrální',
  tense: 'Napjatý',
  hostile: 'Nepřátelský',
  unknown: 'Neznámý',
}

export const FACTION_STANCE_HINTS: Record<FactionStance, string> = {
  allied: 'Otevřený spojenec.',
  friendly: 'Nakloněný, vstřícný.',
  neutral: 'Bez vyhraněného postoje.',
  tense: 'Podezřívavý, soupeřivý, napjatý – ale ne otevřeně nepřátelský.',
  hostile: 'Otevřeně nepřátelský.',
  unknown: 'Postoj zatím není znám.',
}

/** Barva odznaku postoje (Tailwind třídy) */
export const FACTION_STANCE_CLASS: Record<FactionStance, string> = {
  allied: 'border-emerald-500/70 text-emerald-200 bg-emerald-600/25',
  friendly: 'border-teal-400/60 text-teal-200 bg-teal-500/20',
  neutral: 'border-slate-400/60 text-slate-200 bg-slate-500/20',
  tense: 'border-amber-400/70 text-amber-200 bg-amber-500/20',
  hostile: 'border-red-500/70 text-red-200 bg-red-600/25',
  unknown: 'border-gray-500/50 text-gray-400 bg-gray-700/30',
}

export const FACTION_STATUS_CLASS: Record<FactionStatus, string> = {
  active: 'border-[var(--accent)]/70 text-white bg-[var(--accent)]/25',
  dormant: 'border-slate-400/60 text-slate-200 bg-slate-500/20',
  disbanded: 'border-gray-500/50 text-gray-400 bg-gray-700/30',
  destroyed: 'border-red-500/50 text-red-300 bg-red-900/30',
  unknown: 'border-gray-500/50 text-gray-400 bg-gray-700/30',
}

export const FACTION_TYPES = Object.keys(FACTION_TYPE_LABELS) as FactionType[]
export const FACTION_STATUSES = Object.keys(FACTION_STATUS_LABELS) as FactionStatus[]
export const FACTION_STANCES = Object.keys(FACTION_STANCE_LABELS) as FactionStance[]
