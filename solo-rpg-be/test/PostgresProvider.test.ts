import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { openDatabase, type Database } from '../src/storage/db.js'
import { FsAssetStore } from '../src/storage/AssetStore.js'
import { PostgresProvider } from '../src/storage/PostgresProvider.js'
import { ConflictError, NotFoundError, ValidationError } from '../src/vault/StorageProvider.js'
import { ObsidianExporter } from '../src/storage/ObsidianExporter.js'
import { VaultImporter } from '../src/storage/VaultImporter.js'
import { ObsidianVaultProvider } from '../src/vault/ObsidianVaultProvider.js'

/**
 * Integrační testy nad skutečným Postgresem (`npm run db:up`). Každý běh používá hru s unikátním názvem
 * a po sobě uklidí.
 */
const DATABASE_URL = process.env.DATABASE_URL ?? 'postgres://solo:solo@localhost:5432/solo_rpg'

let database: Database
let tmp: string
let assetStore: FsAssetStore
let storage: PostgresProvider
const G = `Test ${Date.now()}`

beforeAll(async () => {
  database = await openDatabase(DATABASE_URL)
  tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'solo-rpg-test-'))
  assetStore = new FsAssetStore(path.join(tmp, 'assets'))
  storage = new PostgresProvider(database.db, assetStore)
  await storage.createGame(G)
})

afterAll(async () => {
  for (const g of await storage.listGames()) if (g.name.startsWith('Test ')) await storage.deleteGame(g.name)
  await database.close()
  await fs.rm(tmp, { recursive: true, force: true })
})

describe('hry', () => {
  it('vytvoří, najde a přejmenuje hru; duplicitní název je 409', async () => {
    const detail = await storage.getGame(G)
    expect(detail?.meta.name).toBe(G)
    expect(detail?.setup.brightBackground).toBe(true)
    await expect(storage.createGame(G.toUpperCase())).rejects.toBeInstanceOf(ConflictError)
    const meta = await storage.renameGame(G, `${G} b`)
    expect(meta.name).toBe(`${G} b`)
    await storage.renameGame(`${G} b`, G)
  })
})

describe('postavy a scény', () => {
  it('postava: duplicitní jméno 409, update s image undefined zachová obrázek, null odebere', async () => {
    const a = await storage.createCharacter(G, { firstName: 'Aria', lastName: 'Nox', nickname: 'Aria', image: 'https://x/a.png' })
    expect(a.id).toMatch(/^chr_/)
    expect(a.name).toBe('Aria Nox')
    await expect(storage.createCharacter(G, { firstName: 'aria', lastName: 'NOX', nickname: 'x' })).rejects.toBeInstanceOf(ConflictError)
    const kept = await storage.updateCharacter(G, a.id, { firstName: 'Aria', lastName: 'Nox', nickname: 'Ari' })
    expect(kept.image).toBe('https://x/a.png')
    expect(kept.nickname).toBe('Ari')
    const removed = await storage.updateCharacter(G, a.id, { firstName: 'Aria', lastName: 'Nox', nickname: 'Ari', image: null })
    expect(removed.image).toBeNull()
  })

  it('asset: saveAsset vrací assets/<id><ext>, getAsset ho najde a obrázek lze přiřadit', async () => {
    const p = await storage.saveAsset(G, { kind: 'portrait', ownerName: 'Aria Nox', filename: 'aria.PNG', mimeType: 'image/png', data: Buffer.from('png-data') })
    expect(p).toMatch(/^assets\/ast_[a-z0-9]+\.png$/)
    const asset = await storage.getAsset(G, p.slice('assets/'.length))
    expect(asset?.mime).toBe('image/png')
    expect(await assetStore.head(asset!.storageKey)).toEqual({ size: 8 })
    const [aria] = (await storage.getGame(G))!.setup.characters
    const updated = await storage.updateCharacter(G, aria.id, { firstName: 'Aria', lastName: 'Nox', nickname: 'Ari', image: p })
    expect(updated.image).toBe(p)
  })

  it('scény: pořadí 1..n, dědění postav od souseda, aiCharacters ⊆ characters, přesun a mazání přečísluje', async () => {
    const bob = await storage.createCharacter(G, { firstName: 'Bob', lastName: '', nickname: 'Bob' })
    const s1 = await storage.createScene(G, { title: 'Jedna', characters: ['Aria Nox', 'Bob', 'Neznámý'], ai: true, aiCharacters: ['Bob', 'Aria Nox'] })
    expect(s1.order).toBe(1)
    expect(s1.characters).toEqual(['Aria Nox', 'Bob'])
    expect(s1.aiCharacters).toEqual(['Bob', 'Aria Nox'])
    const s2 = await storage.createScene(G, { title: 'Dvě' })
    expect(s2.order).toBe(2)
    expect(s2.characters).toEqual(['Aria Nox', 'Bob'])
    expect(s2.ai).toBe(true)
    expect(s2.aiPrompt).toBe('')
    // vložení na pozici 1 → původní se posunou
    const s0 = await storage.createScene(G, { title: 'Nula', order: 1, characters: [] })
    expect(s0.order).toBe(1)
    let scenes = await storage.listScenes(G)
    expect(scenes.map(s => s.title)).toEqual(['Nula', 'Jedna', 'Dvě'])
    // přesun „Dvě“ na začátek
    await storage.updateScene(G, s2.id, { title: 'Dvě', order: 1 })
    scenes = await storage.listScenes(G)
    expect(scenes.map(s => `${s.order}:${s.title}`)).toEqual(['1:Dvě', '2:Nula', '3:Jedna'])
    // aiCharacters se ořízne na postavy scény
    const trimmed = await storage.updateScene(G, s1.id, { title: 'Jedna', characters: ['Bob'] })
    expect(trimmed.aiCharacters).toEqual(['Bob'])
    // smazání postavy ji odebere ze scén
    await storage.deleteCharacter(G, bob.id)
    expect((await storage.listScenes(G)).find(s => s.id === s1.id)?.characters).toEqual([])
    await storage.deleteScene(G, s0.id)
    expect((await storage.listScenes(G)).map(s => s.order)).toEqual([1, 2])
    await expect(storage.updateScene(G, 'scn_nope', { title: 'x' })).rejects.toBeInstanceOf(NotFoundError)
  })

  it('repliky: uloží a vrátí v pořadí; jméno smazané postavy zůstane ze snímku', async () => {
    const tmpChar = await storage.createCharacter(G, { firstName: 'Tmp', lastName: '', nickname: 'Tmp' })
    const [scene] = await storage.listScenes(G)
    const entries = [
      { id: 'e1', characterName: null, narratorName: null, text: 'Úvod', timestamp: 1000 },
      { id: 'e2', characterName: 'Aria Nox', text: 'Ahoj', timestamp: 2000, markdown: true },
      { id: 'e3', characterName: 'Tmp', text: 'Čau', timestamp: 3000 },
      { id: 'e4', characterName: 'Kolemjdoucí', text: '…', timestamp: 4000 },
    ]
    await storage.saveSceneEntries(G, scene.id, entries)
    let read = await storage.getSceneEntries(G, scene.id)
    expect(read?.map(e => e.id)).toEqual(['e1', 'e2', 'e3', 'e4'])
    expect(read?.[1]).toMatchObject({ characterName: 'Aria Nox', markdown: true })
    expect(read?.[3].characterName).toBe('Kolemjdoucí')
    // přejmenování postavy se promítne, smazání ponechá snímek
    const aria = (await storage.getGame(G))!.setup.characters.find(c => c.name === 'Aria Nox')!
    await storage.updateCharacter(G, aria.id, { firstName: 'Arya', lastName: 'Nox', nickname: 'Ari' })
    await storage.deleteCharacter(G, tmpChar.id)
    read = await storage.getSceneEntries(G, scene.id)
    expect(read?.[1].characterName).toBe('Arya Nox')
    expect(read?.[2].characterName).toBe('Tmp')
    await storage.updateCharacter(G, aria.id, { firstName: 'Aria', lastName: 'Nox', nickname: 'Ari' })
    expect(await storage.getSceneEntries(G, 'scn_nope')).toBeNull()
  })
})

describe('vypravěči a setup', () => {
  it('aktuální vypravěč: saveSetup s neznámým = 404, smazání aktuálního = null', async () => {
    const n = await storage.createNarrator(G, { name: 'Vypravěč' })
    await expect(storage.saveSetup(G, { backgroundImage: null, brightBackground: false, narrator: 'Nikdo', rules: '', rulesInAi: false })).rejects.toBeInstanceOf(NotFoundError)
    const setup = await storage.saveSetup(G, { backgroundImage: 'https://x/bg.png', brightBackground: false, narrator: 'vypravěč', rules: 'VtM', rulesInAi: true })
    expect(setup.narrator).toBe('Vypravěč')
    expect(setup.backgroundImage).toBe('https://x/bg.png')
    expect(setup.rules).toBe('VtM')
    await storage.deleteNarrator(G, n.id)
    expect((await storage.getGame(G))!.setup.narrator).toBeNull()
  })
})

describe('frakce, questy, lokace, lore', () => {
  it('rodič: neexistující → null, sám sobě / cyklus → 400; vztahy max. jeden na frakci', async () => {
    const root = await storage.createFaction(G, { title: 'Řád', type: 'religious', parentFaction: 'Neexistuje' })
    expect(root.parentFaction).toBeNull()
    expect(root.status).toBe('active')
    const child = await storage.createFaction(G, { title: 'Odnož', type: 'secret', parentFaction: 'řád', relations: [{ faction: 'Řád', stance: 'tense' }, { faction: 'Řád', stance: 'allied' }, { faction: 'Odnož', stance: 'allied' }] })
    expect(child.parentFaction).toBe('Řád')
    expect(child.relations).toEqual([{ faction: 'Řád', stance: 'tense', note: '' }])
    await expect(storage.updateFaction(G, root.id, { title: 'Řád', type: 'religious', parentFaction: 'Odnož' })).rejects.toBeInstanceOf(ValidationError)
    await expect(storage.updateFaction(G, root.id, { title: 'Řád', type: 'religious', parentFaction: 'Řád' })).rejects.toBeInstanceOf(ValidationError)
    // přejmenování rodiče se promítne do dítěte; smazání rodiče vazbu zruší
    await storage.updateFaction(G, root.id, { title: 'Velký řád', type: 'religious' })
    expect((await storage.listFactions(G)).find(f => f.id === child.id)?.parentFaction).toBe('Velký řád')
    await storage.deleteFaction(G, root.id)
    const orphan = (await storage.listFactions(G)).find(f => f.id === child.id)!
    expect(orphan.parentFaction).toBeNull()
    expect(orphan.relations).toEqual([])
  })

  it('quest: cíle dostanou id a zachovají si ho, prázdné se vypustí; vazby na nitě/lokace', async () => {
    const loc = await storage.createLocation(G, { title: 'Praha', type: 'city' })
    expect(loc.status).toBe('known')
    const thread = await storage.createThread(G, { title: 'Stín', type: 'mystery', locations: ['praha'], scene: 'Jedna' })
    expect(thread.status).toBe('latent')
    expect(thread.horizon).toBe('short-term')
    expect(thread.locations).toEqual(['Praha'])
    expect(thread.scene).toBe('Jedna')
    const q = await storage.createQuest(G, { title: 'Najít', type: 'main', objectives: [{ title: 'A' }, { title: '  ' }, { title: 'B', optional: true }], threads: ['Stín'], locations: ['Praha'], rewards: [' zlato ', ''] })
    expect(q.objectives.map(o => o.title)).toEqual(['A', 'B'])
    expect(q.objectives[1].optional).toBe(true)
    expect(q.rewards).toEqual(['zlato'])
    const idA = q.objectives[0].id
    const q2 = await storage.updateQuest(G, q.id, { title: 'Najít', type: 'main', objectives: [{ id: idA, title: 'A2', status: 'completed' }] })
    expect(q2.objectives).toEqual([{ id: idA, title: 'A2', status: 'completed', optional: false }])
    const lore = await storage.createLore(G, { title: 'Legenda', type: 'legend', quests: ['Najít'], threads: ['Stín'], characters: ['Aria Nox'] })
    expect(lore.truth).toBe('unknown')
    expect(lore.quests).toEqual(['Najít'])
    await storage.deleteThread(G, thread.id)
    expect((await storage.listLore(G))[0].threads).toEqual([])
    expect((await storage.listQuests(G))[0].threads).toEqual([])
  })
})

describe('sezení', () => {
  it('kolize začátku se posune o 1 ms, seznam je od nejnovějšího, update na cizí začátek = 409', async () => {
    const a = await storage.createSession(G, { startedAt: 1_700_000_000_000, durationSeconds: 60, fun: 7.5 })
    const b = await storage.createSession(G, { startedAt: 1_700_000_000_000, durationSeconds: 10, fun: 5 })
    expect(b.startedAt).toBe(1_700_000_000_001)
    expect((await storage.listSessions(G)).map(s => s.id)).toEqual([b.id, a.id])
    await expect(storage.updateSession(G, a.id, { startedAt: b.startedAt, durationSeconds: 1, fun: 1 })).rejects.toBeInstanceOf(ConflictError)
    const upd = await storage.updateSession(G, a.id, { startedAt: 1_600_000_000_000, durationSeconds: 1, fun: 1, description: 'x' })
    expect(upd.id).toBe(a.id)
    expect(upd.description).toBe('x')
    await storage.deleteSession(G, b.id)
    expect(await storage.listSessions(G)).toHaveLength(1)
  })
})

describe('export → import (round trip přes Obsidian vault)', () => {
  it('vyexportovaná hra se dá načíst v1 providerem a znovu importovat se stejným obsahem', async () => {
    const vault = path.join(tmp, 'vault')
    const exporter = new ObsidianExporter(storage, assetStore)
    const dir = await exporter.exportGame(G, vault)
    expect(dir).toBe(path.join(vault, G))
    const v1 = new ObsidianVaultProvider(vault)
    const exported = await v1.getGame(G)
    const original = (await storage.getGame(G))!
    expect(exported?.setup.characters.map(c => c.name)).toEqual(original.setup.characters.map(c => c.name))
    expect(exported?.scenes.map(s => [s.order, s.title, s.characters])).toEqual(original.scenes.map(s => [s.order, s.title, s.characters]))
    expect(exported?.quests[0].objectives).toEqual(original.quests[0].objectives)
    expect(exported?.setup.characters[0].image).toMatch(/^portraits\//)
    expect((await v1.getSceneEntries(G, exported!.scenes[0].id))?.map(e => e.text)).toEqual((await storage.getSceneEntries(G, original.scenes[0].id))?.map(e => e.text))

    const importer = new VaultImporter(vault, storage)
    await expect(importer.importGame(G)).rejects.toBeInstanceOf(ConflictError)
    const report = await importer.importGame(G, { replace: true })
    expect(report.assets).toBe(1)
    expect(report.missingAssets).toEqual([])
    const reimported = (await storage.getGame(G))!
    expect(reimported.setup.characters.map(c => c.name)).toEqual(original.setup.characters.map(c => c.name))
    expect(reimported.setup.characters[0].image).toMatch(/^assets\//)
    expect(reimported.scenes.map(s => [s.order, s.title, s.characters])).toEqual(original.scenes.map(s => [s.order, s.title, s.characters]))
    expect(reimported.quests[0].objectives).toEqual(original.quests[0].objectives)
    expect(reimported.lore[0].quests).toEqual(['Najít'])
    expect((await storage.listSessions(G)).length).toBe(1)
    expect((await storage.getSceneEntries(G, reimported.scenes[0].id))?.length).toBe(4)
  })
})
