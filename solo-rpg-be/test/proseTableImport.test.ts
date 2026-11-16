import { describe, expect, it } from 'vitest'
import { importedTablesToNodes, parseImportedTables } from '@solo-rpg/shared'

describe('parseImportedTables', () => {
  it('rozpozná tabulku s tabulátory bez názvu', () => {
    const text = 'd6\tOblast\tZákladní charakter\n1\tArchiv\tDokumenty, záznamy\n2\tKaranténní blok\tIzolace'
    expect(parseImportedTables(text)).toEqual([
      { title: null, rows: [['d6', 'Oblast', 'Základní charakter'], ['1', 'Archiv', 'Dokumenty, záznamy'], ['2', 'Karanténní blok', 'Izolace']] },
    ])
  })

  it('řádek bez tabulátoru před tabulkou je název; víc tabulek odděluje prázdný řádek', () => {
    const text = [
      'Tabulka místností — d6',
      'Hod\tTyp místnosti',
      '1\tStrojovna',
      '',
      '',
      'Monster Manual\tRavenloft',
      'Ghoul\tBoneless',
    ].join('\r\n')
    const tables = parseImportedTables(text)
    expect(tables).toHaveLength(2)
    expect(tables[0]).toEqual({ title: 'Tabulka místností — d6', rows: [['Hod', 'Typ místnosti'], ['1', 'Strojovna']] })
    expect(tables[1]).toEqual({ title: null, rows: [['Monster Manual', 'Ravenloft'], ['Ghoul', 'Boneless']] })
  })

  it('doplní kratší řádky prázdnými buňkami a zvládne markdown tabulku', () => {
    const text = '| Hod | Typ |\n|---|:---:|\n| 1 | Ložnice |\n| 2 |'
    expect(parseImportedTables(text)).toEqual([{ title: null, rows: [['Hod', 'Typ'], ['1', 'Ložnice'], ['2', '']] }])
  })

  it('text bez oddělovačů není tabulka', () => {
    expect(parseImportedTables('jen odstavec\ndalší řádek')).toEqual([])
  })
})

describe('importedTablesToNodes', () => {
  it('vytvoří nadpis a tabulku se záhlavím', () => {
    const nodes = importedTablesToNodes([{ title: 'Místnosti', rows: [['Hod', 'Typ'], ['1', '']] }], 'h2', true)
    expect(nodes).toEqual([
      { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Místnosti' }] },
      {
        type: 'table',
        content: [
          {
            type: 'tableRow',
            content: [
              { type: 'tableHeader', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Hod' }] }] },
              { type: 'tableHeader', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Typ' }] }] },
            ],
          },
          {
            type: 'tableRow',
            content: [
              { type: 'tableCell', content: [{ type: 'paragraph', content: [{ type: 'text', text: '1' }] }] },
              { type: 'tableCell', content: [{ type: 'paragraph', content: undefined }] },
            ],
          },
        ],
      },
    ])
  })

  it('název tučně / normálně je odstavec, bez záhlaví jsou všechny buňky tableCell', () => {
    const bold = importedTablesToNodes([{ title: 'T', rows: [['a']] }], 'bold', false)
    expect(bold[0]).toEqual({ type: 'paragraph', content: [{ type: 'text', text: 'T', marks: [{ type: 'bold' }] }] })
    expect(bold[1].content?.[0].content?.[0].type).toBe('tableCell')
    const normal = importedTablesToNodes([{ title: 'T', rows: [['a']] }], 'normal', false)
    expect(normal[0]).toEqual({ type: 'paragraph', content: [{ type: 'text', text: 'T', marks: undefined }] })
  })
})
