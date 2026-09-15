import { useEffect, useState } from 'react'
import type { GameSession } from '@solo-rpg/shared'
import { inputClass } from '../utils/forms'
import * as api from '../utils/api'
import type { useSessionTimer } from '../hooks/useSessionTimer'

type Timer = ReturnType<typeof useSessionTimer>

interface SessionModalProps {
  game: string
  timer: Timer
  onClose: () => void
}

function formatClock(ms: number): string {
  const total = Math.floor(ms / 1000)
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  const s = total % 60
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

function formatDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600)
  const m = Math.round((seconds % 3600) / 60)
  return h ? `${h} h ${String(m).padStart(2, '0')} min` : `${m} min`
}

const formatFun = (fun: number) => fun.toLocaleString('cs-CZ', { maximumFractionDigits: 1 })
const formatDate = (ms: number) => new Date(ms).toLocaleString('cs-CZ', { day: 'numeric', month: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' })

/** Hodnocení 0–10 po půl stupních: 10 hvězd, každá půlka klikatelná; pod tím posuvník pro klávesnici */
function FunRating({ value, onChange }: { value: number; onChange: (fun: number) => void }) {
  const [hover, setHover] = useState<number | null>(null)
  const shown = hover ?? value
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-3">
        <div className="flex" onMouseLeave={() => setHover(null)}>
          {Array.from({ length: 10 }, (_, i) => {
            const fill = Math.min(1, Math.max(0, shown - i)) // 0 | 0.5 | 1
            return (
              <div key={i} className="relative w-8 h-8 text-2xl leading-8 select-none">
                <span className="absolute inset-0 text-center text-white/15">★</span>
                <span className="absolute inset-0 text-center text-amber-400 overflow-hidden" style={{ width: `${fill * 100}%` }}>
                  <span className="block w-8">★</span>
                </span>
                <button type="button" title={`${formatFun(i + 0.5)}`} className="absolute inset-y-0 left-0 w-1/2 cursor-pointer" onMouseEnter={() => setHover(i + 0.5)} onClick={() => onChange(i + 0.5)} />
                <button type="button" title={`${formatFun(i + 1)}`} className="absolute inset-y-0 right-0 w-1/2 cursor-pointer" onMouseEnter={() => setHover(i + 1)} onClick={() => onChange(i + 1)} />
              </div>
            )
          })}
        </div>
        <span className="text-2xl font-bold text-amber-300 w-16 text-right tabular-nums">{formatFun(shown)}</span>
        <span className="text-xs opacity-60">/ 10</span>
      </div>
      <input type="range" min={0} max={10} step={0.5} value={value} onChange={(e) => onChange(Number(e.target.value))} className="w-full accent-amber-400 cursor-pointer" />
    </div>
  )
}

/** Dialog herního sezení: stopky (start / pauza / reset), hodnocení zábavnosti, popis a historie sezení hry */
export default function SessionModal({ game, timer, onClose }: SessionModalProps) {
  const { state, running, elapsed } = timer
  const [sessions, setSessions] = useState<GameSession[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [editing, setEditing] = useState<{ id: string; fun: number; description: string } | null>(null)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  useEffect(() => {
    api.listSessions(game).then(setSessions).catch(err => setError(err instanceof Error ? err.message : 'Načtení sezení selhalo.'))
  }, [game])

  const elapsedSeconds = Math.floor(elapsed / 1000)
  const canSave = elapsedSeconds > 0 && !saving

  const handleReset = () => {
    if (elapsed > 0 && !window.confirm('Vynulovat stopky? Naměřený čas se zahodí.')) return
    timer.reset()
  }

  const handleSave = async () => {
    if (!canSave) return
    if (running) timer.pause()
    setSaving(true)
    setError(null)
    try {
      const saved = await api.createSession(game, {
        startedAt: state.startedAt ?? Date.now() - elapsed,
        durationSeconds: elapsedSeconds,
        fun: state.fun,
        description: state.description,
      })
      setSessions(prev => [...(prev ?? []), saved])
      timer.clear()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Uložení sezení selhalo.')
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (session: GameSession) => {
    if (!window.confirm(`Smazat sezení z ${formatDate(session.startedAt)}?`)) return
    try {
      await api.deleteSession(game, session.id)
      setSessions(prev => (prev ?? []).filter(s => s.id !== session.id))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Smazání sezení selhalo.')
    }
  }

  const handleEditSave = async (session: GameSession) => {
    if (!editing) return
    try {
      const saved = await api.updateSession(game, session.id, {
        startedAt: session.startedAt,
        durationSeconds: session.durationSeconds,
        fun: editing.fun,
        description: editing.description,
      })
      setSessions(prev => (prev ?? []).map(s => (s.id === session.id ? saved : s)))
      setEditing(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Uložení změn selhalo.')
    }
  }

  const list = [...(sessions ?? [])].sort((a, b) => b.startedAt - a.startedAt)
  const totalSeconds = list.reduce((sum, s) => sum + s.durationSeconds, 0)
  const avgFun = list.length ? list.reduce((sum, s) => sum + s.fun, 0) / list.length : 0

  return (
    <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4" onClick={onClose}>
      <div
        className="bg-[#111] border-2 border-[var(--accent)]/60 rounded-xl p-6 w-[720px] max-w-full max-h-full overflow-y-auto flex flex-col gap-5 text-[var(--text)]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-bold text-[var(--accent)]">⏱️ Herní sezení – {game}</h2>
          <button type="button" onClick={onClose} title="Zavřít (Esc)" className="px-2 py-1 rounded-md border border-[var(--accent)]/40 hover:border-[var(--accent)] text-sm transition-colors">✕</button>
        </div>

        {/* Stopky */}
        <div className="flex flex-col items-center gap-3 p-4 rounded-lg border border-[var(--accent)]/30 bg-black/40">
          <div className={`font-mono text-6xl font-bold tabular-nums tracking-wider ${running ? 'text-emerald-300' : elapsed > 0 ? 'text-amber-300' : 'text-white/60'}`}>
            {formatClock(elapsed)}
          </div>
          <div className="text-xs opacity-60">
            {running ? '▶ Sezení běží' : elapsed > 0 ? '⏸ Pozastaveno' : 'Stopky stojí'}
            {state.startedAt && ` · začátek ${formatDate(state.startedAt)}`}
          </div>
          <div className="flex gap-2">
            {running ? (
              <button type="button" onClick={timer.pause} className="px-5 py-2 rounded-lg bg-amber-500 text-black font-bold hover:opacity-90 transition-opacity">⏸ Pauza</button>
            ) : (
              <button type="button" onClick={timer.start} className="px-5 py-2 rounded-lg bg-emerald-500 text-black font-bold hover:opacity-90 transition-opacity">
                {elapsed > 0 ? '▶ Pokračovat' : '▶ Spustit'}
              </button>
            )}
            <button type="button" onClick={handleReset} disabled={elapsed === 0} className="px-4 py-2 rounded-lg border border-[var(--accent)]/60 text-[var(--accent)] hover:border-[var(--accent)] hover:bg-black/60 disabled:opacity-40 disabled:cursor-not-allowed transition-all">↺ Reset</button>
          </div>
        </div>

        {/* Hodnocení a popis */}
        <div className="flex flex-col gap-3">
          <label className="flex flex-col gap-1 text-sm">
            <span className="font-semibold">Jak mě to bavilo</span>
            <FunRating value={state.fun} onChange={timer.setFun} />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="font-semibold">Popis sezení <span className="opacity-60 font-normal">(nepovinné – co bavilo, co ne, co změnit)</span></span>
            <textarea
              value={state.description}
              onChange={(e) => timer.setDescription(e.target.value)}
              rows={4}
              className={`${inputClass} resize-y text-sm`}
              placeholder="Např. skvělá scéna v klubu, ale vypravěč moc opakoval popisy…"
            />
          </label>
          <div className="flex items-center gap-3">
            <button type="button" onClick={() => void handleSave()} disabled={!canSave} className="px-5 py-2 rounded-lg bg-[var(--accent)] text-white font-bold hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed transition-opacity">
              💾 Uložit sezení
            </button>
            <span className="text-xs opacity-60">Uloží čas {formatClock(elapsed)}, hodnocení a popis do <code>sessions.md</code> a vynuluje stopky.</span>
          </div>
        </div>

        {error && <div className="px-3 py-2 rounded-lg bg-red-900/70 border border-red-500 text-sm text-red-100">{error}</div>}

        {/* Historie */}
        <div className="flex flex-col gap-2">
          <div className="flex items-baseline justify-between">
            <h3 className="font-semibold text-[var(--accent)]">Odehraná sezení</h3>
            {list.length > 0 && (
              <span className="text-xs opacity-70">
                {list.length}× · celkem {formatDuration(totalSeconds)} · průměr {formatFun(Math.round(avgFun * 10) / 10)}/10
              </span>
            )}
          </div>
          {sessions === null ? (
            <div className="text-sm opacity-60">Načítám…</div>
          ) : list.length === 0 ? (
            <div className="text-sm opacity-60">Zatím žádné sezení – spusť stopky a po hraní ulož.</div>
          ) : (
            <ul className="flex flex-col gap-2">
              {list.map(session => (
                <li key={session.id} className="p-3 rounded-lg border border-[var(--accent)]/20 bg-black/30 text-sm">
                  <div className="flex items-center gap-3">
                    <span className="font-semibold">{formatDate(session.startedAt)}</span>
                    <span className="opacity-70">{formatDuration(session.durationSeconds)}</span>
                    <span className="text-amber-300 font-bold">★ {formatFun(session.fun)}</span>
                    <span className="ml-auto flex gap-1">
                      <button type="button" title="Upravit hodnocení a popis" onClick={() => setEditing(editing?.id === session.id ? null : { id: session.id, fun: session.fun, description: session.description })} className="px-2 py-0.5 rounded-md border border-[var(--accent)]/40 hover:border-[var(--accent)] transition-colors">✏️</button>
                      <button type="button" title="Smazat sezení" onClick={() => void handleDelete(session)} className="px-2 py-0.5 rounded-md border border-red-400/40 text-red-300 hover:border-red-400 transition-colors">✕</button>
                    </span>
                  </div>
                  {editing?.id === session.id ? (
                    <div className="mt-3 flex flex-col gap-2">
                      <FunRating value={editing.fun} onChange={(fun) => setEditing(prev => (prev ? { ...prev, fun } : prev))} />
                      <textarea value={editing.description} onChange={(e) => setEditing(prev => (prev ? { ...prev, description: e.target.value } : prev))} rows={3} className={`${inputClass} resize-y text-sm`} />
                      <div className="flex gap-2">
                        <button type="button" onClick={() => void handleEditSave(session)} className="px-3 py-1 rounded-md bg-[var(--accent)] text-white text-xs font-bold">Uložit</button>
                        <button type="button" onClick={() => setEditing(null)} className="px-3 py-1 rounded-md border border-[var(--accent)]/40 text-xs">Zrušit</button>
                      </div>
                    </div>
                  ) : (
                    session.description && <p className="mt-2 whitespace-pre-wrap opacity-85">{session.description}</p>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  )
}
