import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { eq } from 'drizzle-orm'
import { openDatabase, type Database } from '../src/storage/db.js'
import { FsAssetStore } from '../src/storage/AssetStore.js'
import { PostgresProvider } from '../src/storage/PostgresProvider.js'
import { events, games } from '../src/storage/schema.js'
import { NotFoundError } from '../src/vault/StorageProvider.js'
import { SuggestionService } from '../src/narrative/suggestions.js'
import type { Config } from '../src/config.js'

// AI provider se nevolÃƒÂ¡ Ã¢â‚¬â€œ nÃƒÂ¡vrh dodÃƒÂ¡ mock; testuje se jen smyÃ„Âka Suggestion Ã¢â€ â€™ Accept / Reject a zÃƒÂ¡pis do `events`
vi.mock('../src/ai/sceneAi.js', () => ({
  draftSceneReply: vi.fn(async (_s: unknown, _c: unknown, _g: string, sceneId: string, rejectedReasons: string[]) => ({
    entries: [
      { id: `ai-${Date.now()}-1`, characterName: null, narratorName: 'VypravÃ„â€ºÃ„Â', text: `Pokus ${rejectedReasons.length + 1} pro ${sceneId}`, timestamp: Date.now() },
      { id: `ai-${Date.now()}-2`, characterName: 'Julia KreuzovÃƒÂ¡', narratorName: null, text: 'Ahoj.', timestamp: Date.now() + 1 },
    ],
    raw: 'RAW',
    context: { sections: [], included: ['Nit: X (thr_x)'], dropped: 0, tokensUsed: 10 },
  })),
}))

const DATABASE_URL = process.env.DATABASE_URL ?? 'postgres://solo:solo@localhost:5432/solo_rpg'
const G = `Test sug ${Date.now()}`

let database: Database
let tmp: string
let storage: PostgresProvider
let service: SuggestionService
let sceneId: string

beforeAll(async () => {
  database = await openDatabase(DATABASE_URL)
  tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'solo-rpg-sug-'))
  storage = new PostgresProvider(database.db, new FsAssetStore(path.join(tmp, 'assets')))
  await storage.createGame(G)
  await storage.createNarrator(G, { name: 'VypravÃ„â€ºÃ„Â' })
  await storage.createCharacter(G, { firstName: 'Julia', lastName: 'KreuzovÃƒÂ¡', nickname: 'Julia' })
  const scene = await storage.createScene(G, { title: 'Noc', ai: true })
  sceneId = scene.id
  await storage.saveSceneEntries(G, sceneId, [{ id: 'p1', characterName: 'Julia KreuzovÃƒÂ¡', text: 'ZaÃ„ÂÃƒÂ¡tek.', timestamp: 1 }])
  service = new SuggestionService(storage, { ai: { contextTokens: 1000, transcriptTokens: 1000 } } as unknown as Config)
})

afterAll(async () => {
  for (const g of await storage.listGames()) if (g.name.startsWith('Test sug ')) await storage.deleteGame(g.name)
  await database.close()
  await fs.rm(tmp, { recursive: true, force: true })
})

async function eventKinds(): Promise<string[]> {
  const [game] = await database.db.select({ id: games.id }).from(games).where(eq(games.name, G))
  const rows = await database.db.select({ kind: events.kind }).from(events).where(eq(events.gameId, game.id)).orderBy(events.id)
  return rows.map(r => r.kind)
}

describe('SuggestionService', () => {
  it('generate nic neuloÃ…Â¾ÃƒÂ­, nÃƒÂ¡vrh je k dispozici pÃ…â„¢es get', async () => {
    const s = await service.generate(G, sceneId)
    expect(s.id).toMatch(/^sug_/)
    expect(s.entries).toHaveLength(2)
    expect(s.rejectedReasons).toEqual([])
    expect(s.contextIncluded).toEqual(['Nit: X (thr_x)'])
    expect((await storage.getSceneEntries(G, sceneId))?.map(e => e.id)).toEqual(['p1'])
    expect(service.get(G, sceneId).suggestion?.id).toBe(s.id)
  })

  it('reject s dÃ…Â¯vodem: nÃƒÂ¡vrh zmizÃƒÂ­, dÃ…Â¯vod jde do dalÃ…Â¡ÃƒÂ­ho generate; prÃƒÂ¡zdnÃƒÂ½ dÃ…Â¯vod se neuklÃƒÂ¡dÃƒÂ¡', async () => {
    const first = service.get(G, sceneId).suggestion!
    const state = await service.reject(G, sceneId, first.id, '  Julia nenÃƒÂ­ KlÃƒÂ¡Ã…â„¢ina kamarÃƒÂ¡dka ')
    expect(state.suggestion).toBeNull()
    expect(state.rejectedReasons).toEqual(['Julia nenÃƒÂ­ KlÃƒÂ¡Ã…â„¢ina kamarÃƒÂ¡dka'])
    await expect(service.reject(G, sceneId, first.id, 'znovu')).rejects.toBeInstanceOf(NotFoundError)

    const second = await service.generate(G, sceneId)
    expect(second.rejectedReasons).toEqual(['Julia nenÃƒÂ­ KlÃƒÂ¡Ã…â„¢ina kamarÃƒÂ¡dka'])
    expect(second.entries[0].text).toContain('Pokus 2')
    const after = await service.reject(G, sceneId, second.id, '')
    expect(after.rejectedReasons).toEqual(['Julia nenÃƒÂ­ KlÃƒÂ¡Ã…â„¢ina kamarÃƒÂ¡dka'])
  })

  it('accept pÃ…â„¢ipÃƒÂ­Ã…Â¡e (upravenÃƒÂ©) zÃƒÂ¡znamy za aktuÃƒÂ¡lnÃƒÂ­ stav scÃƒÂ©ny a vynuluje dÃ…Â¯vody', async () => {
    const s = await service.generate(G, sceneId)
    // HrÃƒÂ¡Ã„Â mezitÃƒÂ­m psal
    const current = (await storage.getSceneEntries(G, sceneId))!
    await storage.saveSceneEntries(G, sceneId, [...current, { id: 'p2', characterName: 'Julia KreuzovÃƒÂ¡', text: 'MezitÃƒÂ­m.', timestamp: 2 }])
    // HrÃƒÂ¡Ã„Â upravil text prvnÃƒÂ­ repliky a druhou smazal
    const edited = [{ ...s.entries[0], text: 'UpravenÃƒÂ½ text.' }]
    const { entries: added, suggestion: rest } = await service.accept(G, sceneId, s.id, edited)
    expect(rest).toBeNull()
    expect(added).toHaveLength(1)
    const entries = (await storage.getSceneEntries(G, sceneId))!
    expect(entries.map(e => e.id)).toEqual(['p1', 'p2', s.entries[0].id])
    expect(entries[2].text).toBe('UpravenÃƒÂ½ text.')
    expect(entries[2].narratorName).toBe('VypravÃ„â€ºÃ„Â')
    expect(service.get(G, sceneId)).toEqual({ suggestion: null, rejectedReasons: [] })
    await expect(service.accept(G, sceneId, s.id, edited)).rejects.toBeInstanceOf(NotFoundError)
  })

  it('kaÃ…Â¾dÃƒÂ½ krok je v events', async () => {
    const kinds = await eventKinds()
    expect(kinds).toEqual([
      'ai.suggestion.created',
      'ai.suggestion.rejected',
      'ai.suggestion.created',
      'ai.suggestion.rejected',
      'ai.suggestion.created',
      'ai.suggestion.accepted',
    ])
    const [game] = await database.db.select({ id: games.id }).from(games).where(eq(games.name, G))
    const accepted = await database.db.select().from(events).where(eq(events.gameId, game.id)).orderBy(events.id)
    const last = accepted[accepted.length - 1]
    expect(last.sceneId).toBe(sceneId)
    expect((last.payload as { edited: boolean }).edited).toBe(true)
    const rejected = accepted[1].payload as { reason: string }
    expect(rejected.reason).toBe('Julia nenÃƒÂ­ KlÃƒÂ¡Ã…â„¢ina kamarÃƒÂ¡dka')
  })

  it('forget zahodÃƒÂ­ stav scÃƒÂ©ny', async () => {
    await service.generate(G, sceneId)
    service.forget(G, sceneId)
    expect(service.get(G, sceneId)).toEqual({ suggestion: null, rejectedReasons: [] })
  })
  it('partial accept připíše jen vybrané repliky, zbytek zůstane jako návrh; reject zbytek zahodí', async () => {
    const s = await service.generate(G, sceneId)
    expect(s.entries).toHaveLength(2)
    const before = (await storage.getSceneEntries(G, sceneId))!.length
    const first = await service.accept(G, sceneId, s.id, [{ ...s.entries[0], text: 'Jen první.' }], true)
    expect(first.entries.map(e => e.text)).toEqual(['Jen první.'])
    expect(first.suggestion?.id).toBe(s.id)
    expect(first.suggestion?.entries.map(e => e.id)).toEqual([s.entries[1].id])
    expect(service.get(G, sceneId).suggestion?.entries).toHaveLength(1)
    expect((await storage.getSceneEntries(G, sceneId))!.length).toBe(before + 1)
    // Zbytek odmítnout → návrh zmizí, přijaté repliky ve scéně zůstanou
    const state = await service.reject(G, sceneId, s.id, 'druhá replika nesedí')
    expect(state.suggestion).toBeNull()
    expect(state.rejectedReasons).toEqual(['druhá replika nesedí'])
    expect((await storage.getSceneEntries(G, sceneId))!.length).toBe(before + 1)
    // Poslední replika přijatá přes partial = návrh vyřízen celý (důvody se vynulují)
    const s2 = await service.generate(G, sceneId)
    const a1 = await service.accept(G, sceneId, s2.id, [s2.entries[0]], true)
    expect(a1.suggestion?.entries).toHaveLength(1)
    const a2 = await service.accept(G, sceneId, s2.id, a1.suggestion!.entries, true)
    expect(a2.suggestion).toBeNull()
    expect(service.get(G, sceneId)).toEqual({ suggestion: null, rejectedReasons: [] })
  })
})
