import { describe, expect, it } from 'vitest'
import type { StoryEntry } from '@solo-rpg/shared'
import { parseEntries, serializeEntries } from '../src/vault/sceneMarkdown.js'

const known = { characters: ['Julia Kreuzová', 'Julia'], narrators: ['Kronikář'] }

describe('sceneMarkdown – prompt pro AI a značky AI', () => {
  it('round-trip zachová kind=prompt, ai a promptId', () => {
    const entries: StoryEntry[] = [
      { id: '1', characterName: 'Julia Kreuzová', text: 'Ahoj.', timestamp: 1 },
      { id: '2', characterName: null, narratorName: null, text: 'Nech vejít **cizince**.\n\n- nepopisuj ho\n- jen náznak', timestamp: 2, kind: 'prompt', markdown: true },
      { id: '3', characterName: null, narratorName: 'Kronikář', text: 'Dveře se otevřou.', timestamp: 3, ai: true, promptId: '2' },
      { id: '4', characterName: null, narratorName: 'Kronikář', text: 'Bez promptu.', timestamp: 4, ai: true },
    ]
    const md = serializeEntries(entries, new Map([['Julia Kreuzová', 'Julia']]))
    expect(md).toContain('<!-- entry id="2" ts="2" kind="prompt" -->\n**Prompt AI**:\nNech vejít **cizince**.')
    expect(md).toContain('<!-- entry id="3" ts="3" ai="1" prompt="2" -->')
    expect(md).toContain('<!-- entry id="4" ts="4" ai="1" -->')

    const parsed = parseEntries(md, known)
    expect(parsed).toHaveLength(4)
    expect(parsed[0]).toMatchObject({ id: '1', characterName: 'Julia Kreuzová', ai: undefined, promptId: undefined })
    expect(parsed[1]).toMatchObject({ id: '2', kind: 'prompt', characterName: null, narratorName: null, markdown: true })
    // Tučná hlavička uvnitř promptu záznam nerozdělí
    expect(parsed[1].text).toBe('Nech vejít **cizince**.\n\n- nepopisuj ho\n- jen náznak')
    expect(parsed[2]).toMatchObject({ id: '3', narratorName: 'Kronikář', ai: true, promptId: '2' })
    expect(parsed[3]).toMatchObject({ id: '4', ai: true })
    expect(parsed[3].promptId).toBeUndefined()
  })

  it('prompt se známým mluvčím v textu se nerozdělí na více záznamů', () => {
    const md = serializeEntries([{ id: 'p', characterName: null, narratorName: null, text: '**Kronikář**: ať řekne něco temného', timestamp: 1, kind: 'prompt' }])
    const parsed = parseEntries(md, known)
    expect(parsed).toHaveLength(1)
    expect(parsed[0]).toMatchObject({ kind: 'prompt', text: '**Kronikář**: ať řekne něco temného' })
  })
})
