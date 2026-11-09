import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { Editor } from '@tiptap/react'

interface TableContextMenuProps {
  editor: Editor
  /** Souřadnice kliknutí (viewport) */
  x: number
  y: number
  onClose: () => void
}

interface Item {
  label: string
  run: () => boolean
  danger?: boolean
}

/** Kontextová nabídka (pravé tlačítko) nad tabulkou v editoru: řádky, sloupce, záhlaví, smazání tabulky */
export default function TableContextMenu({ editor, x, y, onClose }: TableContextMenuProps) {
  const ref = useRef<HTMLDivElement | null>(null)
  const [pos, setPos] = useState({ left: x, top: y })

  // Nabídku držet uvnitř okna
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const rect = el.getBoundingClientRect()
    setPos({
      left: Math.max(4, Math.min(x, window.innerWidth - rect.width - 4)),
      top: Math.max(4, Math.min(y, window.innerHeight - rect.height - 4)),
    })
  }, [x, y])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    const onDown = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) onClose() }
    window.addEventListener('keydown', onKey)
    window.addEventListener('mousedown', onDown)
    window.addEventListener('resize', onClose)
    return () => {
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('mousedown', onDown)
      window.removeEventListener('resize', onClose)
    }
  }, [onClose])

  const chain = () => editor.chain().focus()
  const groups: Item[][] = [
    [
      { label: 'Přidat řádek nad', run: () => chain().addRowBefore().run() },
      { label: 'Přidat řádek pod', run: () => chain().addRowAfter().run() },
      { label: 'Smazat řádek', run: () => chain().deleteRow().run(), danger: true },
    ],
    [
      { label: 'Přidat sloupec vlevo', run: () => chain().addColumnBefore().run() },
      { label: 'Přidat sloupec vpravo', run: () => chain().addColumnAfter().run() },
      { label: 'Smazat sloupec', run: () => chain().deleteColumn().run(), danger: true },
    ],
    [
      { label: 'Přepnout řádek záhlaví', run: () => chain().toggleHeaderRow().run() },
      { label: 'Přepnout sloupec záhlaví', run: () => chain().toggleHeaderColumn().run() },
      { label: 'Sloučit / rozdělit buňky', run: () => chain().mergeOrSplit().run() },
    ],
    [{ label: 'Smazat tabulku', run: () => chain().deleteTable().run(), danger: true }],
  ]

  return (
    <div
      ref={ref}
      style={{ left: pos.left, top: pos.top }}
      className="fixed z-[70] min-w-[200px] py-1 rounded-lg bg-[#1a1a1a] border border-white/15 shadow-2xl text-sm text-[var(--text)]"
      onContextMenu={e => e.preventDefault()}
    >
      {groups.map((items, gi) => (
        <div key={gi} className={gi > 0 ? 'border-t border-white/10 mt-1 pt-1' : ''}>
          {items.map(item => (
            <button
              key={item.label}
              type="button"
              onClick={() => { item.run(); onClose() }}
              className={`w-full text-left px-3 py-1.5 hover:bg-white/10 transition-colors ${item.danger ? 'text-red-300' : ''}`}
            >
              {item.label}
            </button>
          ))}
        </div>
      ))}
    </div>
  )
}
