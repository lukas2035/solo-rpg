import { useEffect, useMemo, useState } from 'react'
import type { Note, SceneMeta } from '@solo-rpg/shared'

interface NotesPinModalProps {
  scenes: SceneMeta[]
  notes: Note[]
  currentSceneId: string | null
  /** Uloží změněné scény (klíč = id scény, hodnota = nové připnuté listy) */
  onSave: (changes: Record<string, string[]>) => Promise<void>
  onClose: () => void
}

/**
 * Hromadná správa připnutí: tabulka scény (řádky) × poznámkové listy (sloupce) se zaškrtávátky.
 * Kliknutím na název listu se přepne celý sloupec, kliknutím na scénu celý řádek; rozsah „od–do“ přes Shift+klik v řádku.
 */
export default function NotesPinModal({ scenes, notes, currentSceneId, onSave, onClose }: NotesPinModalProps) {
  const ordered = useMemo(() => [...scenes].sort((a, b) => a.order - b.order), [scenes])
  const sortedNotes = useMemo(() => [...notes].sort((a, b) => a.title.localeCompare(b.title, 'cs')), [notes])
  const [pins, setPins] = useState<Record<string, Set<string>>>(() =>
    Object.fromEntries(ordered.map(s => [s.id, new Set(s.notes)]))
  )
  const [lastRow, setLastRow] = useState<number | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && !busy) onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose, busy])

  const update = (fn: (next: Record<string, Set<string>>) => void) =>
    setPins(prev => {
      const next = Object.fromEntries(Object.entries(prev).map(([k, v]) => [k, new Set(v)]))
      fn(next)
      return next
    })

  const toggleCell = (rowIndex: number, title: string, shift: boolean) => {
    // Shift+klik vyplní rozsah řádků od posledního kliknutého podle nového stavu této buňky
    const from = shift && lastRow !== null ? Math.min(lastRow, rowIndex) : rowIndex
    const to = shift && lastRow !== null ? Math.max(lastRow, rowIndex) : rowIndex
    const sceneId = ordered[rowIndex].id
    const willPin = !pins[sceneId].has(title)
    update(next => {
      for (let i = from; i <= to; i++) {
        const set = next[ordered[i].id]
        if (willPin) set.add(title)
        else set.delete(title)
      }
    })
    setLastRow(rowIndex)
  }

  const toggleColumn = (title: string) => {
    const all = ordered.every(s => pins[s.id].has(title))
    update(next => { for (const s of ordered) { if (all) next[s.id].delete(title); else next[s.id].add(title) } })
  }

  const toggleRow = (sceneId: string) => {
    const all = sortedNotes.every(n => pins[sceneId].has(n.title))
    update(next => { next[sceneId] = new Set(all ? [] : sortedNotes.map(n => n.title)) })
  }

  /** Doplní do každé scény připnutí z nejbližší předchozí scény, která nějaké má (průběh dobrodružství „teče“ dopředu) */
  const fillForward = () =>
    update(next => {
      let carry: Set<string> | null = null
      for (const s of ordered) {
        if (next[s.id].size > 0) carry = new Set(next[s.id])
        else if (carry) next[s.id] = new Set(carry)
      }
    })

  const changes = useMemo(() => {
    const out: Record<string, string[]> = {}
    for (const s of ordered) {
      const next = sortedNotes.map(n => n.title).filter(t => pins[s.id].has(t))
      const prev = new Set(s.notes)
      if (next.length !== prev.size || next.some(t => !prev.has(t))) out[s.id] = next
    }
    return out
  }, [ordered, sortedNotes, pins])
  const changedCount = Object.keys(changes).length

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (busy) return
    setBusy(true)
    setError(null)
    try {
      await onSave(changes)
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Uložení připnutí selhalo.')
    } finally {
      setBusy(false)
    }
  }

  const linkButton = 'px-3 py-1 rounded-lg border border-[var(--accent)]/40 text-[var(--text)] hover:border-[var(--accent)] transition-colors text-sm'

  return (
    <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4" onClick={() => { if (!busy) onClose() }}>
      <form
        onSubmit={handleSubmit}
        onClick={e => e.stopPropagation()}
        className="bg-[#111] border-2 border-[var(--accent)]/60 rounded-xl p-6 w-[860px] max-w-full max-h-full flex flex-col gap-4"
      >
        <h2 className="text-xl font-bold text-[var(--accent)]">🗂 Poznámkové listy připnuté ke scénám</h2>
        <p className="text-sm text-[var(--text)] opacity-80">
          Zaškrtni, které listy patří ke kterým scénám. Klik na název listu přepne celý sloupec, klik na scénu celý řádek,
          Shift+klik vyplní rozsah scén. Připnuté listy se zobrazí jako výchozí v poznámkách a přikládají se k exportu scén.
        </p>

        <div className="flex flex-wrap gap-2 items-center">
          <button type="button" onClick={fillForward} className={linkButton} title="Scény bez připnutí převezmou listy z nejbližší předchozí scény, která nějaké má">
            ⤵ Doplnit podle předchozí scény
          </button>
          <button type="button" onClick={() => update(next => { for (const s of ordered) next[s.id] = new Set() })} className={linkButton}>
            Odepnout vše
          </button>
          <span className="ml-auto text-sm opacity-70">{changedCount} změněných scén</span>
        </div>

        {sortedNotes.length === 0 ? (
          <p className="text-sm opacity-70">Zatím nemáš žádný poznámkový list – vytvoř ho tlačítkem ➕ v poznámkách.</p>
        ) : (
          <div className="overflow-auto border border-[var(--accent)]/30 rounded-lg max-h-[55vh]">
            <table className="text-sm text-[var(--text)] border-collapse min-w-full">
              <thead className="sticky top-0 bg-[#1a1a1a] z-10">
                <tr>
                  <th className="text-left px-3 py-2 font-semibold border-b border-[var(--accent)]/30">Scéna</th>
                  {sortedNotes.map(n => (
                    <th key={n.id} className="px-2 py-2 border-b border-l border-[var(--accent)]/30 font-semibold max-w-[140px]">
                      <button
                        type="button"
                        onClick={() => toggleColumn(n.title)}
                        title="Přepnout celý sloupec"
                        className="hover:text-[var(--accent)] transition-colors truncate max-w-full block"
                      >
                        📝 {n.title}
                      </button>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {ordered.map((s, i) => (
                  <tr key={s.id} className={`${s.id === currentSceneId ? 'bg-[var(--accent)]/10' : i % 2 ? 'bg-white/[0.03]' : ''} hover:bg-white/5`}>
                    <td className="px-3 py-1.5 border-b border-white/5 whitespace-nowrap">
                      <button type="button" onClick={() => toggleRow(s.id)} title="Přepnout celý řádek" className="hover:text-[var(--accent)] transition-colors text-left">
                        <span className="opacity-60">{i + 1}.</span> {s.title}
                        {s.id === currentSceneId && <span className="ml-2 text-xs opacity-60">(aktuální)</span>}
                      </button>
                    </td>
                    {sortedNotes.map(n => (
                      <td key={n.id} className="text-center border-b border-l border-white/5">
                        <label className="flex items-center justify-center py-1.5 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={pins[s.id].has(n.title)}
                            onClick={e => toggleCell(i, n.title, e.shiftKey)}
                            onChange={() => { /* stav řeší onClick kvůli Shift */ }}
                            className="accent-[var(--accent)] w-4 h-4"
                          />
                        </label>
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {error && <p className="text-sm text-red-300">{error}</p>}

        <div className="flex gap-3 justify-end">
          <button type="button" onClick={onClose} disabled={busy} className="px-4 py-2 rounded-lg border border-[var(--accent)]/40 text-[var(--text)] hover:border-[var(--accent)] transition-colors disabled:opacity-50">
            Zrušit
          </button>
          <button type="submit" disabled={busy || changedCount === 0} className="px-4 py-2 rounded-lg bg-[var(--accent)] text-white font-semibold hover:opacity-80 transition-opacity disabled:opacity-50">
            {busy ? 'Ukládám…' : `Uložit (${changedCount})`}
          </button>
        </div>
      </form>
    </div>
  )
}
