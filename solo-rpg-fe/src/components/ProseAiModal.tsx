import { useState } from 'react'
import { inputClass } from '../utils/forms'

interface ProseAiModalProps {
  /** Historie promptů této scény (nejnovější první) */
  prompts: string[]
  /** Pošle prompt do AI; po úspěchu se dialog zavře, text připíše editor. Chyba se zobrazí v dialogu. */
  onSubmit: (prompt: string) => Promise<void>
  onDeletePrompt: (prompt: string) => Promise<void>
  onClose: () => void
}

/**
 * Dialog „AI pokračování“ pro editor prózy: pokyn autora + seznam dřívějších promptů scény
 * (kopírování do schránky, znovupoužití, mazání). Během generování zůstává otevřený a blokuje tlačítka.
 */
export default function ProseAiModal({ prompts, onSubmit, onDeletePrompt, onClose }: ProseAiModalProps) {
  const [prompt, setPrompt] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [copied, setCopied] = useState<string | null>(null)
  const canSubmit = prompt.trim().length > 0 && !busy

  const handleSubmit = async (e?: React.FormEvent) => {
    e?.preventDefault()
    if (!canSubmit) return
    setBusy(true)
    setError(null)
    try {
      await onSubmit(prompt.trim())
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Generování selhalo.')
      setBusy(false)
    }
  }

  const copy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(text)
      window.setTimeout(() => setCopied(c => (c === text ? null : c)), 1500)
    } catch (err) {
      console.error('Kopírování do schránky selhalo:', err)
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4" onClick={() => { if (!busy) onClose() }}>
      <form
        onSubmit={handleSubmit}
        className="bg-[#111] border-2 border-cyan-500/60 rounded-xl p-6 w-[760px] max-w-full max-h-full overflow-y-auto flex flex-col gap-4"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-xl font-bold text-cyan-300">🤖 AI pokračování příběhu</h2>
        <p className="text-sm text-[var(--text)] opacity-80">
          AI dostane celý dosavadní text scény (bez obrázků) a tvůj pokyn; vrácené pokračování se připíše na konec textu.
          Pokyn se uloží do seznamu níže, abys ho mohl znovu použít.
        </p>

        <label className="flex flex-col gap-1 text-left text-sm text-[var(--text)]">
          Pokyn pro AI (Ctrl+Enter odešle)
          <textarea
            rows={6}
            autoFocus
            disabled={busy}
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && e.ctrlKey) {
                e.preventDefault()
                void handleSubmit()
              }
            }}
            placeholder={'Např.: Pokračuj dialogem mezi Klárou a cizincem, ať se dozví, odkud přišel. Zakonči scénu napětím.'}
            className={`${inputClass} text-sm resize-y whitespace-pre-wrap`}
          />
        </label>

        {error && <div className="text-sm text-red-300 border border-red-500/40 rounded-md px-3 py-2 bg-red-900/20">{error}</div>}

        {prompts.length > 0 && (
          <div className="flex flex-col gap-1">
            <div className="text-sm text-[var(--text)] opacity-80">Dřívější prompty této scény</div>
            <ul className="flex flex-col gap-1 max-h-60 overflow-y-auto pr-1">
              {prompts.map(p => (
                <li key={p} className="flex items-start gap-2 rounded-md border border-white/10 bg-white/5 px-2 py-1.5 text-sm text-[var(--text)]">
                  <span className="flex-1 whitespace-pre-wrap break-words line-clamp-3" title={p}>{p}</span>
                  <div className="flex gap-1 flex-shrink-0">
                    <button type="button" title="Použít jako pokyn" disabled={busy} onClick={() => setPrompt(p)} className="px-1.5 h-6 rounded hover:bg-white/15 disabled:opacity-40">↩</button>
                    <button type="button" title="Zkopírovat do schránky" onClick={() => void copy(p)} className="px-1.5 h-6 rounded hover:bg-white/15">{copied === p ? '✓' : '📋'}</button>
                    <button type="button" title="Smazat ze seznamu" disabled={busy} onClick={() => void onDeletePrompt(p)} className="px-1.5 h-6 rounded hover:bg-red-500/40 disabled:opacity-40">✕</button>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className="flex justify-end gap-2">
          <button type="button" disabled={busy} onClick={onClose} className="px-4 py-2 rounded-md border border-[var(--accent)]/40 text-[var(--text)] hover:border-[var(--accent)] transition-colors disabled:opacity-50">
            Zrušit
          </button>
          <button
            type="submit"
            disabled={!canSubmit}
            className="px-4 py-2 rounded-md border border-cyan-400 bg-cyan-700/50 text-cyan-50 font-semibold hover:bg-cyan-600/60 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {busy ? '⏳ Generuji…' : '🤖 Poslat AI'}
          </button>
        </div>
      </form>
    </div>
  )
}
