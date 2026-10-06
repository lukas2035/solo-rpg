import { sql } from 'drizzle-orm'
import { boolean, index, integer, jsonb, pgTable, text, timestamp, uniqueIndex } from 'drizzle-orm/pg-core'

/**
 * Schéma Postgresu (v2, viz docs/ARCHITECTURE_V2.md §3).
 *
 * - `entities` je jedna tabulka pro všechny druhy entit (postava, vypravěč, scéna, nit, frakce, quest, lokace, lore, sezení);
 *   společné věci jsou sloupce, zbytek je `fields` (JSONB) validovaný Zod schématem per `kind` (viz kinds.ts).
 * - `links` jsou generické hrany mezi entitami; `kind` hrany = název pole v API (`characters`, `leader`, `parent`, …).
 * - `tenant_id` je zatím konstanta – připravuje multi-tenant SaaS.
 */

export const DEFAULT_TENANT = 'local'

const timestamps = {
  createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
}

export const games = pgTable(
  'games',
  {
    id: text('id').primaryKey(),
    tenantId: text('tenant_id').notNull().default(DEFAULT_TENANT),
    name: text('name').notNull(),
    /** Volné poznámky hráče (tělo game.md v1) – aplikace je nemění */
    notes: text('notes').notNull().default(''),
    /** Popis pravidel hry pod příběhem (GameSettings.rules) */
    rules: text('rules').notNull().default(''),
    rulesInAi: boolean('rules_in_ai').notNull().default(false),
    brightBackground: boolean('bright_background').notNull().default(true),
    /** Pozadí hry: buď lokální asset, nebo vzdálená URL (nejvýš jedno) */
    backgroundAssetId: text('background_asset_id'),
    backgroundUrl: text('background_url'),
    /** Aktuální vypravěč (entita kind=narrator); FK se řeší aplikačně, aby šlo smazat vypravěče bez cyklu FK */
    currentNarratorId: text('current_narrator_id'),
    ...timestamps,
  },
  table => [uniqueIndex('games_tenant_name_idx').on(table.tenantId, sql`lower(${table.name})`)],
)

export const entities = pgTable(
  'entities',
  {
    id: text('id').primaryKey(),
    tenantId: text('tenant_id').notNull().default(DEFAULT_TENANT),
    gameId: text('game_id')
      .notNull()
      .references(() => games.id, { onDelete: 'cascade' }),
    kind: text('kind').notNull(),
    /** Zobrazované jméno / název; u sezení String(startedAt) */
    name: text('name').notNull(),
    aliases: text('aliases').array().notNull().default(sql`'{}'::text[]`),
    /** Data specifická pro `kind`, tvar určuje Zod schéma dané verze */
    fields: jsonb('fields').notNull().default({}),
    schemaVersion: integer('schema_version').notNull().default(1),
    /** Obrázek entity (portrét, emblém, obrázek scény/lokace): lokální asset nebo vzdálená URL */
    imageAssetId: text('image_asset_id'),
    imageUrl: text('image_url'),
    /** Text vlastněný uživatelem (poznámky) – AI do něj nezasahuje */
    notes: text('notes').notNull().default(''),
    /** Text vlastněný AI („aktuální stav“ entity) */
    aiState: text('ai_state').notNull().default(''),
    /** Pořadí v seznamu (postavy/vypravěči v pásu, scény 1..n) */
    sortOrder: integer('sort_order').notNull().default(0),
    ...timestamps,
  },
  table => [
    index('entities_game_kind_idx').on(table.gameId, table.kind),
    uniqueIndex('entities_game_kind_name_idx').on(table.gameId, table.kind, sql`lower(${table.name})`),
  ],
)

export const links = pgTable(
  'links',
  {
    id: integer('id').primaryKey().generatedAlwaysAsIdentity(),
    gameId: text('game_id')
      .notNull()
      .references(() => games.id, { onDelete: 'cascade' }),
    fromId: text('from_id')
      .notNull()
      .references(() => entities.id, { onDelete: 'cascade' }),
    toId: text('to_id')
      .notNull()
      .references(() => entities.id, { onDelete: 'cascade' }),
    /** Význam hrany z pohledu zdrojové entity (`characters`, `aiCharacters`, `leader`, `parent`, `relation`, …) */
    kind: text('kind').notNull(),
    /** Pořadí v rámci (from, kind) – seznamy postav scény apod. */
    position: integer('position').notNull().default(0),
    /** Doplňková data hrany (vztah frakcí: stance + note) */
    data: jsonb('data'),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
  },
  table => [
    uniqueIndex('links_from_kind_to_idx').on(table.fromId, table.kind, table.toId),
    index('links_to_idx').on(table.toId),
  ],
)

export const sceneEntries = pgTable(
  'scene_entries',
  {
    /** Id záznamu (generuje FE / import); unikátní v rámci scény */
    id: text('id').notNull(),
    gameId: text('game_id')
      .notNull()
      .references(() => games.id, { onDelete: 'cascade' }),
    sceneId: text('scene_id')
      .notNull()
      .references(() => entities.id, { onDelete: 'cascade' }),
    position: integer('position').notNull(),
    /** 'character' | 'narrator' */
    speakerKind: text('speaker_kind').notNull(),
    /** Entita mluvčího; null = mluvčí bez entity (dočasná postava / starý zápis bez vypravěče) */
    speakerId: text('speaker_id').references(() => entities.id, { onDelete: 'set null' }),
    /** Snímek jména mluvčího – použije se, když `speakerId` chybí nebo byla entita smazána */
    speakerName: text('speaker_name'),
    text: text('text').notNull(),
    markdown: boolean('markdown').notNull().default(false),
    timestamp: timestamp('timestamp', { withTimezone: true, mode: 'date' }).notNull(),
  },
  table => [uniqueIndex('scene_entries_scene_id_idx').on(table.sceneId, table.id), index('scene_entries_scene_pos_idx').on(table.sceneId, table.position)],
)

export const assets = pgTable(
  'assets',
  {
    id: text('id').primaryKey(),
    tenantId: text('tenant_id').notNull().default(DEFAULT_TENANT),
    gameId: text('game_id')
      .notNull()
      .references(() => games.id, { onDelete: 'cascade' }),
    kind: text('kind').notNull(),
    mime: text('mime').notNull(),
    /** Přípona včetně tečky (`.png`) – součást veřejné cesty `assets/<id><ext>` */
    ext: text('ext').notNull(),
    size: integer('size').notNull(),
    sha256: text('sha256').notNull(),
    /** Klíč v AssetStore (`ab/cd/<sha256><ext>`) */
    storageKey: text('storage_key').notNull(),
    /** Původní název souboru (informativně) */
    originalName: text('original_name'),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
  },
  table => [index('assets_game_idx').on(table.gameId)],
)

export const events = pgTable(
  'events',
  {
    id: integer('id').primaryKey().generatedAlwaysAsIdentity(),
    tenantId: text('tenant_id').notNull().default(DEFAULT_TENANT),
    gameId: text('game_id')
      .notNull()
      .references(() => games.id, { onDelete: 'cascade' }),
    sceneId: text('scene_id'),
    kind: text('kind').notNull(),
    payload: jsonb('payload').notNull().default({}),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
  },
  table => [index('events_game_created_idx').on(table.gameId, table.createdAt)],
)

export type GameRow = typeof games.$inferSelect
export type EntityRow = typeof entities.$inferSelect
export type LinkRow = typeof links.$inferSelect
export type SceneEntryRow = typeof sceneEntries.$inferSelect
export type AssetRow = typeof assets.$inferSelect
