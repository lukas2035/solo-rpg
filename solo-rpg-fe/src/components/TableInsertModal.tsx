import { useEffect, useState } from 'react'

interface TableInsertModalProps {
  onInsert: (rows: number, cols: number, withHeaderRow: boolean) => void
  onClose: () => void
}

const MAX = 30

/** Dialog před vložením tabulky do editoru prózy / poznámek: výchozí počet řádků a sloupců, záhlaví */
export default function TableInsertModal({ onInsert, onClose }: TableInsertModalProps) {
  const [rows, setRows] = useState(3)
  const [cols, setCols] = useState(3)
  const [header, setHeader] = useState(true)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const clamp = (n: number) => Math.min(MAX, Math.max(1, Math.trunc(n) || 1))

  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    onInsert(clamp(rows), clamp(cols), header)
    onClose()
  }

  const field = 'w-20 px-2 py-1 rounded-md bg-black/60 border border-[var(--accent)]/40 text-[var(--text)] focus:border-[var(--accent)] outline-none'

  return (
    <div className="fixed inset-0 z-[60] bg-black/70 flex items-center justify-center p-4" onClick={onClose}>
      <form
        onSubmit={submit}
        onClick={e => e.stopPropagation()}
        className="bg-[#111] border-2 border-[var(--accent)]/60 rounded-xl p-5 w-[320px] max-w-full flex flex-col gap-4"
      >
        <h2 className="text-lg font-bold text-[var(--accent)]">▦ Vložit tabulku</h2>
        <div className="grid grid-cols-[1fr_auto] gap-x-4 gap-y-3 items-center text-sm text-[var(--text)]">
          <label htmlFor="table-rows">Řádků</label>
          <input id="table-rows" type="number" min={1} max={MAX} value={rows} onChange={e => setRows(Number(e.target.value))} className={field} autoFocus />
          <label htmlFor="table-cols">Sloupců</label>
          <input id="table-cols" type="number" min={1} max={MAX} value={cols} onChange={e => setCols(Number(e.target.value))} className={field} />
          <label htmlFor="table-header" className="cursor-pointer">První řádek jako záhlaví</label>
          <input id="table-header" type="checkbox" checked={header} onChange={e => setHeader(e.target.checked)} className="accent-[var(--accent)] justify-self-end" />
        </div>
        <p className="text-xs opacity-60">
          Tip: Tab v poslední buňce přidá nový řádek; pravým tlačítkem nad tabulkou otevřeš nabídku pro řádky a sloupce.
        </p>
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onClose} className="px-3 py-1.5 rounded-lg border border-white/20 text-[var(--text)] hover:bg-white/10 transition-colors">
            Zrušit
          </button>
          <button type="submit" className="px-3 py-1.5 rounded-lg bg-[var(--accent)] text-black font-semibold hover:brightness-110 transition">
            Vložit
          </button>
        </div>
      </form>
    </div>
  )
}
