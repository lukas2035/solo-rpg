import type { SceneMeta } from '@solo-rpg/shared'

/** Scéna potřebuje (nové) shrnutí: je zastaralé, nebo má repliky a shrnutí žádné */
export const needsSummary = (s: SceneMeta): boolean => s.summaryStale || (s.entryCount > 0 && !s.summary.trim())
