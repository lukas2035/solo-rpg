import { and, asc, eq, sql } from 'drizzle-orm'
import type {
  Character,
  CharacterInput,
  Faction,
  FactionInput,
  FactionRelation,
  GameDetail,
  GameMeta,
  GameSession,
  GameSessionInput,
  GameSettings,
  GameSetup,
  LocationInput,
  LoreEntry,
  LoreInput,
  Narrator,
  NarratorInput,
  Quest,
  QuestInput,
  QuestObjective,
  SceneInput,
  SceneMeta,
  StoryEntry,
  StoryLocation,
  StoryThread,
  ThreadInput,
} from '@solo-rpg/shared'
import { fullName, isRemoteImage, isValidGameName } from '@solo-rpg/shared'
import { ConflictError, NotFoundError, ValidationError, type AssetInput, type StorageProvider } from '../vault/StorageProvider.js'
import { imageExtension, safeFileName } from '../vault/fsUtils.js'
import { assetKey, sha256, type AssetStore } from './AssetStore.js'
import type { Db } from './db.js'
import { newId, type EntityKind } from './ids.js'
import { currentVersion, FactionRelationData, parseFields, type FieldsOf } from './kinds.js'
import { assets, DEFAULT_TENANT, entities, games, links, sceneEntries, type EntityRow, type GameRow, type LinkRow } from './schema.js'

/** Veřejná cesta lokálního obrázku (`ImageRef`) – FE ji skládá do URL `/vault/<hra>/assets/<id><ext>` */
export const ASSET_PATH_PREFIX = 'assets/'

/** Stejný klíč jako v1 (bez znaků nepovolených v názvu souboru, bez rozlišení velikosti) – kvůli chování importovaných dat */
export function nameKey(name: string): string {
  return safeFileName(name).toLocaleLowerCase('cs')
}

type Tx = Parameters<Parameters<Db['transaction']>[0]>[0]
type Executor = Db | Tx

interface Entity<K extends EntityKind = EntityKind> {
  row: EntityRow
  kind: K
  fields: FieldsOf<K>
  /** Odchozí hrany podle druhu, seřazené podle `position` */
  out: Map<string, LinkRow[]>
}

/** Celá hra načtená do paměti – hry jsou malé (stovky entit), překlad jméno ↔ id je pak triviální. */
class Snapshot {
  readonly byId = new Map<string, Entity>()
  readonly byKind = new Map<EntityKind, Entity[]>()

  constructor(
    readonly game: GameRow,
    rows: EntityRow[],
    linkRows: LinkRow[],
  ) {
    for (const row of rows) {
      const kind = row.kind as EntityKind
      const entity: Entity = { row, kind, fields: parseFields(kind, row.fields, row.schemaVersion), out: new Map() }
      this.byId.set(row.id, entity)
      const list = this.byKind.get(kind) ?? []
      list.push(entity)
      this.byKind.set(kind, list)
    }
    for (const list of this.byKind.values()) list.sort((a, b) => a.row.sortOrder - b.row.sortOrder || a.row.createdAt.getTime() - b.row.createdAt.getTime())
    for (const link of linkRows.sort((a, b) => a.position - b.position)) {
      const from = this.byId.get(link.fromId)
      if (!from) continue
      const list = from.out.get(link.kind) ?? []
      list.push(link)
      from.out.set(link.kind, list)
    }
  }

  list<K extends EntityKind>(kind: K): Entity<K>[] {
    return (this.byKind.get(kind) ?? []) as Entity<K>[]
  }

  get<K extends EntityKind>(kind: K, id: string): Entity<K> | undefined {
    const e = this.byId.get(id)
    return e && e.kind === kind ? (e as Entity<K>) : undefined
  }

  require<K extends EntityKind>(kind: K, id: string): Entity<K> {
    const e = this.get(kind, id)
    if (!e) throw new NotFoundError(`${KIND_LABEL[kind]} „${id}“ neexistuje.`)
    return e
  }

  /** Najde entitu podle jména (klíč jako v1) */
  byName<K extends EntityKind>(kind: K, name: string): Entity<K> | undefined {
    const key = nameKey(name)
    return this.list(kind).find(e => nameKey(e.row.name) === key)
  }

  /** Jediná cílová entita hrany `kind`, nebo null */
  one(entity: Entity, kind: string): Entity | null {
    const link = entity.out.get(kind)?.[0]
    return link ? (this.byId.get(link.toId) ?? null) : null
  }

  /** Cílové entity hrany `kind` v pořadí */
  many(entity: Entity, kind: string): Entity[] {
    return (entity.out.get(kind) ?? []).flatMap(l => this.byId.get(l.toId) ?? [])
  }

  oneName(entity: Entity, kind: string): string | null {
    return this.one(entity, kind)?.row.name ?? null
  }

  manyNames(entity: Entity, kind: string): string[] {
    return this.many(entity, kind).map(e => e.row.name)
  }

  assertNameFree(kind: EntityKind, name: string, exceptId?: string): void {
    const key = nameKey(name)
    if (this.list(kind).some(e => e.row.id !== exceptId && nameKey(e.row.name) === key)) {
      throw new ConflictError(CONFLICT_MESSAGE[kind](name))
    }
  }

  /** Jména → id existujících entit daného druhu; neznámá vypustí, duplicity sloučí, případně vynechá `selfId` */
  resolveMany(kind: EntityKind, names: readonly string[] | undefined, selfId?: string): string[] {
    const result: string[] = []
    for (const raw of names ?? []) {
      const match = this.byName(kind, raw)
      if (match && match.row.id !== selfId && !result.includes(match.row.id)) result.push(match.row.id)
    }
    return result
  }

  resolveOne(kind: EntityKind, name: string | null | undefined): string | null {
    if (!name) return null
    return this.byName(kind, name)?.row.id ?? null
  }

  /**
   * Nadřazená entita stejného druhu (frakce/quest/lokace): musí existovat, nesmí být entita sama
   * a nesmí vzniknout cyklus. Vrací id rodiče nebo null.
   */
  resolveParent(kind: 'faction' | 'quest' | 'location', selfId: string | undefined, selfName: string, parentName: string | null | undefined): string | null {
    if (!parentName) return null
    const parent = this.byName(kind, parentName)
    if (!parent) return null
    if (parent.row.id === selfId || nameKey(parent.row.name) === nameKey(selfName)) throw new ValidationError(PARENT_SELF_MESSAGE[kind])
    const seen = new Set<string>()
    let cursor: Entity | null = parent
    while (cursor) {
      if (seen.has(cursor.row.id)) break
      seen.add(cursor.row.id)
      const next = this.one(cursor, 'parent')
      if (next && next.row.id === selfId) throw new ValidationError(PARENT_CYCLE_MESSAGE[kind](parent.row.name))
      cursor = next
    }
    return parent.row.id
  }
}

const KIND_LABEL: Record<EntityKind, string> = {
  character: 'Postava',
  narrator: 'Vypravěč',
  scene: 'Scéna',
  thread: 'Dějová nit',
  faction: 'Frakce',
  quest: 'Quest',
  location: 'Lokace',
  lore: 'Záznam lore',
  session: 'Sezení',
}

const CONFLICT_MESSAGE: Record<EntityKind, (name: string) => string> = {
  character: n => `Postava „${n}“ už existuje. Změň jméno nebo příjmení.`,
  narrator: n => `Vypravěč „${n}“ už existuje. Zvol jiné jméno.`,
  scene: n => `Scéna „${n}“ už existuje. Zvol jiný název.`,
  thread: n => `Dějová nit „${n}“ už existuje. Zvol jiný název.`,
  faction: n => `Frakce „${n}“ už existuje. Zvol jiný název.`,
  quest: n => `Quest „${n}“ už existuje. Zvol jiný název.`,
  location: n => `Lokace „${n}“ už existuje. Zvol jiný název.`,
  lore: n => `Záznam lore „${n}“ už existuje. Zvol jiný název.`,
  session: () => 'Sezení se stejným začátkem už existuje.',
}

const PARENT_SELF_MESSAGE = {
  faction: 'Frakce nemůže být nadřazená sama sobě.',
  quest: 'Quest nemůže být nadřazený sám sobě.',
  location: 'Lokace nemůže být nadřazená sama sobě.',
} as const

const PARENT_CYCLE_MESSAGE = {
  faction: (n: string) => `Frakce „${n}“ je podřízená této frakci – vznikl by cyklus.`,
  quest: (n: string) => `Quest „${n}“ je podřízený tomuto questu – vznikl by cyklus.`,
  location: (n: string) => `Lokace „${n}“ leží uvnitř této lokace – vznikl by cyklus.`,
} as const

/** Lokální obrázek = asset uložený přes `saveAsset`; vzdálená URL se ukládá zvlášť */
interface ImageColumns {
  imageAssetId: string | null
  imageUrl: string | null
}

function imageRef(row: { imageAssetId: string | null; imageUrl: string | null }, assetPaths: Map<string, string>): string | null {
  if (row.imageUrl) return row.imageUrl
  if (row.imageAssetId) return assetPaths.get(row.imageAssetId) ?? null
  return null
}

function ms(date: Date): number {
  return date.getTime()
}

function trimList(items: readonly string[] | undefined): string[] {
  return (items ?? []).map(i => i.trim()).filter(Boolean)
}

/**
 * Úložiště her v Postgresu (docs/ARCHITECTURE_V2.md §3). Implementuje v1 rozhraní `StorageProvider`, aby FE
 * zůstal beze změny; uvnitř jsou entity identifikované id a vazby jsou v tabulce `links`.
 */
export class PostgresProvider implements StorageProvider {
  constructor(
    private readonly db: Db,
    private readonly assetStore: AssetStore,
    private readonly tenantId: string = DEFAULT_TENANT,
  ) {}

  // ---------- načítání ----------

  private async findGameRow(exec: Executor, name: string): Promise<GameRow | null> {
    if (!isValidGameName(name)) throw new ValidationError(`Neplatný název hry: „${name}“`)
    const rows = await exec
      .select()
      .from(games)
      .where(and(eq(games.tenantId, this.tenantId), sql`lower(${games.name}) = lower(${name.trim()})`))
      .limit(1)
    return rows[0] ?? null
  }

  private async requireGameRow(exec: Executor, name: string): Promise<GameRow> {
    const row = await this.findGameRow(exec, name)
    if (!row) throw new NotFoundError(`Hra „${name}“ neexistuje.`)
    return row
  }

  private async loadSnapshot(exec: Executor, game: GameRow): Promise<Snapshot> {
    // Sekvenčně – uvnitř transakce je jeden klient a pg paralelní dotazy na něm nepodporuje
    const rows = await exec.select().from(entities).where(eq(entities.gameId, game.id))
    const linkRows = await exec.select().from(links).where(eq(links.gameId, game.id))
    return new Snapshot(game, rows, linkRows)
  }

  private async snapshot(exec: Executor, name: string): Promise<Snapshot> {
    return this.loadSnapshot(exec, await this.requireGameRow(exec, name))
  }

  /** Mapa id assetu → veřejná cesta `assets/<id><ext>` pro všechny assety hry */
  private async assetPaths(exec: Executor, gameId: string): Promise<Map<string, string>> {
    const rows = await exec.select({ id: assets.id, ext: assets.ext }).from(assets).where(eq(assets.gameId, gameId))
    return new Map(rows.map(r => [r.id, `${ASSET_PATH_PREFIX}${r.id}${r.ext}`]))
  }

  private async touchGame(exec: Executor, gameId: string): Promise<void> {
    await exec.update(games).set({ updatedAt: new Date() }).where(eq(games.id, gameId))
  }

  /** Spustí práci v transakci nad načtenou hrou, na konci aktualizuje `updated_at` hry */
  private async mutate<T>(name: string, work: (tx: Tx, snap: Snapshot, paths: Map<string, string>) => Promise<T>): Promise<T> {
    return this.db.transaction(async tx => {
      const game = await this.requireGameRow(tx, name)
      const snap = await this.loadSnapshot(tx, game)
      const paths = await this.assetPaths(tx, game.id)
      const result = await work(tx, snap, paths)
      await this.touchGame(tx, game.id)
      return result
    })
  }

  // ---------- obrázky ----------

  /**
   * Převede `ImageRef` z API na sloupce: vzdálená URL → `imageUrl`, `assets/<id><ext>` → `imageAssetId`
   * (asset musí patřit hře), jinak null. `undefined` = beze změny oproti `previous`.
   */
  private imageColumns(ref: string | null | undefined, paths: Map<string, string>, previous?: ImageColumns): ImageColumns {
    if (ref === undefined) return previous ?? { imageAssetId: null, imageUrl: null }
    if (ref === null) return { imageAssetId: null, imageUrl: null }
    if (isRemoteImage(ref)) return { imageAssetId: null, imageUrl: ref }
    for (const [id, p] of paths) if (p === ref) return { imageAssetId: id, imageUrl: null }
    // Cesta ve stylu v1 (`portraits/…`), kterou neznáme – ponechat beze změny, ať se nic neztratí
    return previous ?? { imageAssetId: null, imageUrl: null }
  }

  async saveAsset(name: string, asset: AssetInput): Promise<string> {
    const game = await this.requireGameRow(this.db, name)
    const ext = imageExtension(asset.filename, asset.mimeType)
    const hash = sha256(asset.data)
    const key = assetKey(hash, ext)
    const mime = asset.mimeType ?? 'application/octet-stream'
    await this.assetStore.put(key, asset.data, { contentType: mime })
    const id = newId('asset')
    await this.db.insert(assets).values({
      id,
      tenantId: this.tenantId,
      gameId: game.id,
      kind: asset.kind,
      mime,
      ext,
      size: asset.data.byteLength,
      sha256: hash,
      storageKey: key,
      originalName: asset.filename,
    })
    await this.touchGame(this.db, game.id)
    return `${ASSET_PATH_PREFIX}${id}${ext}`
  }

  /** Metadata assetu podle veřejného názvu souboru `<id><ext>` (pro servírování přes HTTP) */
  async getAsset(name: string, file: string): Promise<{ id: string; mime: string; size: number; storageKey: string } | null> {
    const game = await this.findGameRow(this.db, name)
    if (!game) return null
    const id = file.replace(/\.[a-z0-9]+$/i, '')
    const rows = await this.db
      .select({ id: assets.id, mime: assets.mime, size: assets.size, storageKey: assets.storageKey, ext: assets.ext })
      .from(assets)
      .where(and(eq(assets.gameId, game.id), eq(assets.id, id)))
      .limit(1)
    const row = rows[0]
    return row && `${row.id}${row.ext}` === file ? row : null
  }

  /** Veřejná cesta assetu (`assets/<id><ext>`) podle id, null pokud neexistuje */
  async getAssetFile(name: string, assetId: string): Promise<string | null> {
    const game = await this.findGameRow(this.db, name)
    if (!game) return null
    const rows = await this.db.select({ ext: assets.ext }).from(assets).where(and(eq(assets.gameId, game.id), eq(assets.id, assetId))).limit(1)
    return rows[0] ? `${ASSET_PATH_PREFIX}${assetId}${rows[0].ext}` : null
  }

  // ---------- mapování entit → API ----------

  private toCharacter(e: Entity<'character'>, paths: Map<string, string>): Character {
    return {
      id: e.row.id,
      name: e.row.name,
      firstName: e.fields.firstName,
      lastName: e.fields.lastName,
      nickname: e.fields.nickname,
      image: imageRef(e.row, paths),
      notes: e.row.notes,
    }
  }

  private toNarrator(e: Entity<'narrator'>, paths: Map<string, string>): Narrator {
    return { id: e.row.id, name: e.row.name, description: e.fields.description, aiPrompt: e.fields.aiPrompt, image: imageRef(e.row, paths) }
  }

  private toScene(snap: Snapshot, e: Entity<'scene'>, paths: Map<string, string>): SceneMeta {
    return {
      id: e.row.id,
      title: e.row.name,
      order: e.row.sortOrder,
      description: e.fields.description,
      image: imageRef(e.row, paths),
      characters: snap.manyNames(e, 'characters'),
      location: snap.oneName(e, 'location'),
      ai: e.fields.ai,
      aiCharacters: snap.manyNames(e, 'aiCharacters'),
      aiPrompt: e.fields.aiPrompt,
      summary: e.fields.summary,
      createdAt: ms(e.row.createdAt),
      updatedAt: ms(e.row.updatedAt),
    }
  }

  private toThread(snap: Snapshot, e: Entity<'thread'>): StoryThread {
    return {
      id: e.row.id,
      title: e.row.name,
      type: e.fields.type,
      status: e.fields.status,
      horizon: e.fields.horizon,
      certainty: e.fields.certainty,
      revealCondition: e.fields.revealCondition,
      clock: e.fields.clock,
      characters: snap.manyNames(e, 'characters'),
      scene: snap.oneName(e, 'scene'),
      factions: snap.manyNames(e, 'factions'),
      locations: snap.manyNames(e, 'locations'),
      description: e.fields.description,
      createdAt: ms(e.row.createdAt),
      updatedAt: ms(e.row.updatedAt),
    }
  }

  private toFaction(snap: Snapshot, e: Entity<'faction'>, paths: Map<string, string>): Faction {
    const relations: FactionRelation[] = (e.out.get('relation') ?? []).flatMap(link => {
      const target = snap.byId.get(link.toId)
      const data = FactionRelationData.safeParse(link.data)
      return target && data.success ? [{ faction: target.row.name, stance: data.data.stance, note: data.data.note }] : []
    })
    return {
      id: e.row.id,
      title: e.row.name,
      type: e.fields.type,
      status: e.fields.status,
      stance: e.fields.stance,
      leader: snap.oneName(e, 'leader'),
      parentFaction: snap.oneName(e, 'parent'),
      goals: e.fields.goals,
      characters: snap.manyNames(e, 'characters'),
      locations: snap.manyNames(e, 'locations'),
      relations,
      emblem: imageRef(e.row, paths),
      description: e.fields.description,
      secrets: e.fields.secrets,
      createdAt: ms(e.row.createdAt),
      updatedAt: ms(e.row.updatedAt),
    }
  }

  private toQuest(snap: Snapshot, e: Entity<'quest'>): Quest {
    return {
      id: e.row.id,
      title: e.row.name,
      type: e.fields.type,
      status: e.fields.status,
      objectives: e.fields.objectives,
      questGiver: snap.oneName(e, 'questGiver'),
      parentQuest: snap.oneName(e, 'parent'),
      rewards: e.fields.rewards,
      characters: snap.manyNames(e, 'characters'),
      threads: snap.manyNames(e, 'threads'),
      factions: snap.manyNames(e, 'factions'),
      locations: snap.manyNames(e, 'locations'),
      description: e.fields.description,
      outcome: e.fields.outcome,
      notes: e.row.notes,
      createdAt: ms(e.row.createdAt),
      updatedAt: ms(e.row.updatedAt),
    }
  }

  private toLocation(snap: Snapshot, e: Entity<'location'>, paths: Map<string, string>): StoryLocation {
    return {
      id: e.row.id,
      title: e.row.name,
      type: e.fields.type,
      status: e.fields.status,
      parentLocation: snap.oneName(e, 'parent'),
      image: imageRef(e.row, paths),
      description: e.fields.description,
      secrets: e.fields.secrets,
      createdAt: ms(e.row.createdAt),
      updatedAt: ms(e.row.updatedAt),
    }
  }

  private toLore(snap: Snapshot, e: Entity<'lore'>): LoreEntry {
    return {
      id: e.row.id,
      title: e.row.name,
      type: e.fields.type,
      truth: e.fields.truth,
      knowledge: e.fields.knowledge,
      characters: snap.manyNames(e, 'characters'),
      locations: snap.manyNames(e, 'locations'),
      factions: snap.manyNames(e, 'factions'),
      quests: snap.manyNames(e, 'quests'),
      threads: snap.manyNames(e, 'threads'),
      content: e.fields.content,
      secrets: e.fields.secrets,
      createdAt: ms(e.row.createdAt),
      updatedAt: ms(e.row.updatedAt),
    }
  }

  private toSession(e: Entity<'session'>): GameSession {
    return {
      id: e.row.id,
      startedAt: e.fields.startedAt,
      endedAt: e.fields.endedAt,
      durationSeconds: e.fields.durationSeconds,
      fun: e.fields.fun,
      description: e.fields.description,
    }
  }

  private toMeta(game: GameRow): GameMeta {
    return { name: game.name, createdAt: ms(game.createdAt), updatedAt: ms(game.updatedAt) }
  }

  private toSetup(snap: Snapshot, paths: Map<string, string>): GameSetup {
    const g = snap.game
    const narrator = g.currentNarratorId ? snap.get('narrator', g.currentNarratorId) : undefined
    return {
      characters: snap.list('character').map(c => this.toCharacter(c, paths)),
      narrators: snap.list('narrator').map(n => this.toNarrator(n, paths)),
      backgroundImage: g.backgroundUrl ?? (g.backgroundAssetId ? (paths.get(g.backgroundAssetId) ?? null) : null),
      brightBackground: g.brightBackground,
      narrator: narrator?.row.name ?? null,
      rules: g.rules,
      rulesInAi: g.rulesInAi,
    }
  }

  private toDetail(snap: Snapshot, paths: Map<string, string>): GameDetail {
    return {
      meta: this.toMeta(snap.game),
      setup: this.toSetup(snap, paths),
      scenes: snap.list('scene').map(s => this.toScene(snap, s, paths)),
      threads: snap.list('thread').map(t => this.toThread(snap, t)),
      factions: snap.list('faction').map(f => this.toFaction(snap, f, paths)),
      quests: snap.list('quest').map(q => this.toQuest(snap, q)),
      locations: snap.list('location').map(l => this.toLocation(snap, l, paths)),
      lore: snap.list('lore').map(l => this.toLore(snap, l)),
    }
  }

  // ---------- zápis entit a hran ----------

  private async insertEntity<K extends EntityKind>(
    tx: Tx,
    gameId: string,
    kind: K,
    data: { id?: string; name: string; fields: FieldsOf<K>; notes?: string; sortOrder?: number; image?: ImageColumns; createdAt?: Date; updatedAt?: Date },
  ): Promise<string> {
    const id = data.id ?? newId(kind)
    const now = new Date()
    await tx.insert(entities).values({
      id,
      tenantId: this.tenantId,
      gameId,
      kind,
      name: data.name,
      fields: data.fields,
      schemaVersion: currentVersion(kind),
      notes: data.notes ?? '',
      sortOrder: data.sortOrder ?? 0,
      imageAssetId: data.image?.imageAssetId ?? null,
      imageUrl: data.image?.imageUrl ?? null,
      createdAt: data.createdAt ?? now,
      updatedAt: data.updatedAt ?? data.createdAt ?? now,
    })
    return id
  }

  private async updateEntity<K extends EntityKind>(
    tx: Tx,
    id: string,
    data: { name?: string; fields?: FieldsOf<K>; notes?: string; sortOrder?: number; image?: ImageColumns; updatedAt?: Date },
  ): Promise<void> {
    await tx
      .update(entities)
      .set({
        ...(data.name !== undefined ? { name: data.name } : {}),
        ...(data.fields !== undefined ? { fields: data.fields } : {}),
        ...(data.notes !== undefined ? { notes: data.notes } : {}),
        ...(data.sortOrder !== undefined ? { sortOrder: data.sortOrder } : {}),
        ...(data.image ? { imageAssetId: data.image.imageAssetId, imageUrl: data.image.imageUrl } : {}),
        updatedAt: data.updatedAt ?? new Date(),
      })
      .where(eq(entities.id, id))
  }

  /** Nahradí hrany `(from, kind)` zadaným seznamem cílů (v pořadí); `data[i]` jsou volitelná data hrany */
  private async setLinks(tx: Tx, gameId: string, fromId: string, kind: string, toIds: readonly string[], data?: readonly unknown[]): Promise<void> {
    await tx.delete(links).where(and(eq(links.fromId, fromId), eq(links.kind, kind)))
    if (toIds.length === 0) return
    await tx.insert(links).values(toIds.map((toId, position) => ({ gameId, fromId, toId, kind, position, data: data?.[position] ?? null })))
  }

  private async setLink(tx: Tx, gameId: string, fromId: string, kind: string, toId: string | null): Promise<void> {
    await this.setLinks(tx, gameId, fromId, kind, toId ? [toId] : [])
  }

  // ---------- hry ----------

  async listGames(): Promise<GameMeta[]> {
    const rows = await this.db.select().from(games).where(eq(games.tenantId, this.tenantId))
    return rows.map(g => this.toMeta(g)).sort((a, b) => b.updatedAt - a.updatedAt)
  }

  async createGame(name: string): Promise<GameDetail> {
    const trimmed = name.trim()
    if (!isValidGameName(trimmed)) throw new ValidationError(`Neplatný název hry: „${trimmed}“`)
    return this.db.transaction(async tx => {
      if (await this.findGameRow(tx, trimmed)) throw new ConflictError(`Hra „${trimmed}“ už existuje.`)
      const [row] = await tx.insert(games).values({ id: newId('game'), tenantId: this.tenantId, name: trimmed }).returning()
      return this.toDetail(new Snapshot(row, [], []), new Map())
    })
  }

  async getGame(name: string): Promise<GameDetail | null> {
    const game = await this.findGameRow(this.db, name)
    if (!game) return null
    const [snap, paths] = await Promise.all([this.loadSnapshot(this.db, game), this.assetPaths(this.db, game.id)])
    return this.toDetail(snap, paths)
  }

  async renameGame(oldName: string, newName: string): Promise<GameMeta> {
    const trimmed = newName.trim()
    if (!isValidGameName(trimmed)) throw new ValidationError(`Neplatný název hry: „${trimmed}“`)
    return this.db.transaction(async tx => {
      const game = await this.requireGameRow(tx, oldName)
      const clash = await this.findGameRow(tx, trimmed)
      if (clash && clash.id !== game.id) throw new ConflictError(`Hra „${trimmed}“ už existuje.`)
      const [row] = await tx.update(games).set({ name: trimmed, updatedAt: new Date() }).where(eq(games.id, game.id)).returning()
      return this.toMeta(row)
    })
  }

  async deleteGame(name: string): Promise<void> {
    const game = await this.requireGameRow(this.db, name)
    const files = await this.db.select({ storageKey: assets.storageKey }).from(assets).where(eq(assets.gameId, game.id))
    await this.db.delete(games).where(eq(games.id, game.id))
    // Soubory sdílené s jinou hrou (stejný obsah) zůstávají
    for (const { storageKey } of files) {
      const stillUsed = await this.db.select({ id: assets.id }).from(assets).where(eq(assets.storageKey, storageKey)).limit(1)
      if (stillUsed.length === 0) await this.assetStore.delete(storageKey)
    }
  }

  async saveSetup(name: string, settings: GameSettings): Promise<GameSetup> {
    return this.mutate(name, async (tx, snap, paths) => {
      const narrator = settings.narrator ? snap.byName('narrator', settings.narrator) : undefined
      if (settings.narrator && !narrator) throw new NotFoundError(`Vypravěč „${settings.narrator}“ neexistuje.`)
      const bg = this.imageColumns(settings.backgroundImage, paths, { imageAssetId: snap.game.backgroundAssetId, imageUrl: snap.game.backgroundUrl })
      const [row] = await tx
        .update(games)
        .set({
          backgroundAssetId: bg.imageAssetId,
          backgroundUrl: bg.imageUrl,
          brightBackground: settings.brightBackground,
          currentNarratorId: narrator?.row.id ?? null,
          rules: settings.rules,
          rulesInAi: settings.rulesInAi,
        })
        .where(eq(games.id, snap.game.id))
        .returning()
      return this.toSetup(new Snapshot(row, [...snap.byId.values()].map(e => e.row), []), paths)
    })
  }

  // ---------- postavy ----------

  async createCharacter(gameName: string, input: CharacterInput): Promise<Character> {
    return this.mutate(gameName, async (tx, snap, paths) => {
      const name = fullName(input.firstName, input.lastName)
      snap.assertNameFree('character', name)
      const sortOrder = snap.list('character').reduce((max, c) => Math.max(max, c.row.sortOrder), -1) + 1
      const id = await this.insertEntity(tx, snap.game.id, 'character', {
        name,
        fields: { firstName: input.firstName.trim(), lastName: input.lastName.trim(), nickname: input.nickname.trim() },
        notes: input.notes ?? '',
        sortOrder,
        image: this.imageColumns(input.image ?? null, paths),
      })
      return this.toCharacter((await this.loadSnapshot(tx, snap.game)).require('character', id), paths)
    })
  }

  async updateCharacter(gameName: string, characterId: string, input: CharacterInput): Promise<Character> {
    return this.mutate(gameName, async (tx, snap, paths) => {
      const current = snap.require('character', characterId)
      const name = fullName(input.firstName, input.lastName)
      snap.assertNameFree('character', name, characterId)
      await this.updateEntity(tx, characterId, {
        name,
        fields: { ...current.fields, firstName: input.firstName.trim(), lastName: input.lastName.trim(), nickname: input.nickname.trim() },
        notes: input.notes ?? current.row.notes,
        image: this.imageColumns(input.image, paths, current.row),
      })
      return this.toCharacter((await this.loadSnapshot(tx, snap.game)).require('character', characterId), paths)
    })
  }

  async deleteCharacter(gameName: string, characterId: string): Promise<void> {
    await this.mutate(gameName, async (tx, snap) => {
      snap.require('character', characterId)
      // Hrany ze scén/nití/frakcí/questů/lore zmizí kaskádou, repliky si ponechají snímek jména
      await tx.delete(entities).where(eq(entities.id, characterId))
    })
  }

  // ---------- vypravěči ----------

  async createNarrator(gameName: string, input: NarratorInput): Promise<Narrator> {
    return this.mutate(gameName, async (tx, snap, paths) => {
      const name = input.name.trim()
      snap.assertNameFree('narrator', name)
      const sortOrder = snap.list('narrator').reduce((max, n) => Math.max(max, n.row.sortOrder), -1) + 1
      const id = await this.insertEntity(tx, snap.game.id, 'narrator', {
        name,
        fields: { description: input.description ?? '', aiPrompt: input.aiPrompt ?? '' },
        sortOrder,
        image: this.imageColumns(input.image ?? null, paths),
      })
      return this.toNarrator((await this.loadSnapshot(tx, snap.game)).require('narrator', id), paths)
    })
  }

  async updateNarrator(gameName: string, narratorId: string, input: NarratorInput): Promise<Narrator> {
    return this.mutate(gameName, async (tx, snap, paths) => {
      const current = snap.require('narrator', narratorId)
      const name = input.name.trim()
      snap.assertNameFree('narrator', name, narratorId)
      await this.updateEntity(tx, narratorId, {
        name,
        fields: { ...current.fields, description: input.description ?? current.fields.description, aiPrompt: input.aiPrompt ?? current.fields.aiPrompt },
        image: this.imageColumns(input.image, paths, current.row),
      })
      return this.toNarrator((await this.loadSnapshot(tx, snap.game)).require('narrator', narratorId), paths)
    })
  }

  async deleteNarrator(gameName: string, narratorId: string): Promise<void> {
    await this.mutate(gameName, async (tx, snap) => {
      snap.require('narrator', narratorId)
      if (snap.game.currentNarratorId === narratorId) await tx.update(games).set({ currentNarratorId: null }).where(eq(games.id, snap.game.id))
      await tx.delete(entities).where(eq(entities.id, narratorId))
    })
  }

  // ---------- scény ----------

  async listScenes(name: string): Promise<SceneMeta[]> {
    const game = await this.requireGameRow(this.db, name)
    const [snap, paths] = await Promise.all([this.loadSnapshot(this.db, game), this.assetPaths(this.db, game.id)])
    return snap.list('scene').map(s => this.toScene(snap, s, paths))
  }

  /** Požadovaná pozice omezená na 1..max */
  private clampPosition(requested: number | undefined, max: number, fallback: number): number {
    if (requested === undefined) return fallback
    return Math.min(Math.max(1, Math.trunc(requested)), max)
  }

  /** Přečísluje scény podle pořadí v `ordered` na souvislou řadu 1..n */
  private async renumberScenes(tx: Tx, ordered: readonly Entity<'scene'>[]): Promise<void> {
    for (const [index, scene] of ordered.entries()) {
      const order = index + 1
      if (scene.row.sortOrder !== order) await tx.update(entities).set({ sortOrder: order }).where(eq(entities.id, scene.row.id))
    }
  }

  async createScene(name: string, input: SceneInput): Promise<SceneMeta> {
    return this.mutate(name, async (tx, snap, paths) => {
      const scenes = snap.list('scene')
      const title = input.title.trim()
      snap.assertNameFree('scene', title)
      const position = this.clampPosition(input.order, scenes.length + 1, scenes.length + 1)
      // Bez explicitního seznamu převzít postavy (a AI nastavení) ze scény, za kterou se nová vkládá; na začátku z dosavadní první
      const neighbor = position > 1 ? scenes[position - 2] : scenes[0]
      const characterIds = input.characters ? snap.resolveMany('character', input.characters) : neighbor ? snap.many(neighbor, 'characters').map(c => c.row.id) : []
      const ai = input.ai ?? neighbor?.fields.ai ?? false
      const aiCandidates = input.aiCharacters ? snap.resolveMany('character', input.aiCharacters) : neighbor ? snap.many(neighbor, 'aiCharacters').map(c => c.row.id) : []
      const aiCharacterIds = aiCandidates.filter(id => characterIds.includes(id))

      const id = await this.insertEntity(tx, snap.game.id, 'scene', {
        name: title,
        // Doplňující popis situace (aiPrompt) je specifický pro scénu – nedědí se
        fields: { description: input.description ?? '', ai, aiPrompt: input.aiPrompt ?? '', summary: input.summary ?? '' },
        sortOrder: position,
        image: this.imageColumns(input.image ?? null, paths),
      })
      await this.setLinks(tx, snap.game.id, id, 'characters', characterIds)
      await this.setLinks(tx, snap.game.id, id, 'aiCharacters', aiCharacterIds)
      await this.setLink(tx, snap.game.id, id, 'location', snap.resolveOne('location', input.location))

      const after = await this.loadSnapshot(tx, snap.game)
      const created = after.require('scene', id)
      const others = after.list('scene').filter(s => s.row.id !== id)
      await this.renumberScenes(tx, [...others.slice(0, position - 1), created, ...others.slice(position - 1)])
      const final = await this.loadSnapshot(tx, snap.game)
      return this.toScene(final, final.require('scene', id), paths)
    })
  }

  async updateScene(name: string, sceneId: string, input: SceneInput): Promise<SceneMeta> {
    return this.mutate(name, async (tx, snap, paths) => {
      const scenes = snap.list('scene')
      const current = snap.require('scene', sceneId)
      const title = input.title.trim()
      snap.assertNameFree('scene', title, sceneId)

      const characterIds = input.characters ? snap.resolveMany('character', input.characters) : snap.many(current, 'characters').map(c => c.row.id)
      const aiCandidates = input.aiCharacters ? snap.resolveMany('character', input.aiCharacters) : snap.many(current, 'aiCharacters').map(c => c.row.id)
      // AI může hrát jen postavy, které ve scéně jsou
      const aiCharacterIds = aiCandidates.filter(id => characterIds.includes(id))

      await this.updateEntity(tx, sceneId, {
        name: title,
        fields: {
          ...current.fields,
          description: input.description ?? current.fields.description,
          summary: input.summary ?? current.fields.summary,
          ai: input.ai ?? current.fields.ai,
          aiPrompt: input.aiPrompt ?? current.fields.aiPrompt,
        },
        image: this.imageColumns(input.image, paths, current.row),
      })
      await this.setLinks(tx, snap.game.id, sceneId, 'characters', characterIds)
      await this.setLinks(tx, snap.game.id, sceneId, 'aiCharacters', aiCharacterIds)
      if (input.location !== undefined) await this.setLink(tx, snap.game.id, sceneId, 'location', snap.resolveOne('location', input.location))

      // Přesun na jinou pozici: přeskládat a přečíslovat
      const currentIndex = scenes.indexOf(current)
      const targetIndex = this.clampPosition(input.order, scenes.length, currentIndex + 1) - 1
      const others = scenes.filter(s => s !== current)
      await this.renumberScenes(tx, [...others.slice(0, targetIndex), current, ...others.slice(targetIndex)])

      const final = await this.loadSnapshot(tx, snap.game)
      return this.toScene(final, final.require('scene', sceneId), paths)
    })
  }

  async getSceneEntries(name: string, sceneId: string): Promise<StoryEntry[] | null> {
    const snap = await this.snapshot(this.db, name)
    if (!snap.get('scene', sceneId)) return null
    const rows = await this.db.select().from(sceneEntries).where(eq(sceneEntries.sceneId, sceneId)).orderBy(asc(sceneEntries.position))
    return rows.map(r => {
      const speaker = r.speakerId ? snap.byId.get(r.speakerId) : undefined
      const speakerName = speaker?.row.name ?? r.speakerName ?? null
      const entry: StoryEntry = {
        id: r.id,
        characterName: r.speakerKind === 'character' ? speakerName : null,
        text: r.text,
        timestamp: ms(r.timestamp),
      }
      if (r.speakerKind === 'narrator') entry.narratorName = speakerName
      if (r.markdown) entry.markdown = true
      return entry
    })
  }

  async saveSceneEntries(name: string, sceneId: string, entries: StoryEntry[]): Promise<void> {
    await this.mutate(name, async (tx, snap) => {
      snap.require('scene', sceneId)
      await tx.delete(sceneEntries).where(eq(sceneEntries.sceneId, sceneId))
      const seen = new Set<string>()
      const values = entries.flatMap((entry, position) => {
        if (seen.has(entry.id)) return []
        seen.add(entry.id)
        const isCharacter = entry.characterName !== null
        const speakerName = isCharacter ? entry.characterName : (entry.narratorName ?? null)
        // Dočasné postavy (`tmp-…`) a neznámí mluvčí nemají entitu – zůstane jen jméno
        const speaker = speakerName ? (isCharacter ? snap.byName('character', speakerName) : snap.byName('narrator', speakerName)) : undefined
        return [
          {
            id: entry.id,
            gameId: snap.game.id,
            sceneId,
            position,
            speakerKind: isCharacter ? 'character' : 'narrator',
            speakerId: speaker?.row.id ?? null,
            speakerName,
            text: entry.text,
            markdown: entry.markdown === true,
            timestamp: new Date(entry.timestamp),
          },
        ]
      })
      if (values.length > 0) await tx.insert(sceneEntries).values(values)
      await this.updateEntity(tx, sceneId, {})
    })
  }

  async deleteScene(name: string, sceneId: string): Promise<void> {
    await this.mutate(name, async (tx, snap) => {
      snap.require('scene', sceneId)
      await tx.delete(entities).where(eq(entities.id, sceneId))
      await this.renumberScenes(
        tx,
        snap.list('scene').filter(s => s.row.id !== sceneId),
      )
    })
  }

  // ---------- dějové nitě ----------

  async listThreads(name: string): Promise<StoryThread[]> {
    const snap = await this.snapshot(this.db, name)
    return snap.list('thread').map(t => this.toThread(snap, t))
  }

  private async writeThreadLinks(tx: Tx, snap: Snapshot, id: string, input: ThreadInput, isCreate: boolean): Promise<void> {
    const g = snap.game.id
    if (isCreate || input.characters) await this.setLinks(tx, g, id, 'characters', snap.resolveMany('character', input.characters))
    if (isCreate || input.scene !== undefined) await this.setLink(tx, g, id, 'scene', snap.resolveOne('scene', input.scene))
    if (isCreate || input.factions) await this.setLinks(tx, g, id, 'factions', snap.resolveMany('faction', input.factions))
    if (isCreate || input.locations) await this.setLinks(tx, g, id, 'locations', snap.resolveMany('location', input.locations))
  }

  async createThread(gameName: string, input: ThreadInput): Promise<StoryThread> {
    return this.mutate(gameName, async (tx, snap) => {
      const title = input.title.trim()
      snap.assertNameFree('thread', title)
      const id = await this.insertEntity(tx, snap.game.id, 'thread', {
        name: title,
        fields: {
          type: input.type,
          status: input.status ?? 'latent',
          horizon: input.horizon ?? 'short-term',
          certainty: input.certainty ?? 'confirmed',
          revealCondition: input.revealCondition ?? '',
          clock: input.clock ?? null,
          description: input.description ?? '',
        },
      })
      await this.writeThreadLinks(tx, snap, id, input, true)
      const final = await this.loadSnapshot(tx, snap.game)
      return this.toThread(final, final.require('thread', id))
    })
  }

  async updateThread(gameName: string, threadId: string, input: ThreadInput): Promise<StoryThread> {
    return this.mutate(gameName, async (tx, snap) => {
      const current = snap.require('thread', threadId)
      const title = input.title.trim()
      snap.assertNameFree('thread', title, threadId)
      await this.updateEntity(tx, threadId, {
        name: title,
        fields: {
          ...current.fields,
          type: input.type,
          status: input.status ?? current.fields.status,
          horizon: input.horizon ?? current.fields.horizon,
          certainty: input.certainty ?? current.fields.certainty,
          revealCondition: input.revealCondition ?? current.fields.revealCondition,
          clock: input.clock === undefined ? current.fields.clock : input.clock,
          description: input.description ?? current.fields.description,
        },
      })
      await this.writeThreadLinks(tx, snap, threadId, input, false)
      const final = await this.loadSnapshot(tx, snap.game)
      return this.toThread(final, final.require('thread', threadId))
    })
  }

  async deleteThread(gameName: string, threadId: string): Promise<void> {
    await this.mutate(gameName, async (tx, snap) => {
      snap.require('thread', threadId)
      await tx.delete(entities).where(eq(entities.id, threadId))
    })
  }

  // ---------- frakce ----------

  async listFactions(name: string): Promise<Faction[]> {
    const game = await this.requireGameRow(this.db, name)
    const [snap, paths] = await Promise.all([this.loadSnapshot(this.db, game), this.assetPaths(this.db, game.id)])
    return snap.list('faction').map(f => this.toFaction(snap, f, paths))
  }

  /** Vztahy: jen k existujícím jiným frakcím, max. jeden na cílovou frakci */
  private resolveRelations(snap: Snapshot, relations: FactionInput['relations'], selfId?: string): { ids: string[]; data: FactionRelationData[] } {
    const ids: string[] = []
    const data: FactionRelationData[] = []
    for (const rel of relations ?? []) {
      const [target] = snap.resolveMany('faction', [rel.faction], selfId)
      if (!target || ids.includes(target)) continue
      ids.push(target)
      data.push({ stance: rel.stance, note: rel.note?.trim() ?? '' })
    }
    return { ids, data }
  }

  private async writeFactionLinks(tx: Tx, snap: Snapshot, id: string, title: string, input: FactionInput, isCreate: boolean): Promise<void> {
    const g = snap.game.id
    if (isCreate || input.leader !== undefined) await this.setLink(tx, g, id, 'leader', snap.resolveOne('character', input.leader))
    if (isCreate || input.parentFaction !== undefined) {
      await this.setLink(tx, g, id, 'parent', snap.resolveParent('faction', isCreate ? undefined : id, title, input.parentFaction))
    }
    if (isCreate || input.characters) await this.setLinks(tx, g, id, 'characters', snap.resolveMany('character', input.characters))
    if (isCreate || input.locations) await this.setLinks(tx, g, id, 'locations', snap.resolveMany('location', input.locations))
    if (isCreate || input.relations) {
      const { ids, data } = this.resolveRelations(snap, input.relations, isCreate ? undefined : id)
      await this.setLinks(tx, g, id, 'relation', ids, data)
    }
  }

  async createFaction(gameName: string, input: FactionInput): Promise<Faction> {
    return this.mutate(gameName, async (tx, snap, paths) => {
      const title = input.title.trim()
      snap.assertNameFree('faction', title)
      // Validace rodiče před zápisem (self/cyklus → 400)
      snap.resolveParent('faction', undefined, title, input.parentFaction)
      const id = await this.insertEntity(tx, snap.game.id, 'faction', {
        name: title,
        fields: {
          type: input.type,
          status: input.status ?? 'active',
          stance: input.stance ?? 'unknown',
          goals: trimList(input.goals),
          description: input.description ?? '',
          secrets: input.secrets ?? '',
        },
        image: this.imageColumns(input.emblem ?? null, paths),
      })
      await this.writeFactionLinks(tx, snap, id, title, input, true)
      const final = await this.loadSnapshot(tx, snap.game)
      return this.toFaction(final, final.require('faction', id), paths)
    })
  }

  async updateFaction(gameName: string, factionId: string, input: FactionInput): Promise<Faction> {
    return this.mutate(gameName, async (tx, snap, paths) => {
      const current = snap.require('faction', factionId)
      const title = input.title.trim()
      snap.assertNameFree('faction', title, factionId)
      await this.updateEntity(tx, factionId, {
        name: title,
        fields: {
          ...current.fields,
          type: input.type,
          status: input.status ?? current.fields.status,
          stance: input.stance ?? current.fields.stance,
          goals: input.goals ? trimList(input.goals) : current.fields.goals,
          description: input.description ?? current.fields.description,
          secrets: input.secrets ?? current.fields.secrets,
        },
        image: this.imageColumns(input.emblem, paths, current.row),
      })
      await this.writeFactionLinks(tx, snap, factionId, title, input, false)
      const final = await this.loadSnapshot(tx, snap.game)
      return this.toFaction(final, final.require('faction', factionId), paths)
    })
  }

  async deleteFaction(gameName: string, factionId: string): Promise<void> {
    await this.mutate(gameName, async (tx, snap) => {
      snap.require('faction', factionId)
      await tx.delete(entities).where(eq(entities.id, factionId))
    })
  }

  // ---------- questy ----------

  async listQuests(name: string): Promise<Quest[]> {
    const snap = await this.snapshot(this.db, name)
    return snap.list('quest').map(q => this.toQuest(snap, q))
  }

  /** Cíle questu: zachovat id existujících, novým přidělit `objective-<ts>-<n>`; prázdné názvy vypustit */
  private normalizeObjectives(input: QuestInput['objectives'], previous: readonly QuestObjective[]): QuestObjective[] {
    const now = Date.now()
    const result: QuestObjective[] = []
    let counter = 0
    for (const item of input ?? []) {
      const title = item.title.trim()
      if (!title) continue
      const prev = item.id ? previous.find(o => o.id === item.id) : undefined
      let id = prev?.id ?? item.id ?? `objective-${now}-${++counter}`
      while (result.some(o => o.id === id)) id = `objective-${now}-${++counter}`
      result.push({ id, title, status: item.status ?? prev?.status ?? 'pending', optional: item.optional ?? prev?.optional ?? false })
    }
    return result
  }

  private async writeQuestLinks(tx: Tx, snap: Snapshot, id: string, title: string, input: QuestInput, isCreate: boolean): Promise<void> {
    const g = snap.game.id
    if (isCreate || input.questGiver !== undefined) await this.setLink(tx, g, id, 'questGiver', snap.resolveOne('character', input.questGiver))
    if (isCreate || input.parentQuest !== undefined) {
      await this.setLink(tx, g, id, 'parent', snap.resolveParent('quest', isCreate ? undefined : id, title, input.parentQuest))
    }
    if (isCreate || input.characters) await this.setLinks(tx, g, id, 'characters', snap.resolveMany('character', input.characters))
    if (isCreate || input.threads) await this.setLinks(tx, g, id, 'threads', snap.resolveMany('thread', input.threads))
    if (isCreate || input.factions) await this.setLinks(tx, g, id, 'factions', snap.resolveMany('faction', input.factions))
    if (isCreate || input.locations) await this.setLinks(tx, g, id, 'locations', snap.resolveMany('location', input.locations))
  }

  async createQuest(gameName: string, input: QuestInput): Promise<Quest> {
    return this.mutate(gameName, async (tx, snap) => {
      const title = input.title.trim()
      snap.assertNameFree('quest', title)
      snap.resolveParent('quest', undefined, title, input.parentQuest)
      const id = await this.insertEntity(tx, snap.game.id, 'quest', {
        name: title,
        fields: {
          type: input.type,
          status: input.status ?? 'available',
          objectives: this.normalizeObjectives(input.objectives, []),
          rewards: trimList(input.rewards),
          description: input.description ?? '',
          outcome: input.outcome ?? '',
        },
        notes: input.notes ?? '',
      })
      await this.writeQuestLinks(tx, snap, id, title, input, true)
      const final = await this.loadSnapshot(tx, snap.game)
      return this.toQuest(final, final.require('quest', id))
    })
  }

  async updateQuest(gameName: string, questId: string, input: QuestInput): Promise<Quest> {
    return this.mutate(gameName, async (tx, snap) => {
      const current = snap.require('quest', questId)
      const title = input.title.trim()
      snap.assertNameFree('quest', title, questId)
      await this.updateEntity(tx, questId, {
        name: title,
        fields: {
          ...current.fields,
          type: input.type,
          status: input.status ?? current.fields.status,
          objectives: input.objectives ? this.normalizeObjectives(input.objectives, current.fields.objectives) : current.fields.objectives,
          rewards: input.rewards ? trimList(input.rewards) : current.fields.rewards,
          description: input.description ?? current.fields.description,
          outcome: input.outcome ?? current.fields.outcome,
        },
        notes: input.notes ?? current.row.notes,
      })
      await this.writeQuestLinks(tx, snap, questId, title, input, false)
      const final = await this.loadSnapshot(tx, snap.game)
      return this.toQuest(final, final.require('quest', questId))
    })
  }

  async deleteQuest(gameName: string, questId: string): Promise<void> {
    await this.mutate(gameName, async (tx, snap) => {
      snap.require('quest', questId)
      await tx.delete(entities).where(eq(entities.id, questId))
    })
  }

  // ---------- lokace ----------

  async listLocations(name: string): Promise<StoryLocation[]> {
    const game = await this.requireGameRow(this.db, name)
    const [snap, paths] = await Promise.all([this.loadSnapshot(this.db, game), this.assetPaths(this.db, game.id)])
    return snap.list('location').map(l => this.toLocation(snap, l, paths))
  }

  async createLocation(gameName: string, input: LocationInput): Promise<StoryLocation> {
    return this.mutate(gameName, async (tx, snap, paths) => {
      const title = input.title.trim()
      snap.assertNameFree('location', title)
      const parentId = snap.resolveParent('location', undefined, title, input.parentLocation)
      const id = await this.insertEntity(tx, snap.game.id, 'location', {
        name: title,
        fields: { type: input.type, status: input.status ?? 'known', description: input.description ?? '', secrets: input.secrets ?? '' },
        image: this.imageColumns(input.image ?? null, paths),
      })
      await this.setLink(tx, snap.game.id, id, 'parent', parentId)
      const final = await this.loadSnapshot(tx, snap.game)
      return this.toLocation(final, final.require('location', id), paths)
    })
  }

  async updateLocation(gameName: string, locationId: string, input: LocationInput): Promise<StoryLocation> {
    return this.mutate(gameName, async (tx, snap, paths) => {
      const current = snap.require('location', locationId)
      const title = input.title.trim()
      snap.assertNameFree('location', title, locationId)
      await this.updateEntity(tx, locationId, {
        name: title,
        fields: {
          ...current.fields,
          type: input.type,
          status: input.status ?? current.fields.status,
          description: input.description ?? current.fields.description,
          secrets: input.secrets ?? current.fields.secrets,
        },
        image: this.imageColumns(input.image, paths, current.row),
      })
      if (input.parentLocation !== undefined) {
        await this.setLink(tx, snap.game.id, locationId, 'parent', snap.resolveParent('location', locationId, title, input.parentLocation))
      }
      const final = await this.loadSnapshot(tx, snap.game)
      return this.toLocation(final, final.require('location', locationId), paths)
    })
  }

  async deleteLocation(gameName: string, locationId: string): Promise<void> {
    await this.mutate(gameName, async (tx, snap) => {
      snap.require('location', locationId)
      await tx.delete(entities).where(eq(entities.id, locationId))
    })
  }

  // ---------- lore ----------

  async listLore(name: string): Promise<LoreEntry[]> {
    const snap = await this.snapshot(this.db, name)
    return snap.list('lore').map(l => this.toLore(snap, l))
  }

  private async writeLoreLinks(tx: Tx, snap: Snapshot, id: string, input: LoreInput, isCreate: boolean): Promise<void> {
    const g = snap.game.id
    if (isCreate || input.characters) await this.setLinks(tx, g, id, 'characters', snap.resolveMany('character', input.characters))
    if (isCreate || input.locations) await this.setLinks(tx, g, id, 'locations', snap.resolveMany('location', input.locations))
    if (isCreate || input.factions) await this.setLinks(tx, g, id, 'factions', snap.resolveMany('faction', input.factions))
    if (isCreate || input.quests) await this.setLinks(tx, g, id, 'quests', snap.resolveMany('quest', input.quests))
    if (isCreate || input.threads) await this.setLinks(tx, g, id, 'threads', snap.resolveMany('thread', input.threads))
  }

  async createLore(gameName: string, input: LoreInput): Promise<LoreEntry> {
    return this.mutate(gameName, async (tx, snap) => {
      const title = input.title.trim()
      snap.assertNameFree('lore', title)
      const id = await this.insertEntity(tx, snap.game.id, 'lore', {
        name: title,
        fields: {
          type: input.type,
          truth: input.truth ?? 'unknown',
          knowledge: input.knowledge ?? 'known',
          content: input.content ?? '',
          secrets: input.secrets ?? '',
        },
      })
      await this.writeLoreLinks(tx, snap, id, input, true)
      const final = await this.loadSnapshot(tx, snap.game)
      return this.toLore(final, final.require('lore', id))
    })
  }

  async updateLore(gameName: string, loreId: string, input: LoreInput): Promise<LoreEntry> {
    return this.mutate(gameName, async (tx, snap) => {
      const current = snap.require('lore', loreId)
      const title = input.title.trim()
      snap.assertNameFree('lore', title, loreId)
      await this.updateEntity(tx, loreId, {
        name: title,
        fields: {
          ...current.fields,
          type: input.type,
          truth: input.truth ?? current.fields.truth,
          knowledge: input.knowledge ?? current.fields.knowledge,
          content: input.content ?? current.fields.content,
          secrets: input.secrets ?? current.fields.secrets,
        },
      })
      await this.writeLoreLinks(tx, snap, loreId, input, false)
      const final = await this.loadSnapshot(tx, snap.game)
      return this.toLore(final, final.require('lore', loreId))
    })
  }

  async deleteLore(gameName: string, loreId: string): Promise<void> {
    await this.mutate(gameName, async (tx, snap) => {
      snap.require('lore', loreId)
      await tx.delete(entities).where(eq(entities.id, loreId))
    })
  }

  // ---------- sezení ----------

  async listSessions(name: string): Promise<GameSession[]> {
    const snap = await this.snapshot(this.db, name)
    return snap
      .list('session')
      .map(s => this.toSession(s))
      .sort((a, b) => b.startedAt - a.startedAt)
  }

  async createSession(gameName: string, input: GameSessionInput): Promise<GameSession> {
    return this.mutate(gameName, async (tx, snap) => {
      const existing = snap.list('session')
      // Začátek je identita sezení; při kolizi (dvě sezení ve stejné ms) posunout o 1 ms
      let startedAt = input.startedAt
      while (existing.some(s => s.fields.startedAt === startedAt)) startedAt++
      const id = await this.insertEntity(tx, snap.game.id, 'session', {
        name: String(startedAt),
        fields: { startedAt, endedAt: Date.now(), durationSeconds: input.durationSeconds, fun: input.fun, description: input.description?.trim() ?? '' },
      })
      return this.toSession((await this.loadSnapshot(tx, snap.game)).require('session', id))
    })
  }

  async updateSession(gameName: string, id: string, input: GameSessionInput): Promise<GameSession> {
    return this.mutate(gameName, async (tx, snap) => {
      const current = snap.require('session', id)
      if (input.startedAt !== current.fields.startedAt && snap.list('session').some(s => s.fields.startedAt === input.startedAt)) {
        throw new ConflictError('Sezení se stejným začátkem už existuje.')
      }
      await this.updateEntity(tx, id, {
        name: String(input.startedAt),
        fields: {
          ...current.fields,
          startedAt: input.startedAt,
          durationSeconds: input.durationSeconds,
          fun: input.fun,
          description: input.description?.trim() ?? current.fields.description,
        },
      })
      return this.toSession((await this.loadSnapshot(tx, snap.game)).require('session', id))
    })
  }

  async deleteSession(gameName: string, id: string): Promise<void> {
    await this.mutate(gameName, async (tx, snap) => {
      snap.require('session', id)
      await tx.delete(entities).where(eq(entities.id, id))
    })
  }

  // ---------- import (hromadný zápis se zachováním časů) ----------

  /**
   * Vloží entitu s explicitními časy a vazbami – pro importér z vaultu. Vazby se zapisují až po vložení všech entit
   * (viz `importLinks`), aby nezáleželo na pořadí.
   */
  async importEntity<K extends EntityKind>(
    gameId: string,
    kind: K,
    data: { name: string; fields: FieldsOf<K>; notes?: string; sortOrder?: number; image?: ImageColumns; createdAt: number; updatedAt: number },
  ): Promise<string> {
    return this.db.transaction(tx =>
      this.insertEntity(tx, gameId, kind, { ...data, createdAt: new Date(data.createdAt), updatedAt: new Date(data.updatedAt) }),
    )
  }

  async importLinks(gameId: string, fromId: string, kind: string, toIds: readonly string[], data?: readonly unknown[]): Promise<void> {
    await this.db.transaction(tx => this.setLinks(tx, gameId, fromId, kind, toIds, data))
  }

  /** Vytvoří hru s explicitními metadaty (import); vrací id */
  async importGame(data: {
    name: string
    notes: string
    rules: string
    rulesInAi: boolean
    brightBackground: boolean
    background: ImageColumns
    createdAt: number
    updatedAt: number
  }): Promise<string> {
    if (await this.findGameRow(this.db, data.name)) throw new ConflictError(`Hra „${data.name}“ už existuje.`)
    const id = newId('game')
    await this.db.insert(games).values({
      id,
      tenantId: this.tenantId,
      name: data.name,
      notes: data.notes,
      rules: data.rules,
      rulesInAi: data.rulesInAi,
      brightBackground: data.brightBackground,
      backgroundAssetId: data.background.imageAssetId,
      backgroundUrl: data.background.imageUrl,
      createdAt: new Date(data.createdAt),
      updatedAt: new Date(data.updatedAt),
    })
    return id
  }

  async setCurrentNarrator(gameId: string, narratorId: string | null): Promise<void> {
    await this.db.update(games).set({ currentNarratorId: narratorId }).where(eq(games.id, gameId))
  }

  /** Uloží asset pro hru podle id (import) a vrátí sloupce obrázku + veřejnou cestu */
  async importAsset(gameId: string, kind: string, filename: string, data: Buffer): Promise<{ columns: ImageColumns; path: string }> {
    const ext = imageExtension(filename)
    const hash = sha256(data)
    const key = assetKey(hash, ext)
    const mime = MIME_BY_EXT[ext] ?? 'application/octet-stream'
    await this.assetStore.put(key, data, { contentType: mime })
    const id = newId('asset')
    await this.db.insert(assets).values({ id, tenantId: this.tenantId, gameId, kind, mime, ext, size: data.byteLength, sha256: hash, storageKey: key, originalName: filename })
    return { columns: { imageAssetId: id, imageUrl: null }, path: `${ASSET_PATH_PREFIX}${id}${ext}` }
  }

  /** Interní řádek hry (export, import) */
  async getGameRow(name: string): Promise<GameRow | null> {
    return this.findGameRow(this.db, name)
  }
}

const MIME_BY_EXT: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.avif': 'image/avif',
  '.bmp': 'image/bmp',
  '.svg': 'image/svg+xml',
}
