import type { ProseDoc, ProseNode } from './index'

/**
 * Převod dokumentu prózy (TipTap/ProseMirror JSON) na markdown – export do Obsidianu (BE), textový export hry
 * a kopírování textu scény (FE), kontext pro AI.
 *
 * Jednosměrné: aplikace čte prózu z JSONu v DB, markdown slouží jen k čtení/zálohování ve vaultu.
 * Obrázek se zapíše jako `![alt](cesta)`; rozložení vedle textu nese HTML komentář za ním
 * (`<!-- layout="left" -->`), který Obsidian nezobrazí.
 */

/** `resolveImage` přemapuje `src` obrázku (ImageRef z DB) na cestu ve vaultu; vrací null = obrázek vynechat */
export function proseDocToMarkdown(doc: ProseDoc, resolveImage: (src: string) => string | null = src => src): string {
  const blocks = (doc.content ?? []).map(node => blockToMarkdown(node, resolveImage, 0)).filter(b => b !== null)
  return blocks.join('\n\n').trimEnd() + (blocks.length ? '\n' : '')
}

function blockToMarkdown(node: ProseNode, resolveImage: (src: string) => string | null, depth: number): string | null {
  switch (node.type) {
    case 'paragraph': {
      const text = inlineToMarkdown(node.content ?? [])
      return text
    }
    case 'heading': {
      const level = Math.min(6, Math.max(1, Number(node.attrs?.level ?? 1)))
      return `${'#'.repeat(level)} ${inlineToMarkdown(node.content ?? [])}`
    }
    case 'blockquote':
      return (node.content ?? [])
        .map(child => blockToMarkdown(child, resolveImage, depth))
        .filter(b => b !== null)
        .join('\n\n')
        .split('\n')
        .map(line => `> ${line}`)
        .join('\n')
    case 'bulletList':
    case 'orderedList': {
      const ordered = node.type === 'orderedList'
      const start = Number(node.attrs?.start ?? 1)
      return (node.content ?? [])
        .map((item, i) => {
          const marker = ordered ? `${start + i}. ` : '- '
          const indent = ' '.repeat(marker.length)
          const body = (item.content ?? [])
            .map(child => blockToMarkdown(child, resolveImage, depth + 1))
            .filter(b => b !== null)
            .join('\n\n')
          return marker + body.split('\n').map((line, j) => (j === 0 ? line : indent + line)).join('\n')
        })
        .join('\n')
    }
    case 'codeBlock': {
      const lang = typeof node.attrs?.language === 'string' ? node.attrs.language : ''
      const code = (node.content ?? []).map(n => n.text ?? '').join('')
      return `\`\`\`${lang}\n${code}\n\`\`\``
    }
    case 'horizontalRule':
      return '---'
    case 'table':
      return tableToMarkdown(node, resolveImage)
    case 'image': {
      const src = typeof node.attrs?.src === 'string' ? resolveImage(node.attrs.src) : null
      if (!src) return null
      const alt = typeof node.attrs?.alt === 'string' ? node.attrs.alt.replace(/[[\]]/g, '') : ''
      const layout = node.attrs?.layout
      const suffix = layout === 'left' || layout === 'right' ? ` <!-- layout="${layout}" -->` : ''
      return `![${alt}](${encodeURI(src)})${suffix}`
    }
    default:
      // Neznámý blok – zachovat aspoň text
      return node.content ? inlineToMarkdown(node.content) : (node.text ?? null)
  }
}

/**
 * Tabulka (TipTap `table` → `tableRow` → `tableCell`/`tableHeader`) jako GFM tabulka. První řádek je hlavička
 * (GFM ji vyžaduje – když tabulka hlavičkové buňky nemá, poslouží první řádek). Bloky uvnitř buňky se spojí `<br>`,
 * svislítka v textu se escapují. Sloučené buňky (colspan/rowspan) GFM neumí – vypíšou se jako jedna buňka.
 */
function tableToMarkdown(node: ProseNode, resolveImage: (src: string) => string | null): string | null {
  const rows = (node.content ?? []).filter(r => r.type === 'tableRow')
  if (rows.length === 0) return null
  const cellText = (cell: ProseNode) =>
    (cell.content ?? [])
      .map(child => blockToMarkdown(child, resolveImage, 0))
      .filter((b): b is string => b !== null && b !== '')
      .join('<br>')
      .replace(/\n/g, '<br>')
      .replace(/\|/g, '\\|')
  const matrix = rows.map(r => (r.content ?? []).map(cellText))
  const columns = Math.max(...matrix.map(r => r.length), 1)
  const line = (cells: string[]) => `| ${Array.from({ length: columns }, (_, i) => cells[i] ?? '').join(' | ')} |`
  const [head, ...body] = matrix
  return [line(head), `| ${Array.from({ length: columns }, () => '---').join(' | ')} |`, ...body.map(line)].join('\n')
}

function inlineToMarkdown(nodes: ProseNode[]): string {
  return nodes
    .map(node => {
      if (node.type === 'hardBreak') return '  \n'
      if (node.type === 'text') return applyMarks(node.text ?? '', node.marks ?? [])
      if (node.type === 'image') return blockToMarkdown(node, src => src, 0) ?? ''
      return node.content ? inlineToMarkdown(node.content) : ''
    })
    .join('')
}

function applyMarks(text: string, marks: NonNullable<ProseNode['marks']>): string {
  if (!text) return text
  // Mezery na okrajích nechat mimo značky, jinak markdown značku nerozpozná
  const leading = text.match(/^\s*/)?.[0] ?? ''
  const trailing = text.match(/\s*$/)?.[0] ?? ''
  let core = text.slice(leading.length, text.length - trailing.length)
  if (!core) return text
  for (const mark of marks) {
    switch (mark.type) {
      case 'bold':
        core = `**${core}**`
        break
      case 'italic':
        core = `*${core}*`
        break
      case 'strike':
        core = `~~${core}~~`
        break
      case 'code':
        core = `\`${core}\``
        break
      case 'underline':
        core = `<u>${core}</u>`
        break
      case 'link': {
        const href = typeof mark.attrs?.href === 'string' ? mark.attrs.href : ''
        if (href) core = `[${core}](${href})`
        break
      }
    }
  }
  return leading + core + trailing
}
