import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { z } from 'zod'
import { BeatKindSchema, BriefModeSchema, EventTypeSchema, PacingPhaseSchema, StakesSchema, type PacingPhase } from '@solo-rpg/shared'

/**
 * Náhodné tabulky Directoru jako data (`tables/director-tables.json`), validované při načtení.
 * Později per žánr / uživatelsky editovatelné; kód tabulky jen čte.
 */

const weights = <K extends string>(keys: readonly K[]) =>
  z.object(Object.fromEntries(keys.map(k => [k, z.number().nonnegative()])) as Record<K, z.ZodNumber>)

const perPhase = <T extends z.ZodTypeAny>(inner: T) =>
  z.object(Object.fromEntries(PacingPhaseSchema.options.map(p => [p, inner])) as Record<PacingPhase, T>)

export const TENSION_BANDS = ['low', 'mid', 'high'] as const
export type TensionBand = (typeof TENSION_BANDS)[number]
const perBand = <T extends z.ZodTypeAny>(inner: T) => z.object({ low: inner, mid: inner, high: inner })

export const DIFFICULTIES = ['1', '2', '3', '4', '5'] as const

const DirectorTablesSchema = z.object({
  mode: perPhase(weights(BriefModeSchema.options)),
  eventType: perPhase(weights(EventTypeSchema.options)),
  beatKind: perPhase(weights(BeatKindSchema.options)),
  difficulty: perBand(weights(DIFFICULTIES)),
  stakes: perBand(weights(StakesSchema.options)),
  twist: z.object({ base: z.number().min(0).max(1), perBeat: z.number().min(0).max(1), max: z.number().min(0).max(1) }),
  noRollChance: z.object({ continue: z.number().min(0).max(1), event: z.number().min(0).max(1) }),
})
export type DirectorTables = z.infer<typeof DirectorTablesSchema>

const TABLES_PATH = path.resolve(path.dirname(fileURLToPath(import.meta.url)), 'tables/director-tables.json')

let cached: DirectorTables | null = null

/** Načte (a zacachuje) tabulky; chyba tvaru = chyba při prvním použití, ne tiché špatné váhy */
export function loadDirectorTables(): DirectorTables {
  if (cached) return cached
  const raw = JSON.parse(fs.readFileSync(TABLES_PATH, 'utf8')) as unknown
  cached = DirectorTablesSchema.parse(raw)
  return cached
}

export function tensionBand(tension: number): TensionBand {
  if (tension <= 3) return 'low'
  if (tension <= 6) return 'mid'
  return 'high'
}
