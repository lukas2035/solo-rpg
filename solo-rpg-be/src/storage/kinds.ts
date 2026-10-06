import { z } from 'zod'
import {
  FactionStanceSchema,
  FactionStatusSchema,
  FactionTypeSchema,
  LocationStatusSchema,
  LocationTypeSchema,
  LoreKnowledgeSchema,
  LoreTruthSchema,
  LoreTypeSchema,
  QuestObjectiveSchema,
  QuestStatusSchema,
  QuestTypeSchema,
  ThreadCertaintySchema,
  ThreadClockSchema,
  ThreadHorizonSchema,
  ThreadStatusSchema,
  ThreadTypeSchema,
} from '@solo-rpg/shared'
import type { EntityKind } from './ids.js'

/**
 * Tvar `entities.fields` per `kind` (JSONB) + verze a migrace.
 *
 * Pravidla (docs/ARCHITECTURE_V2.md §3.3):
 * - `fields` se nikdy nečtou bez průchodu Zodem (`parseFields`).
 * - Změna schématu = `CURRENT_VERSION++` + migrační funkce (v → v+1) ve stejném commitu.
 * - Migrace neztrácí informaci: co nejde namapovat, patří do `_legacy`.
 *
 * Vazby na jiné entity v `fields` NEJSOU – ty jsou v tabulce `links` (viz LINK_SPECS níže).
 * Obrázky jsou ve sloupcích `image_asset_id` / `image_url`, uživatelské poznámky ve sloupci `notes`.
 */

const legacy = { _legacy: z.unknown().optional() }

export const CharacterFields = z.object({ firstName: z.string(), lastName: z.string(), nickname: z.string(), ...legacy })
export const NarratorFields = z.object({ description: z.string(), aiPrompt: z.string(), ...legacy })
export const SceneFields = z.object({ description: z.string(), ai: z.boolean(), aiPrompt: z.string(), summary: z.string(), ...legacy })
export const ThreadFields = z.object({
  type: ThreadTypeSchema,
  status: ThreadStatusSchema,
  horizon: ThreadHorizonSchema,
  certainty: ThreadCertaintySchema,
  revealCondition: z.string(),
  clock: ThreadClockSchema.nullable(),
  description: z.string(),
  ...legacy,
})
export const FactionFields = z.object({
  type: FactionTypeSchema,
  status: FactionStatusSchema,
  stance: FactionStanceSchema,
  goals: z.array(z.string()),
  description: z.string(),
  secrets: z.string(),
  ...legacy,
})
export const QuestFields = z.object({
  type: QuestTypeSchema,
  status: QuestStatusSchema,
  objectives: z.array(QuestObjectiveSchema),
  rewards: z.array(z.string()),
  description: z.string(),
  outcome: z.string(),
  ...legacy,
})
export const LocationFields = z.object({ type: LocationTypeSchema, status: LocationStatusSchema, description: z.string(), secrets: z.string(), ...legacy })
export const LoreFields = z.object({
  type: LoreTypeSchema,
  truth: LoreTruthSchema,
  knowledge: LoreKnowledgeSchema,
  content: z.string(),
  secrets: z.string(),
  ...legacy,
})
export const SessionFields = z.object({
  startedAt: z.number(),
  endedAt: z.number(),
  durationSeconds: z.number().int().min(0),
  fun: z.number(),
  description: z.string(),
  ...legacy,
})

export const FIELD_SCHEMAS = {
  character: CharacterFields,
  narrator: NarratorFields,
  scene: SceneFields,
  thread: ThreadFields,
  faction: FactionFields,
  quest: QuestFields,
  location: LocationFields,
  lore: LoreFields,
  session: SessionFields,
} satisfies Record<EntityKind, z.ZodTypeAny>

export type FieldsOf<K extends EntityKind> = z.infer<(typeof FIELD_SCHEMAS)[K]>

type Migration = (old: unknown) => unknown

/** Aktuální verze tvaru `fields` per kind a řetězec migrací `migrations[v]` převádí v → v+1 */
export const KIND_VERSIONS: Record<EntityKind, { current: number; migrations: Record<number, Migration> }> = {
  character: { current: 1, migrations: {} },
  narrator: { current: 1, migrations: {} },
  scene: { current: 1, migrations: {} },
  thread: { current: 1, migrations: {} },
  faction: { current: 1, migrations: {} },
  quest: { current: 1, migrations: {} },
  location: { current: 1, migrations: {} },
  lore: { current: 1, migrations: {} },
  session: { current: 1, migrations: {} },
}

/** Projde řetězcem migrací od `storedVersion` k aktuální verzi a zvaliduje výsledek. */
export function parseFields<K extends EntityKind>(kind: K, raw: unknown, storedVersion: number): FieldsOf<K> {
  const { current, migrations } = KIND_VERSIONS[kind]
  let data = raw
  for (let v = storedVersion; v < current; v++) {
    const migrate = migrations[v]
    if (!migrate) throw new Error(`Chybí migrace fields pro ${kind} v${v} → v${v + 1}.`)
    data = migrate(data)
  }
  return FIELD_SCHEMAS[kind].parse(data) as FieldsOf<K>
}

export function currentVersion(kind: EntityKind): number {
  return KIND_VERSIONS[kind].current
}

// ---------- hrany ----------

export interface LinkSpec {
  /** Druh cílové entity */
  target: EntityKind
  /** `one` = nejvýš jedna hrana (leader, parent, scene, location), `many` = seznam s pořadím */
  cardinality: 'one' | 'many'
  /** Hrana nese data (vztah frakcí: { stance, note }) */
  withData?: boolean
}

/**
 * Hrany, které v1 API vyjadřuje jako pole s názvy; klíč = název pole v API = `links.kind`.
 * Z (kind zdrojové entity, kind hrany) plyne cílový kind, takže převod jméno ↔ id je mechanický.
 */
export const LINK_SPECS: Record<EntityKind, Record<string, LinkSpec>> = {
  character: {},
  narrator: {},
  scene: {
    characters: { target: 'character', cardinality: 'many' },
    aiCharacters: { target: 'character', cardinality: 'many' },
    location: { target: 'location', cardinality: 'one' },
  },
  thread: {
    characters: { target: 'character', cardinality: 'many' },
    scene: { target: 'scene', cardinality: 'one' },
    factions: { target: 'faction', cardinality: 'many' },
    locations: { target: 'location', cardinality: 'many' },
  },
  faction: {
    leader: { target: 'character', cardinality: 'one' },
    parent: { target: 'faction', cardinality: 'one' },
    characters: { target: 'character', cardinality: 'many' },
    locations: { target: 'location', cardinality: 'many' },
    relation: { target: 'faction', cardinality: 'many', withData: true },
  },
  quest: {
    questGiver: { target: 'character', cardinality: 'one' },
    parent: { target: 'quest', cardinality: 'one' },
    characters: { target: 'character', cardinality: 'many' },
    threads: { target: 'thread', cardinality: 'many' },
    factions: { target: 'faction', cardinality: 'many' },
    locations: { target: 'location', cardinality: 'many' },
  },
  location: {
    parent: { target: 'location', cardinality: 'one' },
  },
  lore: {
    characters: { target: 'character', cardinality: 'many' },
    locations: { target: 'location', cardinality: 'many' },
    factions: { target: 'faction', cardinality: 'many' },
    quests: { target: 'quest', cardinality: 'many' },
    threads: { target: 'thread', cardinality: 'many' },
  },
  session: {},
}

export const FactionRelationData = z.object({ stance: FactionStanceSchema, note: z.string() })
export type FactionRelationData = z.infer<typeof FactionRelationData>
