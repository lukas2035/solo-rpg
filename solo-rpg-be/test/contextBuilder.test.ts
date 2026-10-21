import { describe, expect, it } from 'vitest'
import { DEFAULT_PROSE_BACKGROUND, PROSE_FONT_LIGHT } from '@solo-rpg/shared'
import type { Faction, GameDetail, LoreEntry, Quest, SceneMeta, StoryLocation, StoryThread } from '@solo-rpg/shared'
import { buildSceneContext, estimateTokens, transcriptCutoff } from '../src/narrative/contextBuilder.js'
import { buildMessages } from '../src/ai/scenePrompt.js'
import { parseSelectedScenes } from '../src/ai/sceneContextScenes.js'

const NOW = Date.parse('2026-10-08T12:00:00Z')
const DAY = 86_400_000

const character = (id: string, name: string, notes = '') => ({ id, name, firstName: name.split(' ')[0], lastName: name.split(' ')[1] ?? '', nickname: name.split(' ')[0], image: null, notes })
const scene = (p: Partial<SceneMeta> & { id: string; title: string; order: number }): SceneMeta => ({
  description: '', image: null, characters: [], location: null, narrator: null, ai: true, aiCharacters: [], aiPrompt: '', aiMode: 'advanced', rulesInAi: false, aiReview: 'panel', darkBackground: false, mode: 'play', proseBackground: DEFAULT_PROSE_BACKGROUND, proseFont: PROSE_FONT_LIGHT, prosePrompts: [], summary: '', summaryStale: false, entryCount: 0, contextScenes: [], createdAt: NOW, updatedAt: NOW, ...p,
})
const thread = (p: Partial<StoryThread> & { id: string; title: string }): StoryThread => ({
  type: 'threat', status: 'active', horizon: 'short-term', certainty: 'confirmed', revealCondition: '', clock: null,
  characters: [], scene: null, factions: [], locations: [], description: '', createdAt: NOW - 30 * DAY, updatedAt: NOW - 30 * DAY, ...p,
})
const quest = (p: Partial<Quest> & { id: string; title: string }): Quest => ({
  type: 'main', status: 'active', objectives: [], questGiver: null, parentQuest: null, rewards: [], characters: [], threads: [], factions: [], locations: [],
  description: '', outcome: '', notes: '', createdAt: NOW - 30 * DAY, updatedAt: NOW - 30 * DAY, ...p,
})
const faction = (p: Partial<Faction> & { id: string; title: string }): Faction => ({
  type: 'political', status: 'active', stance: 'neutral', leader: null, parentFaction: null, goals: [], characters: [], locations: [], relations: [],
  emblem: null, description: '', secrets: '', createdAt: NOW - 30 * DAY, updatedAt: NOW - 30 * DAY, ...p,
})
const location = (p: Partial<StoryLocation> & { id: string; title: string }): StoryLocation => ({
  type: 'city', status: 'visited', parentLocation: null, image: null, description: '', secrets: '', createdAt: NOW - 30 * DAY, updatedAt: NOW - 30 * DAY, ...p,
})
const lore = (p: Partial<LoreEntry> & { id: string; title: string }): LoreEntry => ({
  type: 'history', truth: 'confirmed', knowledge: 'known', characters: [], locations: [], factions: [], quests: [], threads: [], content: '', secrets: '',
  createdAt: NOW - 30 * DAY, updatedAt: NOW - 30 * DAY, ...p,
})

/** Malá kampaň: Klára a Julia jsou ve scéně v Praze; Marek není. */
function campaign(): GameDetail {
  const narrator = { id: 'nar_1', name: 'Vypravěč', description: '', aiPrompt: '', image: null }
  return {
    meta: { name: 'Test', createdAt: NOW, updatedAt: NOW },
    setup: {
      characters: [character('chr_klara', 'Klára Nováková'), character('chr_julia', 'Julia Kreuzová'), character('chr_marek', 'Marek Horák', 'Starý přítel Kláry.')],
      narrators: [narrator],
      backgroundImage: null, rules: '', rulesSystem: 'none', pulseOverride: { tension: null, phase: null }, proseFonts: [],
    },
    scenes: [
      scene({ id: 'scn_1', title: 'Úvod', order: 1, summary: 'Klára přijela do Prahy.' }),
      scene({ id: 'scn_2', title: 'Kavárna', order: 2, summary: 'Setkání s Julií.' }),
      scene({ id: 'scn_3', title: 'Noc', order: 3, characters: ['Klára Nováková', 'Julia Kreuzová'], location: 'Praha' }),
      scene({ id: 'scn_4', title: 'Později', order: 4, summary: 'Budoucnost – nesmí být v kontextu.' }),
    ],
    threads: [
      thread({ id: 'thr_zrada', title: 'Zrada v cechu', characters: ['Julia Kreuzová'], status: 'escalated', certainty: 'unresolved', revealCondition: 'až Klára najde dopis' }),
      thread({ id: 'thr_stara', title: 'Stará nit', characters: ['Klára Nováková'], status: 'resolved' }),
      thread({ id: 'thr_scena', title: 'Nit ze scény', scene: 'Noc' }),
      thread({ id: 'thr_cizi', title: 'Nesouvisející nit', characters: ['Marek Horák'] }),
    ],
    quests: [quest({ id: 'qst_dopis', title: 'Najít dopis', characters: ['Klára Nováková'], objectives: [{ id: 'o1', title: 'Prohledat kavárnu', status: 'active', optional: false }] })],
    factions: [faction({ id: 'fac_cech', title: 'Cech', characters: ['Julia Kreuzová'], secrets: 'Cech vede upír.' })],
    locations: [location({ id: 'loc_praha', title: 'Praha', description: 'Hlavní město.' }), location({ id: 'loc_brno', title: 'Brno' })],
    lore: [lore({ id: 'lor_cech', title: 'Historie cechu', factions: ['Cech'] })],
  }
}

describe('buildSceneContext', () => {
  const detail = campaign()
  const current = detail.scenes[2]

  it('vybere entity napojené na postavy a lokaci scény, do hloubky 2, s id i jménem', () => {
    const ctx = buildSceneContext(detail, current, { budgetTokens: 10_000, now: NOW })
    const text = ctx.sections.join('\n')
    expect(text).toContain('**Zrada v cechu** (id: thr_zrada)')
    expect(text).toContain('**Najít dopis** (id: qst_dopis)')
    expect(text).toContain('[~] Prohledat kavárnu')
    expect(text).toContain('**Cech** (id: fac_cech)')
    expect(text).toContain('**Praha** (id: loc_praha)')
    // lore je ve vzdálenosti 2 (Julia → Cech → Historie cechu)
    expect(text).toContain('**Historie cechu** (id: lor_cech)')
    // Marek ani jeho nit nemají vazbu na scénu; Brno také ne
    expect(text).not.toContain('Nesouvisející nit')
    expect(text).not.toContain('Marek Horák')
    expect(text).not.toContain('loc_brno')
    expect(ctx.dropped).toBe(0)
  })

  it('nit vzniklá ve scéně je v kontextu i bez vazby na postavy', () => {
    const ctx = buildSceneContext(detail, current, { budgetTokens: 10_000, now: NOW })
    expect(ctx.sections.join('\n')).toContain('**Nit ze scény** (id: thr_scena)')
  })

  it('tajemství jdou do oddělené sekce, veřejný popis zůstává ve své', () => {
    const ctx = buildSceneContext(detail, current, { budgetTokens: 10_000, now: NOW })
    const secret = ctx.sections.find(s => s.startsWith('## Tajemství'))!
    expect(secret).toContain('Cech vede upír.')
    expect(secret).toContain('odhalí se, až: až Klára najde dopis')
    const factions = ctx.sections.find(s => s.startsWith('## Frakce'))!
    expect(factions).not.toContain('upír')
  })

  it('shrnutí předchozích scén chronologicky, budoucí scény ne', () => {
    const ctx = buildSceneContext(detail, current, { budgetTokens: 10_000, now: NOW })
    const summary = ctx.sections[0]
    expect(summary.startsWith('## Co se stalo v předchozích scénách')).toBe(true)
    expect(summary.indexOf('Úvod')).toBeLessThan(summary.indexOf('Kavárna'))
    expect(summary).not.toContain('Budoucnost')
  })

  it('s vlastním výběrem contextScenes posílá jen vybrané scény (i pozdější), ostatní ne', () => {
    const ctx = buildSceneContext(detail, { ...current, contextScenes: ['Úvod', 'Později', 'Neexistující'] }, { budgetTokens: 10_000, now: NOW })
    const summary = ctx.sections[0]
    expect(summary).toContain('Klára přijela do Prahy.')
    expect(summary).toContain('Budoucnost')
    expect(summary).not.toContain('Setkání s Julií')
    expect(ctx.included.filter(i => i.startsWith('Shrnutí:'))).toHaveLength(2)
  })

  it('řadí podle skóre: eskalovaná otevřená nit před vyřešenou', () => {
    const ctx = buildSceneContext(detail, current, { budgetTokens: 10_000, now: NOW })
    const threads = ctx.sections.find(s => s.startsWith('## Dějové nitě'))!
    expect(threads.indexOf('Zrada v cechu')).toBeLessThan(threads.indexOf('Stará nit'))
  })

  it('dodrží rozpočet: s malým rozpočtem vynechá méně relevantní položky', () => {
    const small = buildSceneContext(detail, current, { budgetTokens: 120, now: NOW })
    expect(small.tokensUsed).toBeLessThanOrEqual(120)
    expect(small.dropped).toBeGreaterThan(0)
    expect(small.included.length).toBeLessThan(buildSceneContext(detail, current, { budgetTokens: 10_000, now: NOW }).included.length)
    const zero = buildSceneContext(detail, current, { budgetTokens: 0, now: NOW })
    expect(zero.sections).toEqual([])
  })

  it('included je čitelný seznam pro FE', () => {
    const ctx = buildSceneContext(detail, current, { budgetTokens: 10_000, now: NOW })
    expect(ctx.included).toContain('Nit: Zrada v cechu (thr_zrada)')
    expect(ctx.included).toContain('Shrnutí: Úvod (scn_1)')
  })

  it('scéna bez postav a lokace dá jen shrnutí', () => {
    const ctx = buildSceneContext(detail, scene({ id: 'scn_x', title: 'Prázdná', order: 3 }), { budgetTokens: 10_000, now: NOW })
    expect(ctx.sections).toHaveLength(1)
    expect(ctx.sections[0]).toContain('Co se stalo')
  })
})

describe('parseSelectedScenes', () => {
  const c = [
    { id: 'scn_a', title: 'Úvod', order: 1 },
    { id: 'scn_b', title: 'Kavárna', order: 2 },
    { id: 'scn_c', title: 'Noc', order: 3 },
  ]
  it('vybere podle id v libovolném formátu, výsledek chronologicky bez duplicit', () => {
    expect(parseSelectedScenes('scn_c\n- scn_a (relevantní)\nscn_c', c)).toEqual(['Úvod', 'Noc'])
  })
  it('bez id zkusí přesné názvy na řádcích', () => {
    expect(parseSelectedScenes('1. **Kavárna**\n2. noc\n3. Něco jiného', c)).toEqual(['Kavárna', 'Noc'])
    expect(parseSelectedScenes('Nic relevantního.', c)).toEqual([])
  })
})

describe('transcriptCutoff', () => {
  it('zachová nejnovější záznamy v rozpočtu', () => {
    const texts = ['a'.repeat(350), 'b'.repeat(350), 'c'.repeat(350)] // ~100 tokenů každý (+2)
    expect(transcriptCutoff(texts, 10_000)).toBe(0)
    expect(transcriptCutoff(texts, 210)).toBe(1)
    expect(transcriptCutoff(texts, 100)).toBe(3)
    expect(estimateTokens('abcdefg')).toBe(2)
  })
})

describe('buildMessages s kontextem', () => {
  const detail = campaign()
  const narrator = detail.setup.narrators[0]
  const base = {
    defaultPrompt: 'SYSTEM',
    narrator,
    scene: detail.scenes[2],
    playerCharacters: [detail.setup.characters[0]],
    aiCharacters: [detail.setup.characters[1]],
    entries: [
      { id: '1', characterName: 'Klára Nováková', text: 'Ahoj.', timestamp: 1 },
      { id: '2', characterName: null, narratorName: narrator.name, text: 'Ticho.', timestamp: 2 },
    ],
  }

  it('vloží sekce kontextu mezi scénu a přepis a důvody odmítnutí před úkol', () => {
    const [, user] = buildMessages({ ...base, contextSections: ['## Questy\n- X'], rejectedReasons: ['Julia není Klářina kamarádka', '  '] })
    const c = user.content
    expect(c.indexOf('## Scéna: Noc')).toBeLessThan(c.indexOf('## Questy'))
    expect(c.indexOf('## Questy')).toBeLessThan(c.indexOf('## Dosavadní průběh scény'))
    expect(c.indexOf('## Odmítnuté předchozí návrhy')).toBeLessThan(c.indexOf('## Úkol'))
    expect(c).toContain('- Julia není Klářina kamarádka')
    const reasons = c.slice(c.indexOf('## Odmítnuté'), c.indexOf('## Úkol'))
    expect(reasons.match(/^- /gm)).toHaveLength(1) // prázdný důvod odfiltrován
  })

  it('bez kontextu a důvodů jsou sekce vynechané', () => {
    const [, user] = buildMessages(base)
    expect(user.content).not.toContain('## Odmítnuté')
    expect(user.content).not.toContain('vynecháno')
  })

  it('ořízne přepis na rozpočet a napíše, kolik záznamů vynechal', () => {
    const [, user] = buildMessages({ ...base, transcriptBudgetTokens: 5 })
    expect(user.content).toContain('(starších 1 záznamů vynecháno')
    expect(user.content).not.toContain('Ahoj.')
    expect(user.content).toContain('Ticho.')
  })
})
