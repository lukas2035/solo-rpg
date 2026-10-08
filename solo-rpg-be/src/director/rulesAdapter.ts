import type { RulesSystem } from '@solo-rpg/shared'

/**
 * Rules adapter: abstraktní obtížnost 1–5 ↔ konkrétní systém. Director o systému neví, překlad je jen popisek
 * v briefu pro hráče (hází sám) a pro AI (aby neměnila obtížnost).
 */

const LABELS: Record<Exclude<RulesSystem, 'none'>, readonly string[]> = {
  dnd5e: ['DC 10 (snadné)', 'DC 13', 'DC 15 (střední)', 'DC 18', 'DC 20 (velmi těžké)'],
  vtm5e: ['Difficulty 2', 'Difficulty 3', 'Difficulty 4', 'Difficulty 5', 'Difficulty 6'],
  fate: ['+1 (Average)', '+2 (Fair)', '+3 (Good)', '+4 (Great)', '+5 (Superb)'],
}

export const RULES_SYSTEM_LABEL: Record<RulesSystem, string> = {
  none: 'bez systému',
  dnd5e: 'D&D 5e',
  vtm5e: 'Vampire: The Masquerade 5e',
  fate: 'Fate',
}

/** null = bez hodu nebo bez systému (zůstává jen 1–5) */
export function difficultyLabel(system: RulesSystem, difficulty: number | null): string | null {
  if (difficulty === null || system === 'none') return null
  const d = Math.min(5, Math.max(1, Math.round(difficulty)))
  return LABELS[system][d - 1] ?? null
}
