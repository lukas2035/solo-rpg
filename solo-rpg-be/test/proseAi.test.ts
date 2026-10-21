import { describe, expect, it } from 'vitest'
import { PROSE_BACKGROUND_LIGHT_COLOR, PROSE_FONT_DARK, type ProsePromptEntry } from '@solo-rpg/shared'
import { MAX_PROSE_PROMPTS, addEntry, trimToBudget, trimToBudgetEnd } from '../src/ai/proseAi.js'
import { legacyProsePrompts, parseFields } from '../src/storage/kinds.js'

describe('historie AI prózy', () => {
  it('legacyProsePrompts převede staré řetězce na položky bez odpovědi a hotové položky ponechá', () => {
    const entry = { mode: 'rewrite', prompt: 'Zkrať', response: 'Nový text', createdAt: 123 }
    expect(legacyProsePrompts(['Pokračuj', '  ', entry, 42, { prompt: 'bez režimu' }])).toEqual([
      { mode: 'continue', prompt: 'Pokračuj', response: '', createdAt: 0 },
      entry,
    ])
    expect(legacyProsePrompts(undefined)).toEqual([])
  })

  it('migrace scény v8 → v9 převede prosePrompts', () => {
    const v8 = {
      description: '', ai: false, aiPrompt: '', aiMode: 'basic', rulesInAi: false, aiReview: 'panel', darkBackground: false,
      mode: 'prose', proseTexture: null, proseTextColor: 'light', prosePrompts: ['A', 'B'], summary: '', summaryStale: false, director: null,
    }
    expect(parseFields('scene', v8, 8).prosePrompts).toEqual([
      { mode: 'continue', prompt: 'A', response: '', createdAt: 0 },
      { mode: 'continue', prompt: 'B', response: '', createdAt: 0 },
    ])
  })

  it('migrace scény v9 → v10 převede texturu a barvu písma na pozadí a písmo', () => {
    const v9 = {
      description: '', ai: false, aiPrompt: '', aiMode: 'basic', rulesInAi: false, aiReview: 'panel', darkBackground: false,
      mode: 'prose', proseTexture: 'assets/abc.png', proseTextColor: 'dark', prosePrompts: [], summary: '', summaryStale: false, director: null,
    }
    const fields = parseFields('scene', v9, 9)
    expect(fields.proseBackground).toEqual({ image: 'assets/abc.png', mode: 'repeat', color: PROSE_BACKGROUND_LIGHT_COLOR })
    expect(fields.proseFont).toEqual(PROSE_FONT_DARK)
    expect('proseTexture' in fields).toBe(false)
  })

  it('addEntry přidá na začátek každé odeslání zvlášť a drží limit', () => {
    const mk = (i: number) => ({ mode: 'continue' as const, prompt: `p${i}`, response: `r${i}`, createdAt: i })
    let history = [] as ProsePromptEntry[]
    for (let i = 0; i < MAX_PROSE_PROMPTS + 5; i++) history = addEntry(history, mk(i))
    expect(history).toHaveLength(MAX_PROSE_PROMPTS)
    expect(history[0].prompt).toBe(`p${MAX_PROSE_PROMPTS + 4}`)
    // Stejný pokyn podruhé = nová položka (odpověď se liší)
    const twice = addEntry(addEntry([], { ...mk(1), response: 'x' }), { ...mk(1), response: 'y' })
    expect(twice.map(e => e.response)).toEqual(['y', 'x'])
    expect(addEntry([], { ...mk(1), prompt: '  ' })).toEqual([])
  })

  it('trimToBudget zachová konec, trimToBudgetEnd začátek', () => {
    const text = 'první odstavec\n\ndruhý odstavec\n\ntřetí odstavec'
    expect(trimToBudget(text, 1000)).toEqual({ text, truncated: false })
    expect(trimToBudget(text, 20)).toEqual({ text: 'třetí odstavec', truncated: true })
    expect(trimToBudgetEnd(text, 1000)).toEqual({ text, truncated: false })
    expect(trimToBudgetEnd(text, 20)).toEqual({ text: 'první odstavec', truncated: true })
    expect(trimToBudgetEnd('', 10)).toBeNull()
  })
})
