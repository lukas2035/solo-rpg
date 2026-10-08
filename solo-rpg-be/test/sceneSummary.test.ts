import { describe, expect, it } from 'vitest'
import type { Quest } from '@solo-rpg/shared'
import { formatExistingQuests, parseSummaryReply } from '../src/ai/sceneSummary.js'

const quest = (title: string, description = ''): Quest => ({
  id: title, title, type: 'side', status: 'active', objectives: [], questGiver: null, parentQuest: null, rewards: [],
  characters: [], threads: [], factions: [], locations: [], description, outcome: '', notes: '', createdAt: 0, updatedAt: 0,
})

describe('parseSummaryReply', () => {
  it('oddělí shrnutí a JSON blok s questy, duplicitní názvy vyhodí', () => {
    const raw = [
      'Klára našla dopis.',
      '',
      '**Klíčové body**',
      '- dopis',
      '',
      '```json',
      '{"quests": [{"title": "Najít autora dopisu", "description": "Kdo dopis napsal?"}, {"title": "pomsta za otce", "description": "dup"}, {"title": "Najít autora dopisu", "description": "dup 2"}]}',
      '```',
    ].join('\n')
    const { summary, quests } = parseSummaryReply(raw, [quest('Pomsta za otce')])
    expect(summary).toBe('Klára našla dopis.\n\n**Klíčové body**\n- dopis')
    expect(quests).toEqual([{ title: 'Najít autora dopisu', description: 'Kdo dopis napsal?' }])
  })

  it('prázdný seznam i blok bez značky json', () => {
    expect(parseSummaryReply('Shrnutí.\n\n```\n{"quests": []}\n```', [])).toEqual({ summary: 'Shrnutí.', quests: [] })
  })

  it('bez bloku nebo s rozbitým JSON vrátí shrnutí a žádné questy', () => {
    expect(parseSummaryReply('Jen text bez bloku.', [])).toEqual({ summary: 'Jen text bez bloku.', quests: [] })
    expect(parseSummaryReply('Text.\n```json\n{"quests": [}\n```', [])).toEqual({ summary: 'Text.', quests: [] })
  })

  it('formatExistingQuests vypíše název, stav a první řádek popisu', () => {
    expect(formatExistingQuests([])).toContain('(zatím žádné)')
    const text = formatExistingQuests([quest('Pomsta', '\nNajít vraha.\nDruhý řádek.')])
    expect(text).toContain('- Pomsta [active] – Najít vraha.')
    expect(text).not.toContain('Druhý řádek')
  })
})
