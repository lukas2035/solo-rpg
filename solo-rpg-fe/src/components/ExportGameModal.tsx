import { useEffect, useState } from 'react'
import type { SceneMeta } from '@solo-rpg/shared'

interface ExportGameModalProps {
  scenes: SceneMeta[]
  /** Id aktuálně otevřené scény – předvyplní se jako zaškrtnutá, když hráč zvolí „jen aktuální“ */
  currentSceneId: string | null
  /**
   * Spustí export; `selectedSceneIds` = undefined znamená celou hru (všechny scény),
   * jinak jen vybrané scény – soubor pak uvádí, že jde o výběr pro kontext.
   */
  onExport: (selectedSceneIds?: string[]) => Promise<boolean>
  onClose: () => void
}

/**
 * Dialog „Exportovat hru“: hráč zaškrtne scény, jejichž obsah má být v textovém Markdown exportu
 * (kontext pro externí AI chat). Postavy, svět, questy atd. jsou v exportu vždy; výchozí stav = všechny scény.
 */
export default function ExportGameModal({ scenes, currentSceneId, onExport, onClose }: ExportGameModalProps) {
  const ordered = [...scenes].sort((a, b) => a.order - b.order)
  const [selected, setSelected] = useState<Set<string>>(() => new Set(ordered.map(s => s.id)))
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && !busy) onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose, busy])

  const allSelected = ordered.length > 0 && selected.size === ordered.length
  const isSelection = !allSelected

  const toggle = (id: string) =>
    setSelected(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })

  const handleSubmit = async (e?: React.FormEvent) => {
    e?.preventDefault()
    if (busy) return
    if (ordered.length && !selected.size) {
      setError('Vyber alespoň jednu scénu.')
      return
    }
    setBusy(true)
    setError(null)
    try {
      const ok = await onExport(isSelection ? ordered.filter(s => selected.has(s.id)).map(s => s.id) : undefined)
      if (!ok) {
        setError('Export selhal – zkus to znovu.')
        return
      }
      onClose()
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4" onClick={() => { if (!busy) onClose() }}>
      <form
        onSubmit={handleSubmit}
        className="bg-[#111] border-2 border-[var(--accent)]/60 rounded-xl p-6 w-[640px] max-w-full max-h-full overflow-y-auto flex flex-col gap-4"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-xl font-bold text-[var(--accent)]">📄 Exportovat hru do Markdownu</h2>
        <p className="text-sm text-[var(--text)] opacity-80">
          Stáhne jeden textový <code>.md</code> soubor (bez obrázků) jako kontext pro AI chat. Postavy, svět, questy, frakce,
          dějové nitě i lore jsou v něm vždy; zde vyber, obsah kterých scén se má přiložit. Při výběru jen některých scén
          soubor uvede, že jde o výběr scén důležitých pro kontext, a vynechané scény vyjmenuje jen názvem.
        </p>

        <div className="flex flex-wrap gap-2 text-sm">
          <button
            type="button"
            onClick={() => setSelected(new Set(ordered.map(s => s.id)))}
            className="px-3 py-1 rounded-lg border border-[var(--accent)]/40 text-[var(--text)] hover:border-[var(--accent)] transition-colors"
          >
            Vybrat vše
          </button>
          <button
            type="button"
            onClick={() => setSelected(new Set())}
            className="px-3 py-1 rounded-lg border border-[var(--accent)]/40 text-[var(--text)] hover:border-[var(--accent)] transition-colors"
          >
            Zrušit výběr
          </button>
          {currentSceneId && (
            <button
              type="button"
              onClick={() => setSelected(new Set([currentSceneId]))}
              className="px-3 py-1 rounded-lg border border-[var(--accent)]/40 text-[var(--text)] hover:border-[var(--accent)] transition-colors"
            >
              Jen aktuální scéna
            </button>
          )}
          <span className="ml-auto self-center opacity-70">
            {selected.size} / {ordered.length} scén
          </span>
        </div>

        <ul className="flex flex-col gap-1 max-h-[50vh] overflow-y-auto border border-[var(--accent)]/30 rounded-lg p-2">
          {!ordered.length && <li className="text-sm opacity-70 px-2 py-1">Hra zatím nemá žádné scény.</li>}
          {ordered.map((s, i) => {
            const checked = selected.has(s.id)
            return (
              <li key={s.id}>
                <label
                  className={`flex items-start gap-3 px-2 py-1.5 rounded-md cursor-pointer select-none transition-colors ${
                    checked ? 'bg-[var(--accent)]/15' : 'opacity-70 hover:opacity-100 hover:bg-white/5'
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => toggle(s.id)}
                    className="mt-1 accent-[var(--accent)]"
                  />
                  <span className="flex flex-col text-sm text-[var(--text)]">
                    <span>
                      <span className="opacity-60">Scéna {i + 1}:</span> <span className="font-semibold">{s.title}</span>
                      {s.id === currentSceneId && <span className="ml-2 text-xs opacity-60">(aktuální)</span>}
                      <span className="ml-2 text-xs opacity-60">{s.mode === 'prose' ? 'próza' : `${s.entryCount} záznamů`}</span>
                    </span>
                    {s.summary.trim() && <span className="text-xs opacity-60 line-clamp-2">{s.summary}</span>}
                  </span>
                </label>
              </li>
            )
          })}
        </ul>

        {error && <p className="text-sm text-red-300">{error}</p>}

        <div className="flex gap-3 justify-end">
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="px-4 py-2 rounded-lg border border-[var(--accent)]/40 text-[var(--text)] hover:border-[var(--accent)] transition-colors disabled:opacity-50"
          >
            Zrušit
          </button>
          <button
            type="submit"
            disabled={busy || (ordered.length > 0 && !selected.size)}
            className="px-4 py-2 rounded-lg bg-[var(--accent)] text-white font-semibold hover:opacity-80 transition-opacity disabled:opacity-50"
          >
            {busy ? 'Exportuji…' : isSelection ? 'Exportovat vybrané scény' : 'Exportovat celou hru'}
          </button>
        </div>
      </form>
    </div>
  )
}
