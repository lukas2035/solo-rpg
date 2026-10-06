import fs from 'node:fs/promises'
import path from 'node:path'
import type { GameDetail } from '@solo-rpg/shared'
import { ObsidianVaultProvider } from '../vault/ObsidianVaultProvider.js'
import type { StorageProvider } from '../vault/StorageProvider.js'
import { ASSET_PATH_PREFIX, type PostgresProvider } from './PostgresProvider.js'
import type { AssetStore } from './AssetStore.js'

/**
 * Export hry z Postgresu do čitelného Obsidian vaultu (docs/ARCHITECTURE_V2.md §2.4).
 *
 * Nepíše markdown sám – znovu „přehraje“ hru přes v1 `ObsidianVaultProvider`, takže formát souborů zůstává přesně
 * ten, který Obsidian i původní aplikace znají. Složka hry v cílovém vaultu se vždy přepíše celá (export je snímek).
 * Cena: id a časy vzniku ve vaultu jsou nové (v1 je odvozuje z času zápisu); jména a obsah jsou shodné.
 */
export class ObsidianExporter {
  constructor(
    private readonly source: PostgresProvider,
    private readonly assetStore: AssetStore,
  ) {}

  /** Vyexportuje hru do `<vaultPath>/<game>`; vrací absolutní cestu složky hry */
  async exportGame(gameName: string, vaultPath: string): Promise<string> {
    const detail = await this.source.getGame(gameName)
    if (!detail) throw new Error(`Hra „${gameName}“ neexistuje.`)
    const target = new ObsidianVaultProvider(vaultPath)
    await target.init()
    const gameDir = path.join(vaultPath, detail.meta.name)
    await fs.rm(gameDir, { recursive: true, force: true })
    await target.createGame(detail.meta.name)
    await this.replay(detail, target, gameName)
    return gameDir
  }

  private async replay(detail: GameDetail, target: StorageProvider, sourceName: string): Promise<void> {
    const game = detail.meta.name
    const image = (ref: string | null, kind: Parameters<StorageProvider['saveAsset']>[1]['kind'], ownerName: string) => this.copyImage(sourceName, ref, target, game, kind, ownerName)

    // Lokace: rodiče dřív než děti
    for (const loc of topo(detail.locations, l => l.title, l => l.parentLocation)) {
      await tick()
      await target.createLocation(game, { ...loc, image: await image(loc.image, 'location', loc.title) })
    }
    for (const ch of detail.setup.characters) {
      await tick()
      await target.createCharacter(game, { ...ch, image: await image(ch.image, 'portrait', ch.name) })
    }
    for (const n of detail.setup.narrators) {
      await tick()
      await target.createNarrator(game, { ...n, image: await image(n.image, 'narrator', n.name) })
    }
    for (const f of topo(detail.factions, f => f.title, f => f.parentFaction)) {
      await tick()
      await target.createFaction(game, { ...f, emblem: await image(f.emblem, 'faction', f.title) })
    }
    // Vztahy frakcí mohou mířit na frakce vytvořené později → druhý průchod
    for (const f of detail.factions) {
      if (f.relations.length === 0) continue
      const created = (await target.listFactions(game)).find(x => x.title === f.title)
      if (created) await target.updateFaction(game, created.id, { title: f.title, type: f.type, relations: f.relations })
    }
    const sceneIds = new Map<string, string>()
    for (const scene of [...detail.scenes].sort((a, b) => a.order - b.order)) {
      await tick()
      const created = await target.createScene(game, { ...scene, order: undefined, image: await image(scene.image, 'scene', scene.title) })
      sceneIds.set(scene.id, created.id)
    }
    for (const t of detail.threads) {
      await tick()
      await target.createThread(game, t)
    }
    for (const q of topo(detail.quests, q => q.title, q => q.parentQuest)) {
      await tick()
      await target.createQuest(game, q)
    }
    for (const l of detail.lore) {
      await tick()
      await target.createLore(game, l)
    }
    for (const scene of detail.scenes) {
      const entries = await this.source.getSceneEntries(sourceName, scene.id)
      const targetId = sceneIds.get(scene.id)
      if (entries && entries.length > 0 && targetId) await target.saveSceneEntries(game, targetId, entries)
    }
    for (const s of [...(await this.source.listSessions(sourceName))].sort((a, b) => a.startedAt - b.startedAt)) {
      await target.createSession(game, s)
    }
    await target.saveSetup(game, {
      backgroundImage: await image(detail.setup.backgroundImage, 'background', ''),
      brightBackground: detail.setup.brightBackground,
      narrator: detail.setup.narrator,
      rules: detail.setup.rules,
      rulesInAi: detail.setup.rulesInAi,
    })
  }

  /** Lokální asset zkopíruje do vaultu a vrátí novou cestu; vzdálené URL a null projdou beze změny */
  private async copyImage(
    sourceName: string,
    ref: string | null,
    target: StorageProvider,
    game: string,
    kind: Parameters<StorageProvider['saveAsset']>[1]['kind'],
    ownerName: string,
  ): Promise<string | null> {
    if (!ref || !ref.startsWith(ASSET_PATH_PREFIX)) return ref
    const asset = await this.source.getAsset(sourceName, ref.slice(ASSET_PATH_PREFIX.length))
    if (!asset) return null
    const data = await readAll(await this.assetStore.get(asset.storageKey))
    return target.saveAsset(game, { kind, ownerName, filename: ref.slice(ASSET_PATH_PREFIX.length), mimeType: asset.mime, data })
  }
}

/** Seřadí položky tak, aby rodič předcházel potomkům (cykly/chybějící rodiče neblokují) */
function topo<T>(items: readonly T[], key: (t: T) => string, parent: (t: T) => string | null): T[] {
  const byKey = new Map(items.map(i => [key(i), i]))
  const result: T[] = []
  const done = new Set<string>()
  const visit = (item: T, stack: Set<string>) => {
    const k = key(item)
    if (done.has(k) || stack.has(k)) return
    stack.add(k)
    const p = parent(item)
    const parentItem = p ? byKey.get(p) : undefined
    if (parentItem) visit(parentItem, stack)
    done.add(k)
    result.push(item)
  }
  for (const item of items) visit(item, new Set())
  return result
}

/** v1 odvozuje id z `Date.now()` – mezi dvěma zápisy stejného druhu musí uplynout aspoň 1 ms */
let lastTick = 0
async function tick(): Promise<void> {
  while (Date.now() <= lastTick) await new Promise(r => setTimeout(r, 1))
  lastTick = Date.now()
}

async function readAll(stream: NodeJS.ReadableStream): Promise<Buffer> {
  const chunks: Buffer[] = []
  for await (const chunk of stream) chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk)
  return Buffer.concat(chunks)
}
