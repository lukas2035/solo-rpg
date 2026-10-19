import { describe, expect, it } from 'vitest'
import type { ProseDoc } from '@solo-rpg/shared'
import { proseDocToMarkdown } from '../src/vault/proseMarkdown.js'

describe('proseDocToMarkdown', () => {
  it('převede nadpisy, značky, seznamy, citaci a obrázky s rozložením', () => {
    const doc: ProseDoc = {
      type: 'doc',
      content: [
        { type: 'heading', attrs: { level: 1 }, content: [{ type: 'text', text: 'Kapitola první' }] },
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: 'Byla ' },
            { type: 'text', text: 'temná ', marks: [{ type: 'bold' }] },
            { type: 'text', text: 'noc', marks: [{ type: 'italic' }] },
            { type: 'text', text: '.' },
          ],
        },
        { type: 'image', attrs: { src: 'assets/abc.png', alt: 'Hrad', layout: 'left' } },
        { type: 'image', attrs: { src: 'assets/full.jpg', layout: 'full' } },
        { type: 'image', attrs: { src: 'assets/missing.png' } },
        { type: 'blockquote', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Citát' }] }] },
        {
          type: 'bulletList',
          content: [
            { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'první' }] }] },
            { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'druhý' }] }] },
          ],
        },
        { type: 'horizontalRule' },
      ],
    }
    const md = proseDocToMarkdown(doc, src => (src.includes('missing') ? null : src.replace('assets/', 'illustrations/')))
    expect(md).toBe(
      [
        '# Kapitola první',
        '',
        'Byla **temná** *noc*.',
        '',
        '![Hrad](illustrations/abc.png) <!-- layout="left" -->',
        '',
        '![](illustrations/full.jpg)',
        '',
        '> Citát',
        '',
        '- první',
        '- druhý',
        '',
        '---',
        '',
      ].join('\n')
    )
  })

  it('prázdný dokument dá prázdný řetězec', () => {
    expect(proseDocToMarkdown({ type: 'doc', content: [{ type: 'paragraph' }] })).toBe('\n')
    expect(proseDocToMarkdown({ type: 'doc' })).toBe('')
  })
})
