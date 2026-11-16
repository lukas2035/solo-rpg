import type { ProseNode } from './index'

/**
 * Import tabulek z textu vloženého ze schránky (typicky zkopírovaná tabulka z ChatGPT): buňky oddělené tabulátorem,
 * případně markdown s `|`. Víc tabulek lze oddělit prázdným řádkem; řádky bez tabulátoru před tabulkou tvoří její název.
 */

/** Jak vykreslit název tabulky nad ní */
export type ImportedTableTitleStyle = 'h1' | 'h2' | 'h3' | 'bold' | 'normal'

export interface ImportedTable {
  /** Název nad tabulkou (řádky bez buněk před prvním řádkem tabulky), null = bez názvu */
  title: string | null
  /** Buňky po řádcích; všechny řádky mají stejný počet sloupců (kratší doplněné prázdnými buňkami) */
  rows: string[][]
}

/** Rozdělí řádek na buňky; null = řádek není řádek tabulky (žádný oddělovač) */
function splitCells(line: string): string[] | null {
  if (line.includes('\t')) return line.split('\t').map(c => c.trim())
  const trimmed = line.trim()
  if (trimmed.startsWith('|') && trimmed.endsWith('|') && trimmed.length > 1) {
    const cells = trimmed.slice(1, -1).split('|').map(c => c.trim())
    // Oddělovací řádek markdown tabulky (|---|:--:|) se vynechá
    if (cells.every(c => /^:?-{3,}:?$/.test(c))) return []
    return cells
  }
  return null
}

/** Rozpozná tabulky v textu; prázdné pole = žádná tabulka nenalezena */
export function parseImportedTables(text: string): ImportedTable[] {
  const blocks = text.replace(/\r\n?/g, '\n').split(/\n\s*\n/)
  const tables: ImportedTable[] = []
  for (const block of blocks) {
    const lines = block.split('\n').filter(l => l.trim() !== '')
    if (lines.length === 0) continue
    const titleLines: string[] = []
    const rows: string[][] = []
    for (const line of lines) {
      const cells = splitCells(line)
      if (cells === null) {
        // Text bez buněk před tabulkou = název; za tabulkou se ignoruje
        if (rows.length === 0) titleLines.push(line.trim())
        continue
      }
      if (cells.length === 0) continue
      rows.push(cells)
    }
    if (rows.length === 0) continue
    const cols = Math.max(...rows.map(r => r.length))
    tables.push({
      title: titleLines.length ? titleLines.join(' ') : null,
      rows: rows.map(r => [...r, ...Array<string>(cols - r.length).fill('')]),
    })
  }
  return tables
}

function cellNode(type: 'tableHeader' | 'tableCell', text: string): ProseNode {
  return { type, content: [{ type: 'paragraph', content: text ? [{ type: 'text', text }] : undefined }] }
}

function titleNode(title: string, style: ImportedTableTitleStyle): ProseNode {
  if (style === 'h1' || style === 'h2' || style === 'h3') {
    return { type: 'heading', attrs: { level: Number(style[1]) }, content: [{ type: 'text', text: title }] }
  }
  return { type: 'paragraph', content: [{ type: 'text', text: title, marks: style === 'bold' ? [{ type: 'bold' }] : undefined }] }
}

/** Převede rozpoznané tabulky na uzly dokumentu prózy (volitelný název + tabulka pro každou z nich) */
export function importedTablesToNodes(tables: ImportedTable[], titleStyle: ImportedTableTitleStyle, withHeaderRow: boolean): ProseNode[] {
  return tables.flatMap(table => {
    const nodes: ProseNode[] = []
    if (table.title) nodes.push(titleNode(table.title, titleStyle))
    nodes.push({
      type: 'table',
      content: table.rows.map((row, i) => ({
        type: 'tableRow',
        content: row.map(cell => cellNode(withHeaderRow && i === 0 ? 'tableHeader' : 'tableCell', cell)),
      })),
    })
    return nodes
  })
}
