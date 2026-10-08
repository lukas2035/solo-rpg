import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { openDatabase, type Database } from '../src/storage/db.js'
import { FsAssetStore } from '../src/storage/AssetStore.js'
import { PostgresProvider } from '../src/storage/PostgresProvider.js'
import { NotFoundError } from '../src/vault/StorageProvider.js'
import { SuggestionService } from '../src/narrative/suggestions.js'
import { BEAT_ACCEPTED_EVENT, BRIEF_CREATED_EVENT, DirectorService } from '../src/director/directorService.js'
import type { Config } from '../src/config.js'
import type { NarrativeBrief } from '@solo-rpg/shared'

// AI se nevolá – mock vrátí jeden řádek a zapamatuje si, jaký brief dostal (ověření, že režie jde do promptu)
const seenBriefs: (NarrativeBrief | null)[] = []
vi.mock('../src/ai/sceneAi.js', () => ({
  draftSceneReply: vi.fn(async (_s: unknown, _c: unknown, _g: string, _scene: string, _reasons: string[], _log: unknown, brief: NarrativeBrief | null) => {
    seenBriefs.push(brief)
    return {
      entries: [{ id: `ai-${Date.now()}`, characterName: null, narratorName: 'Vypravěč', text: 'Text.', timestamp: Date.now() }],
      raw: 'RAW',
      context: { sections: [], included: [], dropped: 0, tokensUsed: 0 },
    }
  }),
}))

const DATABASE_URL = process.env.DATABASE_URL ?? 'postgres://solo:solo@localhost:5432/solo_rpg'
const G = `Test dir ${Date.now()}`

let database: Database
let tmp: string
let storage: PostgresProvider
let director: DirectorService
let suggestions: SuggestionService
let sceneId: string

beforeAll(async () => {
  database = await openDatabase(DATABASE_URL)
  tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'solo-rpg-dir-'))
  storage = new PostgresProvider(database.db, new FsAssetStore(path.join(tmp, 'assets')))
  await storage.createGame(G)
  await storage.createNarrator(G, { name: 'Vypravěč' })
  await storage.createCharacter(G, { firstName: 'Klára', lastName: 'Nováková', nickname: 'Klára' })
  await storage.createThread(G, { title: 'Zrada', type: 'threat', status: 'escalated', horizon: 'short-term', certainty: 'confirmed', characters: ['Klára Nováková'] })
  const scene = await storage.createScene(G, { title: 'Noc', ai: true, characters: ['Klára Nováková'] })
  sceneId = scene.id
  director = new DirectorService(storage)
  suggestions = new SuggestionService(storage, { ai: { contextTokens: 1000, transcriptTokens: 1000 } } as unknown as Config, director)
})

afterAll(async () => {
  for (const g of await storage.listGames()) if (g.name.startsWith('Test dir ')) await storage.deleteGame(g.name)
  await database.close()
  await fs.rm(tmp, { recursive: true, force: true })
})

describe('DirectorService', () => {
  it('puls z dat hry; brief vzniká per scéna a přepis seedu je deterministický', async () => {
    const state = await director.get(G, sceneId)
    expect(state.brief).toBeNull()
    expect(state.pulse.tension).toBe(2)
    expect(state.pulse.escalatedThreads).toBe(1)

    const a = await director.create(G, sceneId, 99)
    const b = await director.create(G, sceneId, 99)
    expect(a.id).not.toBe(b.id)
    expect({ ...a, id: '', createdAt: 0 }).toEqual({ ...b, id: '', createdAt: 0 })
    expect(a.focus.thread).toBe('Zrada')
    expect((await director.get(G, sceneId)).brief?.id).toBe(b.id)
    await expect(director.create(G, 'scn_neni', 1)).rejects.toBeInstanceOf(NotFoundError)
  })

  it('patch upraví brief; ruční korekce pulsu z nastavení hry se projeví', async () => {
    const patched = await director.patch(G, sceneId, { difficulty: 5, outcome: 'fail', notes: 'dopis' })
    expect(patched.difficulty).toBe(5)
    expect(patched.outcome).toBe('fail')
    expect(patched.difficultyLabel).toBeNull()

    const setup = await storage.getGame(G)
    await storage.saveSetup(G, { ...setup!.setup, rulesSystem: 'dnd5e', pulseOverride: { tension: 8, phase: null } })
    const relabeled = await director.patch(G, sceneId, { difficulty: 3 })
    expect(relabeled.difficultyLabel).toBe('DC 15 (střední)')
    const pulse = await director.pulse(G)
    expect(pulse.tension).toBe(8)
    expect(pulse.phase).toBe('peak')
    expect(pulse.overridden.tension).toBe(true)
  })

  it('návrh AI dostane brief; přijetí zapíše beat do events a brief uvolní', async () => {
    const brief = director.pending(G, sceneId)!
    await director.patch(G, sceneId, { outcome: 'fail', difficulty: 2 })
    const s = await suggestions.generate(G, sceneId)
    expect(s.briefId).toBe(brief.id)
    expect(seenBriefs[seenBriefs.length - 1]?.id).toBe(brief.id)

    await suggestions.accept(G, sceneId, s.id, s.entries)
    expect(director.pending(G, sceneId)).toBeNull()

    const beats = await storage.listEvents(G, { kinds: [BEAT_ACCEPTED_EVENT] })
    expect(beats).toHaveLength(1)
    expect(beats[0].sceneId).toBe(sceneId)
    expect((beats[0].payload as { brief: NarrativeBrief }).brief.outcome).toBe('fail')
    // neúspěch → dluh následků v dalším pulsu
    expect((await director.pulse(G)).consequenceDebt).toBe(1)
    const created = await storage.listEvents(G, { kinds: [BRIEF_CREATED_EVENT], sceneId })
    expect(created.length).toBeGreaterThanOrEqual(2)
    expect(created[0].createdAt).toBeGreaterThanOrEqual(created[1].createdAt)
    expect(await storage.listEvents(G, { kinds: [] })).toEqual([])
  })

  it('bez briefu jde návrh bez režie; clear přeskočí režii', async () => {
    const s = await suggestions.generate(G, sceneId)
    expect(s.briefId).toBeNull()
    expect(seenBriefs[seenBriefs.length - 1]).toBeNull()
    await director.create(G, sceneId)
    director.clear(G, sceneId)
    expect(director.pending(G, sceneId)).toBeNull()
    await expect(director.patch(G, sceneId, { notes: 'x' })).rejects.toBeInstanceOf(NotFoundError)
  })
})
