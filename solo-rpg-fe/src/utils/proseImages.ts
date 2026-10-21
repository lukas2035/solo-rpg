/** Řádek markdownu, který je jen obrázek `![alt](src)` */
const IMAGE_LINE = /^!\[[^\]]*\]\(([^)\s]+)[^)]*\)$/

/** Všechny `![…](src)` v markdownu (odkazy na obrázky, bez duplicit, v pořadí výskytu) */
export function imageSrcs(markdown: string): string[] {
  const out: string[] = []
  for (const m of markdown.matchAll(/!\[[^\]]*\]\(([^)\s]+)[^)]*\)/g)) {
    if (!out.includes(m[1])) out.push(m[1])
  }
  return out
}

const words = (text: string) => new Set(text.toLowerCase().match(/\p{L}{3,}/gu) ?? [])

/** Podobnost dvou bloků textu (Jaccard přes slova od 3 písmen) */
function similarity(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0
  let common = 0
  for (const w of a) if (b.has(w)) common++
  return common / (a.size + b.size - common)
}

/**
 * Pojistka pro úpravu textu AI: obrázky, které byly v původním úseku, ale model je ve výsledku vynechal,
 * vrátí zpět. Každý chybějící obrázek se vloží za ten blok výsledku, který je nejpodobnější bloku stojícímu
 * před obrázkem v originálu (obrázek na začátku úseku jde na začátek). Bloky = části oddělené prázdným řádkem.
 */
export function restoreMissingImages(original: string, result: string): { text: string; restored: number } {
  const present = new Set(imageSrcs(result))
  const originalBlocks = original.split(/\n\s*\n/)
  const resultBlocks = result.split(/\n\s*\n/)
  const resultWords = resultBlocks.map(words)
  // Pro každý vložený blok výsledku si pamatujeme, kolik obrázků už za něj přibylo, aby zůstalo jejich pořadí
  const inserted = new Map<number, string[]>()
  let restored = 0

  originalBlocks.forEach((block, i) => {
    const m = block.trim().match(IMAGE_LINE)
    if (!m || present.has(m[1])) return
    present.add(m[1])
    restored++
    // Nejbližší textový blok před obrázkem v originálu
    let anchor = -1
    for (let j = i - 1; j >= 0; j--) {
      if (!IMAGE_LINE.test(originalBlocks[j].trim()) && originalBlocks[j].trim()) { anchor = j; break }
    }
    let target = -1
    if (anchor >= 0) {
      const anchorWords = words(originalBlocks[anchor])
      let best = 0
      resultWords.forEach((w, k) => {
        const s = similarity(anchorWords, w)
        if (s > best) { best = s; target = k }
      })
      // Bez rozumné shody obrázek zařadíme poměrně podle pozice v originálu
      if (best < 0.1) target = Math.min(resultBlocks.length - 1, Math.round((anchor / Math.max(1, originalBlocks.length - 1)) * (resultBlocks.length - 1)))
    }
    const list = inserted.get(target) ?? []
    list.push(block.trim())
    inserted.set(target, list)
  })

  if (restored === 0) return { text: result, restored: 0 }

  const out: string[] = [...(inserted.get(-1) ?? [])]
  resultBlocks.forEach((block, k) => {
    out.push(block)
    out.push(...(inserted.get(k) ?? []))
  })
  return { text: out.join('\n\n'), restored }
}
