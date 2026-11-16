import { useEffect, useState } from 'react'
import { sessionDurationSeconds, type GameSession } from '@solo-rpg/shared'
import { downloadTextFile } from '../utils/exportGame'
import { buildSessionsMarkdown, formatSessionDate, formatSessionDuration, formatSessionFun, sessionsExportFileName } from '../utils/exportSessions'

interface SessionsExportModalProps {
  game: string
  sessions: GameSession[]
  onClose: () => void
}

/**
 * Dialog „Exportovat sezení“: hráč zaškrtne sezení, která se mají dostat do Markdownu,
 * a zkopíruje je do schránky nebo stáhne jako `.md` soubor. Výchozí stav = všechna sezení.
 */
export default function SessionsExportModal({ game, sessions, onClose }: SessionsExportModalProps) {
  const ordered = [...sessions].sort((a, b) => b.startedAt - a.startedAt)
  const [selected, setSelected] = useState<Set<string>>(() => new Set(ordered.map(s => s.id)))
  const [status, setStatus] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const isSelection = selected.size < ordered.length
  const chosen = ordered.filter(s => selected.has(s.id))

  const toggle = (id: string) =>
    setSelected(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })

  const markdown = () => buildSessionsMarkdown(game, chosen, ordered.length)

  const handleCopy = async () => {
    if (!chosen.length) return
    try {
      await navigator.clipboard.writeText(markdown())
      setStatus({ kind: 'ok', text: `Zkopírováno ${chosen.length} sezení do schránky.` })
    } catch {
      setStatus({ kind: 'error', text: 'Kopírování do schránky selhalo.' })
    }
  }

  const handleDownload = () => {
    if (!chosen.length) return
    downloadTextFile(sessionsExportFileName(game, isSelection), markdown())
    setStatus({ kind: 'ok', text: `Staženo ${chosen.length} sezení jako .md soubor.` })
  }

  return (
    <div className="fixed inset-0 z-[60] bg-black/80 flex items-center justify-center p-4" onClick={onClose}>
      <div
        className="bg-[#111] border-2 border-[var(--accent)]/60 rounded-xl p-6 w-[640px] max-w-full max-h-full overflow-y-auto flex flex-col gap-4 text-[var(--text)]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-bold text-[var(--accent)]">📄 Exportovat sezení – {game}</h2>
          <button type="button" onClick={onClose} title="Zavřít (Esc)" className="px-2 py-1 rounded-md border border-[var(--accent)]/40 hover:border-[var(--accent)] text-sm transition-colors">✕</button>
        </div>
        <p className="text-sm opacity-80">
          Vyber sezení, která se mají exportovat. Každé obsahuje datum začátku, dobu trvání (včetně naměřené doby, pokud byla upravena),
          hodnocení a popis. Výsledek zkopíruj do schránky nebo stáhni jako <code>.md</code>.
        </p>

        <div className="flex flex-wrap gap-2 text-sm">
          <button type="button" onClick={() => setSelected(new Set(ordered.map(s => s.id)))} className="px-3 py-1 rounded-lg border border-[var(--accent)]/40 hover:border-[var(--accent)] transition-colors">
            Vybrat vše
          </button>
          <button type="button" onClick={() => setSelected(new Set())} className="px-3 py-1 rounded-lg border border-[var(--accent)]/40 hover:border-[var(--accent)] transition-colors">
            Zrušit výběr
          </button>
          <span className="ml-auto self-center opacity-70">{selected.size} / {ordered.length} sezení</span>
        </div>

        <ul className="flex flex-col gap-1 max-h-[50vh] overflow-y-auto border border-[var(--accent)]/30 rounded-lg p-2">
          {!ordered.length && <li className="text-sm opacity-70 px-2 py-1">Zatím žádné sezení.</li>}
          {ordered.map(s => {
            const checked = selected.has(s.id)
            return (
              <li key={s.id}>
                <label className={`flex items-start gap-3 px-2 py-1.5 rounded-md cursor-pointer select-none transition-colors ${checked ? 'bg-[var(--accent)]/15' : 'opacity-70 hover:opacity-100 hover:bg-white/5'}`}>
                  <input type="checkbox" checked={checked} onChange={() => toggle(s.id)} className="mt-1 accent-[var(--accent)]" />
                  <span className="flex flex-col text-sm">
                    <span className="flex flex-wrap items-center gap-2">
                      <span className="font-semibold">{formatSessionDate(s.startedAt)}</span>
                      <span className="opacity-70">{formatSessionDuration(sessionDurationSeconds(s))}</span>
                      {s.customDurationSeconds !== undefined && <span className="text-xs opacity-60">(vlastní doba)</span>}
                      <span className="text-amber-300 font-bold">★ {formatSessionFun(s.fun)}</span>
                    </span>
                    {s.description.trim() && <span className="text-xs opacity-60 line-clamp-2 whitespace-pre-wrap">{s.description}</span>}
                  </span>
                </label>
              </li>
            )
          })}
        </ul>

        {status && (
          <p className={`text-sm ${status.kind === 'ok' ? 'text-emerald-300' : 'text-red-300'}`}>{status.text}</p>
        )}

        <div className="flex gap-3 justify-end">
          <button type="button" onClick={onClose} className="px-4 py-2 rounded-lg border border-[var(--accent)]/40 hover:border-[var(--accent)] transition-colors">
            Zavřít
          </button>
          <button type="button" onClick={() => void handleCopy()} disabled={!chosen.length} className="px-4 py-2 rounded-lg border border-[var(--accent)]/60 text-[var(--accent)] font-semibold hover:border-[var(--accent)] hover:bg-black/60 transition-all disabled:opacity-50 disabled:cursor-not-allowed">
            📋 Kopírovat do schránky
          </button>
          <button type="button" onClick={handleDownload} disabled={!chosen.length} className="px-4 py-2 rounded-lg bg-[var(--accent)] text-white font-semibold hover:opacity-80 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed">
            ⬇️ Stáhnout .md
          </button>
        </div>
      </div>
    </div>
  )
}
