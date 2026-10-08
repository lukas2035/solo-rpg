import { describe, expect, it } from 'vitest'
import type { GameDetail, Quest, SceneMeta, StoryThread } from '@solo-rpg/shared'
import { applyBriefPatch, buildBrief } from '../src/director/briefBuilder.js'
import { buildBriefSection } from '../src/director/briefPrompt.js'
import { beatFromPayload, computePulse, phaseFromTension, type BeatRecord } from '../src/director/pulse.js'
import { createRng, weightedPick } from '../src/director/rng.js'
import { difficultyLabel } from '../src/director/rulesAdapter.js'
import { loadDirectorTables, tensionBand } from '../src/director/tables.js'

const NOW = Date.parse('2026-10-08T12:00:00Z')
const NO_OVERRIDE = { tension: null, phase: null }

const character = (id: string, name: string) => ({ id, name, firstName: name.split(' ')[0], lastName: name.split(' ')[1] ?? '', nickname: name.split(' ')[0], image: null, notes: '' })
const scene = (p: Partial<SceneMeta> & { id: string; title: string; order: number }): SceneMeta => ({
  description: '', image: null, characters: [], location: null, ai: true, aiCharacters: [], aiPrompt: '', summary: '', summaryStale: false, entryCount: 0, contextScenes: [], createdAt: NOW, updatedAt: NOW, ...p,
})
const thread = (p: Partial<StoryThread> & { id: string; title: string }): StoryThread => ({
  type: 'threat', status: 'active', horizon: 'short-term', certainty: 'confirmed', revealCondition: '', clock: null,
  characters: [], scene: null, factions: [], locations: [], description: '', createdAt: NOW, updatedAt: NOW, ...p,
})
const quest = (p: Partial<Quest> & { id: string; title: string }): Quest => ({
  type: 'main', status: 'active', objectives: [], questGiver: null, parentQuest: null, rewards: [], characters: [], threads: [], factions: [], locations: [],
  description: '', outcome: '', notes: '', createdAt: NOW, updatedAt: NOW, ...p,
})
const beat = (p: Partial<BeatRecord>): BeatRecord => ({ beatKind: 'escalation', eventType: 'neutral', outcome: null, twist: false, createdAt: NOW, ...p })

function campaign(p: Partial<GameDetail> = {}): GameDetail {
  return {
    meta: { name: 'Test', createdAt: NOW, updatedAt: NOW },
    setup: {
      characters: [character('chr_klara', 'Klára Nováková'), character('chr_julia', 'Julia Kreuzová')],
      narrators: [], backgroundImage: null, brightBackground: true, narrator: null, rules: '', rulesInAi: false, rulesSystem: 'dnd5e', pulseOverride: NO_OVERRIDE,
    },
    scenes: [scene({ id: 'scn_1', title: 'Noc', order: 1, characters: ['Klára Nováková'], location: 'Praha' })],
    threads: [
      thread({ id: 'thr_zrada', title: 'Zrada v cechu', status: 'escalated', characters: ['Klára Nováková'], factions: ['Cech'], clock: { current: 3, max: 4 } }),
      thread({ id: 'thr_cizi', title: 'Nesouvisející', status: 'active', characters: ['Julia Kreuzová'] }),
      thread({ id: 'thr_hotovo', title: 'Hotová', status: 'resolved', characters: ['Klára Nováková'] }),
    ],
    quests: [quest({ id: 'qst_dopis', title: 'Najít dopis', characters: ['Klára Nováková'] }), quest({ id: 'qst_done', title: 'Hotový', status: 'completed' })],
    factions: [], locations: [], lore: [],
    ...p,
  }
}

describe('rng', () => {
  it('stejný seed = stejná posloupnost; vážený los respektuje nulové váhy', () => {
    const a = createRng(42)
    const b = createRng(42)
    expect([a.next(), a.next(), a.next()]).toEqual([b.next(), b.next(), b.next()])
    const rng = createRng(7)
    for (let i = 0; i < 200; i++) expect(weightedPick(rng, { x: 0, y: 1, z: 0 })).toBe('y')
  })
})

describe('tabulky a adapter', () => {
  it('tabulky se načtou a projdou validací, pásma napětí sedí', () => {
    const t = loadDirectorTables()
    expect(t.mode.calm.continue).toBeGreaterThan(0)
    expect(tensionBand(0)).toBe('low')
    expect(tensionBand(4)).toBe('mid')
    expect(tensionBand(7)).toBe('high')
  })

  it('překlad obtížnosti podle systému', () => {
    expect(difficultyLabel('dnd5e', 3)).toBe('DC 15 (střední)')
    expect(difficultyLabel('vtm5e', 1)).toBe('Difficulty 2')
    expect(difficultyLabel('fate', 5)).toBe('+5 (Superb)')
    expect(difficultyLabel('none', 3)).toBeNull()
    expect(difficultyLabel('dnd5e', null)).toBeNull()
  })
})

describe('computePulse', () => {
  it('napětí z eskalované nitě, hodin a aktivních nití; otevřené počty', () => {
    const pulse = computePulse(campaign(), [], NO_OVERRIDE)
    // eskalovaná (+2) + aktivní (+1) + hodiny 75 % (+1)
    expect(pulse.tension).toBe(4)
    expect(pulse.phase).toBe('rising')
    expect(pulse.openThreads).toBe(2)
    expect(pulse.escalatedThreads).toBe(1)
    expect(pulse.openQuests).toBe(1)
    expect(pulse.consequenceDebt).toBe(0)
    expect(pulse.signals.join(' ')).toContain('eskalovaná')
  })

  it('prázdná kampaň = klid', () => {
    const pulse = computePulse(campaign({ threads: [], quests: [] }), [], NO_OVERRIDE)
    expect(pulse.tension).toBe(0)
    expect(pulse.phase).toBe('calm')
  })

  it('dluh následků: neúspěch přidá, consequence beat umoří; beaty od zvratu', () => {
    const beats = [
      beat({ beatKind: 'escalation', outcome: 'fail' }), // nejnovější
      beat({ beatKind: 'consequence' }),
      beat({ beatKind: 'escalation', outcome: 'fail' }),
      beat({ beatKind: 'reveal', twist: true }),
      beat({ beatKind: 'escalation', outcome: 'fail' }),
    ]
    const pulse = computePulse(campaign({ threads: [], quests: [] }), beats, NO_OVERRIDE)
    // chronologicky: fail(1) → twist → fail(2) → consequence(1) → fail(2)
    expect(pulse.consequenceDebt).toBe(2)
    expect(pulse.beatsSinceTwist).toBe(3)
  })

  it('ruční přepis napětí a fáze má přednost a je označený', () => {
    const pulse = computePulse(campaign(), [], { tension: 9, phase: 'aftermath' })
    expect(pulse.tension).toBe(9)
    expect(pulse.phase).toBe('aftermath')
    expect(pulse.overridden).toEqual({ tension: true, phase: true })
  })

  it('fáze: aftermath po rozuzlení / odměně, jinak podle napětí', () => {
    expect(phaseFromTension(8, null)).toBe('peak')
    expect(phaseFromTension(8, beat({ beatKind: 'resolution' }))).toBe('aftermath')
    expect(phaseFromTension(2, beat({ eventType: 'reward' }))).toBe('aftermath')
  })

  it('beatFromPayload čte payload události s vnořeným briefem i plochý', () => {
    expect(beatFromPayload({ brief: { beatKind: 'reveal', eventType: 'obstacle', outcome: 'fail', twist: true } }, NOW)).toEqual({ beatKind: 'reveal', eventType: 'obstacle', outcome: 'fail', twist: true, createdAt: NOW })
    expect(beatFromPayload({ beatKind: 'escalation' }, NOW)?.eventType).toBeNull()
    expect(beatFromPayload({ nic: 1 }, NOW)).toBeNull()
    expect(beatFromPayload(null, NOW)).toBeNull()
  })
})

describe('buildBrief', () => {
  const detail = campaign()
  const current = detail.scenes[0]
  const pulse = computePulse(detail, [], NO_OVERRIDE)

  it('je deterministický podle seedu a vybírá entity podle vazeb na scénu', () => {
    const a = buildBrief({ detail, scene: current, pulse, seed: 123, rulesSystem: 'dnd5e', now: NOW })
    const b = buildBrief({ detail, scene: current, pulse, seed: 123, rulesSystem: 'dnd5e', now: NOW })
    expect({ ...a, id: '' }).toEqual({ ...b, id: '' })
    expect(a.focus.characters).toEqual(['Klára Nováková'])
    expect(a.focus.location).toBe('Praha')
    expect(a.focus.quest).toBe('Najít dopis')
    expect(a.focus.thread).not.toBe('Hotová')
    if (a.mode === 'continue') expect(a.eventType).toBeNull()
    else expect(a.eventType).not.toBeNull()
    if (a.difficulty !== null) expect(a.difficultyLabel).toMatch(/^DC/)
    else expect(a.difficultyLabel).toBeNull()
  })

  it('různé seedy dávají různé briefy (tabulky mají rozptyl)', () => {
    const modes = new Set<string>()
    for (let seed = 1; seed <= 40; seed++) {
      const b = buildBrief({ detail, scene: current, pulse, seed, rulesSystem: 'none', now: NOW })
      modes.add(`${b.mode}/${b.beatKind}/${b.stakes}`)
    }
    expect(modes.size).toBeGreaterThan(3)
  })

  it('dluh následků vynutí beat consequence jako událost bez odměny a bez zvratu', () => {
    const debtPulse = { ...pulse, consequenceDebt: 2, beatsSinceTwist: 30 }
    for (let seed = 1; seed <= 30; seed++) {
      const b = buildBrief({ detail, scene: current, pulse: debtPulse, seed, rulesSystem: 'none', now: NOW })
      expect(b.mode).toBe('event')
      expect(b.beatKind).toBe('consequence')
      expect(b.eventType).not.toBe('reward')
      expect(b.twist).toBe(false)
    }
  })

  it('bez otevřených nití a questů je focus prázdný, ale brief vznikne', () => {
    const empty = campaign({ threads: [], quests: [] })
    const b = buildBrief({ detail: empty, scene: empty.scenes[0], pulse: computePulse(empty, [], NO_OVERRIDE), seed: 5, rulesSystem: 'none', now: NOW })
    expect(b.focus.thread).toBeNull()
    expect(b.focus.quest).toBeNull()
    expect(b.focus.faction).toBeNull()
  })

  it('applyBriefPatch drží konzistenci a přepočítá popisek obtížnosti', () => {
    const b = buildBrief({ detail, scene: current, pulse, seed: 123, rulesSystem: 'dnd5e', now: NOW })
    const p1 = applyBriefPatch(b, { mode: 'continue', difficulty: 4, outcome: 'fail', notes: ' dopis ' }, 'vtm5e')
    expect(p1.eventType).toBeNull()
    expect(p1.difficulty).toBe(4)
    expect(p1.difficultyLabel).toBe('Difficulty 5')
    expect(p1.outcome).toBe('fail')
    expect(p1.notes).toBe(' dopis ')
    const p2 = applyBriefPatch(p1, { mode: 'event', difficulty: null, twist: true }, 'none')
    expect(p2.eventType).toBe('neutral')
    expect(p2.outcome).toBeNull()
    expect(p2.difficultyLabel).toBeNull()
    expect(p2.beatKind).toBe('reveal')
    const p3 = applyBriefPatch(p2, { focus: { thread: 'Nesouvisející' } }, 'none')
    expect(p3.focus.thread).toBe('Nesouvisející')
    expect(p3.focus.characters).toEqual(['Klára Nováková'])
  })
})

describe('buildBriefSection', () => {
  const detail = campaign()
  const pulse = computePulse(detail, [], NO_OVERRIDE)
  const base = buildBrief({ detail, scene: detail.scenes[0], pulse, seed: 1, rulesSystem: 'dnd5e', now: NOW })

  it('událost s hodem bez výsledku: zastavit před hodem, id entit', () => {
    const b = applyBriefPatch(base, { mode: 'event', eventType: 'obstacle', beatKind: 'escalation', difficulty: 3, outcome: null, focus: { thread: 'Zrada v cechu' } }, 'dnd5e')
    const text = buildBriefSection(b, detail)
    expect(text).toContain('## Režie')
    expect(text).toContain('NOVÁ UDÁLOST – PŘEKÁŽKA')
    expect(text).toContain('obtížnost 3/5 = DC 15 (střední)')
    expect(text).toContain('ZASTAV SE')
    expect(text).toContain('Klára Nováková (id: chr_klara)')
    expect(text).toContain('Zrada v cechu (id: thr_zrada)')
  })

  it('s výsledkem hodu a poznámkou hráče; pokračování bez hodu', () => {
    const b = applyBriefPatch(base, { mode: 'event', difficulty: 2, outcome: 'partial', notes: 'ať se objeví dopis', twist: true }, 'dnd5e')
    const text = buildBriefSection(b, detail)
    expect(text).toContain('ČÁSTEČNÝ ÚSPĚCH')
    expect(text).toContain('Výsledek NEMĚŇ')
    expect(text).toContain('ZVRAT')
    expect(text).toContain('Pokyn hráče: ať se objeví dopis')
    const c = applyBriefPatch(base, { mode: 'continue', difficulty: null, twist: false, beatKind: 'escalation' }, 'none')
    const t2 = buildBriefSection(c, detail)
    expect(t2).toContain('POKRAČOVÁNÍ')
    expect(t2).toContain('nevyžaduje hod')
  })
})
