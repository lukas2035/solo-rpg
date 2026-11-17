import { useState } from 'react'
import { inputClass, selectAll } from '../utils/forms'
import { formatSessionDate, formatSessionDuration } from '../utils/exportSessions'
import type { SessionOverrun } from '../hooks/useSessionTimer'

interface SessionOverrunDialogProps {
  overrun: SessionOverrun
  /** Započítat prvních `keepMs` úseku, zbytek je pauza; `resume` = stopky poté běží dál */
  onResolve: (keepMs: number, resume: boolean) => void
  /** Ponechat celý čas a nechat stopky běžet */
  onKeepAll: () => void
}

const MINUTE_MS = 60_000

/**
 * Upozornění po načtení kampaně, že stopky sezení běží bez přerušení déle než hodinu (typicky zapomenutá pauza).
 * Hráč zvolí, kolik z toho času se počítá jako hraní; zbytek se do historie stopek zapíše jako pauza.
 */
export default function SessionOverrunDialog({ overrun, onResolve, onKeepAll }: SessionOverrunDialogProps) {
  const totalMs = overrun.detectedAt - overrun.since
  const totalMinutes = Math.floor(totalMs / MINUTE_MS)
  const [keepMinutes, setKeepMinutes] = useState(60)

  const keep = Math.min(totalMinutes, Math.max(0, keepMinutes))
  const setKeep = (minutes: number) => setKeepMinutes(Math.min(totalMinutes, Math.max(0, Math.round(minutes) || 0)))
  // Plný posuvník = celý čas včetně necelé poslední minuty
  const keepMs = keep >= totalMinutes ? totalMs : keep * MINUTE_MS
  const pauseMs = totalMs - keepMs

  const presets = [
    { label: 'Nic', minutes: 0 },
    { label: '30 min', minutes: 30 },
    { label: '1 h', minutes: 60 },
    { label: '2 h', minutes: 120 },
    { label: 'Vše', minutes: totalMinutes },
  ].filter(p => p.minutes <= totalMinutes)

  const numberClass = `${inputClass} w-20 text-center`

  return (
    <div className="fixed inset-0 z-[60] bg-black/80 flex items-center justify-center p-4">
      <div role="dialog" aria-modal="true" className="bg-[#111] border-2 border-amber-400/70 rounded-xl p-6 w-[560px] max-w-full max-h-full overflow-y-auto flex flex-col gap-4 text-[var(--text)]">
        <h2 className="text-xl font-bold text-amber-300">⏱️ Stopky sezení běží už {formatSessionDuration(totalMs / 1000)}</h2>
        <p className="text-sm opacity-80">
          Stopky herního sezení běží bez přerušení od <strong>{formatSessionDate(overrun.since)}</strong>, tedy déle než hodinu.
          Kolik z toho času chceš započítat jako hraní? Zbytek se zapíše jako pauza.
        </p>

        <div className="flex flex-col gap-3 p-4 rounded-lg border border-[var(--accent)]/30 bg-black/40">
          <div className="flex items-center gap-2 text-sm flex-wrap">
            <span className="font-semibold">Započítat</span>
            <input
              type="number"
              min={0}
              max={Math.floor(totalMinutes / 60)}
              value={Math.floor(keep / 60)}
              onFocus={selectAll}
              onChange={(e) => setKeep((Number.parseInt(e.target.value, 10) || 0) * 60 + (keep % 60))}
              className={numberClass}
              aria-label="Hodiny"
            />
            <span>h</span>
            <input
              type="number"
              min={0}
              max={59}
              value={keep % 60}
              onFocus={selectAll}
              onChange={(e) => setKeep(Math.floor(keep / 60) * 60 + (Number.parseInt(e.target.value, 10) || 0))}
              className={numberClass}
              aria-label="Minuty"
            />
            <span>min</span>
            <span className="ml-auto flex gap-1">
              {presets.map(p => (
                <button
                  key={p.label}
                  type="button"
                  onClick={() => setKeep(p.minutes)}
                  className={`px-2 py-1 rounded-md border text-xs transition-colors ${keep === p.minutes ? 'border-[var(--accent)] bg-[var(--accent)]/20' : 'border-[var(--accent)]/40 hover:border-[var(--accent)]'}`}
                >
                  {p.label}
                </button>
              ))}
            </span>
          </div>
          <input type="range" min={0} max={totalMinutes} step={1} value={keep} onChange={(e) => setKeep(Number(e.target.value))} className="w-full accent-amber-400 cursor-pointer" aria-label="Započítaný čas" />
          <div className="flex justify-between text-sm">
            <span className="text-emerald-300">▶ Hraní: <strong>{formatSessionDuration(keepMs / 1000)}</strong></span>
            <span className="text-amber-300">⏸ Pauza: <strong>{formatSessionDuration(pauseMs / 1000)}</strong></span>
          </div>
          {pauseMs > 0 && (
            <div className="text-xs opacity-60">Pauza se zapíše od {formatSessionDate(overrun.since + keepMs)}.</div>
          )}
        </div>

        <div className="flex flex-wrap gap-2 justify-end">
          <button type="button" onClick={onKeepAll} className="px-4 py-2 rounded-lg border border-[var(--accent)]/60 hover:border-[var(--accent)] text-sm transition-colors mr-auto">
            Ponechat celý čas
          </button>
          <button type="button" onClick={() => onResolve(keepMs, false)} className="px-4 py-2 rounded-lg bg-amber-500 text-black font-bold hover:opacity-90 transition-opacity text-sm">
            ⏸ Použít a nechat pauzu
          </button>
          <button type="button" onClick={() => onResolve(keepMs, true)} className="px-4 py-2 rounded-lg bg-emerald-500 text-black font-bold hover:opacity-90 transition-opacity text-sm">
            ▶ Použít a pokračovat
          </button>
        </div>
      </div>
    </div>
  )
}
