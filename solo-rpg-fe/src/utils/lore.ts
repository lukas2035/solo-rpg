import type { LoreKnowledge, LoreTruth, LoreType } from '@solo-rpg/shared'

/** České popisky a barvy výčtů lore; hodnoty v souborech jsou stabilní anglické klíče */

export const LORE_TYPE_LABELS: Record<LoreType, string> = {
  history: 'Historie',
  legend: 'Legenda / mýtus',
  religion: 'Náboženství',
  culture: 'Kultura / zvyky',
  magic: 'Magie / fenomén',
  cosmology: 'Kosmologie',
  politics: 'Politika',
  event: 'Událost',
  prophecy: 'Proroctví',
  other: 'Jiné',
}

export const LORE_TYPE_HINTS: Record<LoreType, string> = {
  history: 'Co se ve světě skutečně stalo – války, dynastie, pády měst.',
  legend: 'Pověst, mýtus, báje – vypráví se, ale pravdivost je otázkou.',
  religion: 'Bohové, kulty, víra, rituály.',
  culture: 'Zvyky, tradice, společenská pravidla, jazyk.',
  magic: 'Magické zákony, artefakty, nadpřirozené jevy.',
  cosmology: 'Uspořádání světa, sféry, původ všeho.',
  politics: 'Mocenské vztahy, zákony, dohody.',
  event: 'Konkrétní událost (současná i minulá), o které se mluví.',
  prophecy: 'Věštba, proroctví, předtucha.',
  other: 'Cokoliv jiného.',
}

export const LORE_TYPE_ICONS: Record<LoreType, string> = {
  history: '📜',
  legend: '🐉',
  religion: '🕯️',
  culture: '🎭',
  magic: '✨',
  cosmology: '🌌',
  politics: '⚖️',
  event: '📅',
  prophecy: '🔮',
  other: '📖',
}

export const LORE_TRUTH_LABELS: Record<LoreTruth, string> = {
  unknown: 'Nerozhodnuto',
  confirmed: 'Pravda',
  partial: 'Částečná pravda',
  debunked: 'Nepravda',
}

export const LORE_TRUTH_HINTS: Record<LoreTruth, string> = {
  unknown: 'Zatím není rozhodnuto, zda je to pravda – rozhodne se to během hry.',
  confirmed: 'Ve světě kampaně je to skutečně pravda.',
  partial: 'Zčásti pravda, zčásti zkreslení nebo lež.',
  debunked: 'Ve skutečnosti je to nepravda (i když tomu svět může věřit).',
}

export const LORE_TRUTH_CLASS: Record<LoreTruth, string> = {
  unknown: 'border-gray-500/50 text-gray-400 bg-gray-700/30',
  confirmed: 'border-emerald-500/60 text-emerald-200 bg-emerald-600/20',
  partial: 'border-amber-400/70 text-amber-200 bg-amber-500/20',
  debunked: 'border-red-500/70 text-red-200 bg-red-600/25',
}

export const LORE_KNOWLEDGE_LABELS: Record<LoreKnowledge, string> = {
  unknown: 'Postavy neznají',
  rumored: 'Zaslechly',
  known: 'Znají',
}

export const LORE_KNOWLEDGE_HINTS: Record<LoreKnowledge, string> = {
  unknown: 'Postavy o tom zatím nic nevědí (poznámka pro vypravěče).',
  rumored: 'Postavy to zaslechly jako pověst, útržek, náznak.',
  known: 'Postavy to znají.',
}

export const LORE_KNOWLEDGE_CLASS: Record<LoreKnowledge, string> = {
  unknown: 'border-gray-500/50 text-gray-400 bg-gray-700/30',
  rumored: 'border-sky-400/60 text-sky-200 bg-sky-500/20',
  known: 'border-[var(--accent)]/70 text-white bg-[var(--accent)]/25',
}

export const LORE_TYPES = Object.keys(LORE_TYPE_LABELS) as LoreType[]
export const LORE_TRUTHS = Object.keys(LORE_TRUTH_LABELS) as LoreTruth[]
export const LORE_KNOWLEDGES = Object.keys(LORE_KNOWLEDGE_LABELS) as LoreKnowledge[]
