import { useEffect, useMemo, useState } from 'react'
import { parseImportedTables, type ImportedTable, type ImportedTableTitleStyle } from '@solo-rpg/shared'

/** Data pro vložení tabulky: buď prázdná mřížka zadaných rozměrů, nebo tabulky naimportované z textu */
export type TableInsertSpec =
  | { kind: 'empty'; rows: number; cols: number; withHeaderRow: boolean }
  | { kind: 'import'; tables: ImportedTable[]; titleStyle: ImportedTableTitleStyle; withHeaderRow: boolean }

interface TableInsertModalProps {
  onInsert: (spec: TableInsertSpec) => void
  onClose: () => void
}

const MAX = 30

const TITLE_STYLES: { value: ImportedTableTitleStyle; label: string }[] = [
  { value: 'h1', label: 'Nadpis 1' },
  { value: 'h2', label: 'Nadpis 2' },
  { value: 'h3', label: 'Nadpis 3' },
  { value: 'bold', label: 'Tučně' },
  { value: 'normal', label: 'Normální text' },
]

/**
 * Dialog před vložením tabulky do editoru prózy / poznámek.
 * Ručně: počet řádků a sloupců, záhlaví. Import: text zkopírovaný z ChatGPT (buňky oddělené tabulátorem),
 * rozměry se odvodí z textu a řádek nad tabulkou se vloží jako její název ve zvoleném stylu.
 */
export default function TableInsertModal({ onInsert, onClose }: TableInsertModalProps) {
  const [mode, setMode] = useState<'manual' | 'import'>('manual')
  const [rows, setRows] = useState(3)
  const [cols, setCols] = useState(3)
  const [header, setHeader] = useState(true)
  const [text, setText] = useState('')
  const [titleStyle, setTitleStyle] = useState<ImportedTableTitleStyle>('bold')

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const tables = useMemo(() => (mode === 'import' ? parseImportedTables(text) : []), [mode, text])
  const hasTitle = tables.some(t => t.title)
  const canSubmit = mode === 'manual' || tables.length > 0

  const clamp = (n: number) => Math.min(MAX, Math.max(1, Math.trunc(n) || 1))

  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!canSubmit) return
    if (mode === 'import') onInsert({ kind: 'import', tables, titleStyle, withHeaderRow: header })
    else onInsert({ kind: 'empty', rows: clamp(rows), cols: clamp(cols), withHeaderRow: header })
    onClose()
  }

  const field = 'px-2 py-1 rounded-md bg-black/60 border border-[var(--accent)]/40 text-[var(--text)] focus:border-[var(--accent)] outline-none'
  const tab = (active: boolean) =>
    `flex-1 px-3 py-1.5 rounded-lg text-sm transition-colors ${active ? 'bg-[var(--accent)]/30 text-[var(--accent)] font-semibold' : 'text-[var(--text)] hover:bg-white/10'}`

  return (
    <div className="fixed inset-0 z-[60] bg-black/70 flex items-center justify-center p-4" onClick={onClose}>
      <form
        onSubmit={submit}
        onClick={e => e.stopPropagation()}
        className={`bg-[#111] border-2 border-[var(--accent)]/60 rounded-xl p-5 max-w-full flex flex-col gap-4 ${mode === 'import' ? 'w-[520px]' : 'w-[320px]'}`}
      >
        <h2 className="text-lg font-bold text-[var(--accent)]">▦ Vložit tabulku</h2>
        <div className="flex gap-1 p-1 rounded-xl bg-black/50 border border-white/10">
          <button type="button" onClick={() => setMode('manual')} className={tab(mode === 'manual')}>Ručně</button>
          <button type="button" onClick={() => setMode('import')} className={tab(mode === 'import')}>Import z ChatGPT</button>
        </div>

        {mode === 'manual' ? (
          <div className="grid grid-cols-[1fr_auto] gap-x-4 gap-y-3 items-center text-sm text-[var(--text)]">
            <label htmlFor="table-rows">Řádků</label>
            <input id="table-rows" type="number" min={1} max={MAX} value={rows} onChange={e => setRows(Number(e.target.value))} className={`${field} w-20`} autoFocus />
            <label htmlFor="table-cols">Sloupců</label>
            <input id="table-cols" type="number" min={1} max={MAX} value={cols} onChange={e => setCols(Number(e.target.value))} className={`${field} w-20`} />
            <label htmlFor="table-header" className="cursor-pointer">První řádek jako záhlaví</label>
            <input id="table-header" type="checkbox" checked={header} onChange={e => setHeader(e.target.checked)} className="accent-[var(--accent)] justify-self-end" />
          </div>
        ) : (
          <div className="flex flex-col gap-3 text-sm text-[var(--text)]">
            <textarea
              value={text}
              onChange={e => setText(e.target.value)}
              placeholder={'Sem vlož tabulku zkopírovanou z ChatGPT (buňky oddělené tabulátorem).\nŘádek s názvem nad tabulkou se vloží jako její nadpis.'}
              className={`${field} w-full h-40 resize-y font-mono text-xs leading-snug`}
              autoFocus
              spellCheck={false}
            />
            <div className="text-xs opacity-70">
              {text.trim() === ''
                ? 'Čekám na text…'
                : tables.length === 0
                  ? '⚠️ V textu nebyla nalezena tabulka (buňky musí oddělovat tabulátor nebo |).'
                  : tables.map((t, i) => (
                    <div key={i}>
                      ✓ {tables.length > 1 ? `Tabulka ${i + 1}: ` : ''}{t.rows.length} × {t.rows[0].length}
                      {t.title ? ` – název „${t.title}“` : ' – bez názvu'}
                    </div>
                  ))}
            </div>
            <div className="grid grid-cols-[1fr_auto] gap-x-4 gap-y-3 items-center">
              <label htmlFor="table-header-import" className="cursor-pointer">První řádek jako záhlaví</label>
              <input id="table-header-import" type="checkbox" checked={header} onChange={e => setHeader(e.target.checked)} className="accent-[var(--accent)] justify-self-end" />
              {hasTitle && (
                <>
                  <label htmlFor="table-title-style">Styl názvu tabulky</label>
                  <select id="table-title-style" value={titleStyle} onChange={e => setTitleStyle(e.target.value as ImportedTableTitleStyle)} className={field}>
                    {TITLE_STYLES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
                  </select>
                </>
              )}
            </div>
          </div>
        )}

        <p className="text-xs opacity-60">
          Tip: Tab v poslední buňce přidá nový řádek; pravým tlačítkem nad tabulkou otevřeš nabídku pro řádky a sloupce.
        </p>
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onClose} className="px-3 py-1.5 rounded-lg border border-white/20 text-[var(--text)] hover:bg-white/10 transition-colors">
            Zrušit
          </button>
          <button type="submit" disabled={!canSubmit} className="px-3 py-1.5 rounded-lg bg-[var(--accent)] text-black font-semibold hover:brightness-110 transition disabled:opacity-40">
            Vložit
          </button>
        </div>
      </form>
    </div>
  )
}
