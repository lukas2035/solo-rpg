import fs from 'node:fs/promises'
import path from 'node:path'
import matter from 'gray-matter'
import { isRemoteImage, type GameDetail } from '@solo-rpg/shared'
import { ObsidianVaultProvider } from '../vault/ObsidianVaultProvider.js'
import { ConflictError } from '../vault/StorageProvider.js'
import type { PostgresProvider } from './PostgresProvider.js'
import type { EntityKind } from './ids.js'

export interface ImportReport {
  game: string
  entities: number
  links: number
  entries: number
  assets: number
  /** Obrázky, které se nepodařilo načíst z vaultu (cesta → důvod) */
  missingAssets: string[]
}

export interface ImportOptions {
  /** Existující hru v Postgresu smazat a nahrát znovu (jinak 409) */
  replace?: boolean
  log?: (message: string) => void
}

/**
 * Import hry z Obsidian vaultu (v1 formát) do Postgresu. Čte přes v1 `ObsidianVaultProvider`, takže parsování
 * markdownu zůstává na jednom místě; zapisuje přes importní metody `PostgresProvider` (zachová časy vzniku).
 * Vazby podle jmen se překládají na id; neznámé cíle se vypustí (stejně jako v1 při normalizaci).
 */
export class VaultImporter {
  constructor(
    private readonly vaultPath: string,
    private readonly target: PostgresProvider,
  ) {}

  async listGames(): Promise<string[]> {
    const reader = new ObsidianVaultProvider(this.vaultPath)
    return (await reader.listGames()).map(g => g.name)
  }

  async importGame(gameName: string, options: ImportOptions = {}): Promise<ImportReport> {
    const log = options.log ?? (() => undefined)
    const reader = new ObsidianVaultProvider(this.vaultPath)
    const detail = await reader.getGame(gameName)
    if (!detail) throw new Error(`Hra „${gameName}“ ve vaultu „${this.vaultPath}“ neexistuje.`)
    const gameDir = path.join(this.vaultPath, gameName)

    if (await this.target.getGameRow(detail.meta.name)) {
      if (!options.replace) throw new ConflictError(`Hra „${detail.meta.name}“ už v databázi existuje (použij --replace).`)
      log(`Mažu existující hru „${detail.meta.name}“…`)
      await this.target.deleteGame(detail.meta.name)
    }

    const report: ImportReport = { game: detail.meta.name, entities: 0, links: 0, entries: 0, assets: 0, missingAssets: [] }
    const gameNotes = await readGameNotes(gameDir)

    // Obrázky: každý lokální soubor jednou (více entit může sdílet cestu)
    const imageCache = new Map<string, { imageAssetId: string | null; imageUrl: string | null }>()
    const image = async (ref: string | null, kind: string): Promise<{ imageAssetId: string | null; imageUrl: string | null }> => {
      if (!ref) return { imageAssetId: null, imageUrl: null }
      if (isRemoteImage(ref)) return { imageAssetId: null, imageUrl: ref }
      const cached = imageCache.get(ref)
      if (cached) return cached
      let columns = { imageAssetId: null as string | null, imageUrl: null as string | null }
      try {
        const data = await fs.readFile(path.join(gameDir, ref))
        columns = (await this.target.importAsset(gameId, kind, path.basename(ref), data)).columns
        report.assets++
      } catch {
        report.missingAssets.push(ref)
      }
      imageCache.set(ref, columns)
      return columns
    }

    const gameId = await this.target.importGame({
      name: detail.meta.name,
      notes: gameNotes,
      rules: detail.setup.rules,
      rulesInAi: detail.setup.rulesInAi,
      brightBackground: detail.setup.brightBackground,
      background: { imageAssetId: null, imageUrl: null },
      createdAt: detail.meta.createdAt,
      updatedAt: detail.meta.updatedAt,
    })
    log(`Hra „${detail.meta.name}“ → ${gameId}`)

    // Jména → id per druh (klíč = jméno tak, jak ho v1 zapisuje; v1 už jména normalizovalo na kanonický tvar)
    const ids: Record<EntityKind, Map<string, string>> = {
      character: new Map(),
      narrator: new Map(),
      scene: new Map(),
      thread: new Map(),
      faction: new Map(),
      quest: new Map(),
      location: new Map(),
      lore: new Map(),
      session: new Map(),
    }
    const add = async <K extends EntityKind>(kind: K, name: string, data: Parameters<PostgresProvider['importEntity']>[2]): Promise<string> => {
      const id = await this.target.importEntity(gameId, kind, data as never)
      ids[kind].set(name, id)
      report.entities++
      return id
    }
    const resolve = (kind: EntityKind, names: readonly string[]): string[] => {
      const out: string[] = []
      for (const n of names) {
        const id = ids[kind].get(n)
        if (id && !out.includes(id)) out.push(id)
      }
      return out
    }
    const links = async (from: string, kind: string, toIds: readonly string[], data?: readonly unknown[]) => {
      if (toIds.length === 0) return
      await this.target.importLinks(gameId, from, kind, toIds, data)
      report.links += toIds.length
    }

    // ---- entity (bez vazeb) ----
    const now = Date.now()
    for (const [i, c] of detail.setup.characters.entries()) {
      await add('character', c.name, {
        name: c.name,
        fields: { firstName: c.firstName, lastName: c.lastName, nickname: c.nickname },
        notes: c.notes,
        sortOrder: i,
        image: await image(c.image, 'portrait'),
        createdAt: now,
        updatedAt: now,
      })
    }
    for (const [i, n] of detail.setup.narrators.entries()) {
      await add('narrator', n.name, {
        name: n.name,
        fields: { description: n.description, aiPrompt: n.aiPrompt },
        sortOrder: i,
        image: await image(n.image, 'narrator'),
        createdAt: now,
        updatedAt: now,
      })
    }
    for (const l of detail.locations) {
      await add('location', l.title, {
        name: l.title,
        fields: { type: l.type, status: l.status, description: l.description, secrets: l.secrets },
        image: await image(l.image, 'location'),
        createdAt: l.createdAt,
        updatedAt: l.updatedAt,
      })
    }
    for (const f of detail.factions) {
      await add('faction', f.title, {
        name: f.title,
        fields: { type: f.type, status: f.status, stance: f.stance, goals: f.goals, description: f.description, secrets: f.secrets },
        image: await image(f.emblem, 'faction'),
        createdAt: f.createdAt,
        updatedAt: f.updatedAt,
      })
    }
    for (const s of [...detail.scenes].sort((a, b) => a.order - b.order)) {
      await add('scene', s.title, {
        name: s.title,
        fields: { description: s.description, ai: s.ai, aiPrompt: s.aiPrompt, summary: s.summary },
        sortOrder: s.order,
        image: await image(s.image, 'scene'),
        createdAt: s.createdAt,
        updatedAt: s.updatedAt,
      })
    }
    for (const t of detail.threads) {
      await add('thread', t.title, {
        name: t.title,
        fields: {
          type: t.type,
          status: t.status,
          horizon: t.horizon,
          certainty: t.certainty,
          revealCondition: t.revealCondition,
          clock: t.clock,
          description: t.description,
        },
        createdAt: t.createdAt,
        updatedAt: t.updatedAt,
      })
    }
    for (const q of detail.quests) {
      await add('quest', q.title, {
        name: q.title,
        fields: { type: q.type, status: q.status, objectives: q.objectives, rewards: q.rewards, description: q.description, outcome: q.outcome },
        notes: q.notes,
        createdAt: q.createdAt,
        updatedAt: q.updatedAt,
      })
    }
    for (const l of detail.lore) {
      await add('lore', l.title, {
        name: l.title,
        fields: { type: l.type, truth: l.truth, knowledge: l.knowledge, content: l.content, secrets: l.secrets },
        createdAt: l.createdAt,
        updatedAt: l.updatedAt,
      })
    }
    for (const s of await reader.listSessions(gameName)) {
      await add('session', s.id, {
        name: String(s.startedAt),
        fields: { startedAt: s.startedAt, endedAt: s.endedAt, durationSeconds: s.durationSeconds, fun: s.fun, description: s.description },
        createdAt: s.startedAt,
        updatedAt: s.endedAt,
      })
    }

    // ---- vazby ----
    for (const l of detail.locations) {
      await links(ids.location.get(l.title)!, 'parent', resolve('location', l.parentLocation ? [l.parentLocation] : []))
    }
    for (const f of detail.factions) {
      const id = ids.faction.get(f.title)!
      await links(id, 'leader', resolve('character', f.leader ? [f.leader] : []))
      await links(id, 'parent', resolve('faction', f.parentFaction ? [f.parentFaction] : []).filter(x => x !== id))
      await links(id, 'characters', resolve('character', f.characters))
      await links(id, 'locations', resolve('location', f.locations))
      const rel = f.relations.filter(r => ids.faction.has(r.faction) && ids.faction.get(r.faction) !== id)
      await links(
        id,
        'relation',
        rel.map(r => ids.faction.get(r.faction)!),
        rel.map(r => ({ stance: r.stance, note: r.note })),
      )
    }
    for (const s of detail.scenes) {
      const id = ids.scene.get(s.title)!
      const chars = resolve('character', s.characters)
      await links(id, 'characters', chars)
      await links(id, 'aiCharacters', resolve('character', s.aiCharacters).filter(c => chars.includes(c)))
      await links(id, 'location', resolve('location', s.location ? [s.location] : []))
    }
    for (const t of detail.threads) {
      const id = ids.thread.get(t.title)!
      await links(id, 'characters', resolve('character', t.characters))
      await links(id, 'scene', resolve('scene', t.scene ? [t.scene] : []))
      await links(id, 'factions', resolve('faction', t.factions))
      await links(id, 'locations', resolve('location', t.locations))
    }
    for (const q of detail.quests) {
      const id = ids.quest.get(q.title)!
      await links(id, 'questGiver', resolve('character', q.questGiver ? [q.questGiver] : []))
      await links(id, 'parent', resolve('quest', q.parentQuest ? [q.parentQuest] : []).filter(x => x !== id))
      await links(id, 'characters', resolve('character', q.characters))
      await links(id, 'threads', resolve('thread', q.threads))
      await links(id, 'factions', resolve('faction', q.factions))
      await links(id, 'locations', resolve('location', q.locations))
    }
    for (const l of detail.lore) {
      const id = ids.lore.get(l.title)!
      await links(id, 'characters', resolve('character', l.characters))
      await links(id, 'locations', resolve('location', l.locations))
      await links(id, 'factions', resolve('faction', l.factions))
      await links(id, 'quests', resolve('quest', l.quests))
      await links(id, 'threads', resolve('thread', l.threads))
    }

    // ---- repliky scén ----
    for (const s of detail.scenes) {
      const entries = await reader.getSceneEntries(gameName, s.id)
      if (!entries || entries.length === 0) continue
      await this.target.saveSceneEntries(detail.meta.name, ids.scene.get(s.title)!, entries)
      report.entries += entries.length
    }

    // ---- setup (pozadí, aktuální vypravěč) ----
    await this.target.saveSetup(detail.meta.name, {
      backgroundImage: await backgroundRef(detail, image, this.target, detail.meta.name),
      brightBackground: detail.setup.brightBackground,
      narrator: detail.setup.narrator,
      rules: detail.setup.rules,
      rulesInAi: detail.setup.rulesInAi,
    })
    log(`Hotovo: ${report.entities} entit, ${report.links} vazeb, ${report.entries} replik, ${report.assets} obrázků${report.missingAssets.length ? `, chybí ${report.missingAssets.length} obrázků` : ''}`)
    return report
  }
}

/** Pozadí hry: lokální soubor → asset a jeho veřejná cesta, kterou `saveSetup` přeloží na sloupec */
async function backgroundRef(
  detail: GameDetail,
  image: (ref: string | null, kind: string) => Promise<{ imageAssetId: string | null; imageUrl: string | null }>,
  target: PostgresProvider,
  gameName: string,
): Promise<string | null> {
  const ref = detail.setup.backgroundImage
  if (!ref) return null
  if (isRemoteImage(ref)) return ref
  const columns = await image(ref, 'background')
  if (!columns.imageAssetId) return null
  const file = await target.getAssetFile(gameName, columns.imageAssetId)
  return file
}

/** Poznámky hráče = tělo `game.md` před značkou `<!-- rules -->` (v1 API je nevrací) */
async function readGameNotes(gameDir: string): Promise<string> {
  try {
    const raw = await fs.readFile(path.join(gameDir, 'game.md'), 'utf8')
    const body = matter(raw).content
    const idx = body.search(/<!--\s*rules\s*-->/)
    return (idx >= 0 ? body.slice(0, idx) : body).replace(/^\n+/, '').trimEnd()
  } catch {
    return ''
  }
}
