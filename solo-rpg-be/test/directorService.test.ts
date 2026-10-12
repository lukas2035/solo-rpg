import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { openDatabase, type Database } from '../src/storage/db.js'
import { FsAssetStore } from '../src/storage/AssetStore.js'
import { PostgresProvider } from '../src/storage/PostgresProvider.js'
import { NotFoundError, ValidationError } from '../src/vault/StorageProvider.js'
import { SuggestionService } from '../src/narrative/suggestions.js'
import { BEAT_ACCEPTED_EVENT, BRIEF_CREATED_EVENT, DirectorService, EVENT_ABANDONED_EVENT, EVENT_RESOLVED_EVENT, EVENT_STARTED_EVENT } from '../src/director/directorService.js'
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
  const scene = await storage.createScene(G, { title: 'Noc', ai: true, aiMode: 'advanced', characters: ['Klára Nováková'] })
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

  it('základní režim AI: režie se nevytvoří a rozpracovaný brief se při psaní ignoruje', async () => {
    const basic = await storage.createScene(G, { title: 'Klidná scéna', ai: true, aiMode: 'basic', characters: ['Klára Nováková'] })
    await expect(director.create(G, basic.id, 1)).rejects.toBeInstanceOf(ValidationError)
    expect(await director.pending(G, basic.id)).toBeNull()

    // Brief vznikl v pokročilém režimu; po přepnutí scény na základní ho AI nedostane (zůstává uložený pro případný návrat)
    await storage.updateScene(G, basic.id, { title: basic.title, aiMode: 'advanced' })
    const brief = await director.create(G, basic.id, 1)
    await storage.updateScene(G, basic.id, { title: basic.title, aiMode: 'basic' })
    expect(await director.pending(G, basic.id)).toBeNull()
    expect((await director.get(G, basic.id)).brief?.id).toBe(brief.id)
    seenBriefs.length = 0
    const suggestion = await suggestions.generate(G, basic.id)
    expect(seenBriefs).toEqual([null])
    expect(suggestion.briefId).toBeNull()
    await storage.deleteScene(G, basic.id)
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

  it('návrh AI dostane brief; přijetí zapíše beat do events, brief uvolní a založí událost (hod zadaný rovnou = jednorázový beat)', async () => {
    const brief = (await director.pending(G, sceneId))!
    await director.patch(G, sceneId, { mode: 'event', eventType: 'obstacle', obstacleKind: 'check', beatKind: 'resolution', outcome: 'fail', difficulty: 2 })
    const s = await suggestions.generate(G, sceneId)
    expect(s.briefId).toBe(brief.id)
    expect(seenBriefs[seenBriefs.length - 1]?.id).toBe(brief.id)

    await suggestions.accept(G, sceneId, s.id, s.entries)
    expect(await director.pending(G, sceneId)).toBeNull()
    // rozuzlení s již zadaným výsledkem je jednorázová událost – nic nezůstává aktivní
    expect((await director.get(G, sceneId)).event).toBeNull()

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
    await director.clear(G, sceneId)
    expect(await director.pending(G, sceneId)).toBeNull()
    await expect(director.patch(G, sceneId, { notes: 'x' })).rejects.toBeInstanceOf(NotFoundError)
  })

  it('událost přes několik beatů: před hodem → po hodu → uzavření; stav přežije nový DirectorService', async () => {
    // dluh následků z minulého testu by vnutil consequence – vynulovat přepisem na čistý stav nejde, tak brief upravíme ručně
    await director.create(G, sceneId, 7)
    const first = await director.patch(G, sceneId, { mode: 'event', eventType: 'obstacle', obstacleKind: 'encounter', beatKind: 'escalation', twist: false })
    expect(first.rollPhase).toBe('before')
    expect(first.difficulty).toBeNull()
    let s = await suggestions.generate(G, sceneId)
    await suggestions.accept(G, sceneId, s.id, s.entries)

    // nová instance služby čte stav z DB
    const fresh = new DirectorService(storage)
    const state = await fresh.get(G, sceneId)
    expect(state.event?.status).toBe('active')
    expect(state.event?.obstacleKind).toBe('encounter')
    expect(state.event?.beats).toHaveLength(1)
    expect(state.event?.beats[0].rollPhase).toBe('before')
    const started = await storage.listEvents(G, { kinds: [EVENT_STARTED_EVENT], sceneId })
    expect(started).toHaveLength(1)

    // další brief je beat uvnitř události – po boji, výsledek zadá hráč
    const second = await fresh.create(G, sceneId, 11)
    expect(second.eventId).toBe(state.event!.id)
    expect(second.mode).toBe('event')
    expect(second.obstacleKind).toBe('encounter')
    expect(second.rollPhase).toBe('after')
    expect(second.outcome).toBeNull()
    const withOutcome = await fresh.patch(G, sceneId, { outcome: 'partial', beatKind: 'consequence' })
    expect(withOutcome.rollPhase).toBe('after')
    const sugg = new SuggestionService(storage, { ai: { contextTokens: 1000, transcriptTokens: 1000 } } as unknown as Config, fresh)
    s = await sugg.generate(G, sceneId)
    await sugg.accept(G, sceneId, s.id, s.entries)
    expect((await fresh.get(G, sceneId)).event?.beats).toHaveLength(2)

    // uzavřít událost: brief rozuzlení s celkovým výsledkem
    await expect(fresh.create(G, 'scn_neni', 1, { outcome: 'success' })).rejects.toBeInstanceOf(NotFoundError)
    const closing = await fresh.create(G, sceneId, 13, { outcome: 'success' })
    expect(closing.beatKind).toBe('resolution')
    expect(closing.outcome).toBe('success')
    expect(closing.rollPhase).toBe('none')
    s = await sugg.generate(G, sceneId)
    await sugg.accept(G, sceneId, s.id, s.entries)
    const after = await fresh.get(G, sceneId)
    expect(after.event).toBeNull()
    expect(after.brief).toBeNull()
    expect(await storage.listEvents(G, { kinds: [EVENT_RESOLVED_EVENT], sceneId })).toHaveLength(1)

    // zahození události bez rozuzlení
    await fresh.create(G, sceneId, 21)
    await fresh.patch(G, sceneId, { mode: 'event', eventType: 'opportunity', beatKind: 'escalation', difficulty: null, twist: false })
    s = await sugg.generate(G, sceneId)
    await sugg.accept(G, sceneId, s.id, s.entries)
    expect((await fresh.get(G, sceneId)).event?.eventType).toBe('opportunity')
    const abandoned = await fresh.abandonEvent(G, sceneId)
    expect(abandoned.event).toBeNull()
    expect(await storage.listEvents(G, { kinds: [EVENT_ABANDONED_EVENT], sceneId })).toHaveLength(1)
  })
})
