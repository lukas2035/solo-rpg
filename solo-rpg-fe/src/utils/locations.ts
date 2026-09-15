import type { LocationStatus, LocationType } from '@solo-rpg/shared'

/** České popisky a barvy výčtů lokací; hodnoty v souborech jsou stabilní anglické klíče */

export const LOCATION_TYPE_LABELS: Record<LocationType, string> = {
  continent: 'Kontinent',
  region: 'Region / kraj',
  island: 'Ostrov',
  city: 'Město',
  town: 'Městečko',
  village: 'Vesnice',
  district: 'Čtvrť',
  building: 'Budova',
  dungeon: 'Dungeon / podzemí',
  wilderness: 'Divočina',
  landmark: 'Význačné místo',
  other: 'Jiné',
}

export const LOCATION_TYPE_ICONS: Record<LocationType, string> = {
  continent: '🌍',
  region: '🗺️',
  island: '🏝️',
  city: '🏙️',
  town: '🏘️',
  village: '🛖',
  district: '🏚️',
  building: '🏛️',
  dungeon: '🕳️',
  wilderness: '🌲',
  landmark: '🗿',
  other: '📍',
}

export const LOCATION_STATUS_LABELS: Record<LocationStatus, string> = {
  unknown: 'Neobjevená',
  known: 'Známá',
  visited: 'Navštívená',
  abandoned: 'Opuštěná',
  destroyed: 'Zničená',
}

export const LOCATION_STATUS_HINTS: Record<LocationStatus, string> = {
  unknown: 'Lokace existuje, ale postavy o ní zatím nevědí.',
  known: 'Postavy o místě vědí (slyšely o něm, mají ho na mapě), ale ještě tam nebyly.',
  visited: 'Postavy místo navštívily.',
  abandoned: 'Opuštěné, vylidněné, v troskách – ale stále existuje.',
  destroyed: 'Fakticky zničené.',
}

/** Barva odznaku stavu (Tailwind třídy) */
export const LOCATION_STATUS_CLASS: Record<LocationStatus, string> = {
  unknown: 'border-gray-500/50 text-gray-400 bg-gray-700/30',
  known: 'border-sky-400/60 text-sky-200 bg-sky-500/20',
  visited: 'border-emerald-500/60 text-emerald-200 bg-emerald-600/20',
  abandoned: 'border-amber-400/60 text-amber-200 bg-amber-500/20',
  destroyed: 'border-red-500/50 text-red-300 bg-red-900/30',
}

export const LOCATION_TYPES = Object.keys(LOCATION_TYPE_LABELS) as LocationType[]
export const LOCATION_STATUSES = Object.keys(LOCATION_STATUS_LABELS) as LocationStatus[]
