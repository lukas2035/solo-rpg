import { useEffect, useRef, useState } from 'react'
import type { AiSuggestion, StoryEntry } from '@solo-rpg/shared'
import { inputClass } from '../utils/forms'

interface AiInlineReviewProps {
  suggestion: AiSuggestion
  /** Probíhá accept/reject/regenerace */
  busy: boolean
  /** Přijetí aktuální (první zbývající) repliky – `last` = byla poslední */
  onAccept: (entry: StoryEntry, last: boolean) => void
  /** Odmítnutí aktuální repliky a všech dalších; `regenerate` = hned pokračovat znovu, `prompt` = prompt pro nový pokus ('' = bez promptu) */
  onReject: (reason: string, regenerate: boolean, prompt: string) => void
}

/**
 * Tlačítka pod replikou AI zobrazenou přímo v textu scény (schvalování „inline“). Replika se vykresluje ve StoryPanelu
 * jako běžný záznam, tady je jen hlavička a akce. Při zobrazení dostane fokus ✅ Přijmout, takže Enter repliku přijme.
 * Rodič komponentu remountuje přes `key` z id návrhu a id repliky.
 */
export default function AiInlineReview({ suggestion, busy, onAccept, onReject }: AiInlineReviewProps) {
  const acceptRef = useRef<HTMLButtonElement | null>(null)
  const [rejecting, setRejecting] = useState(false)
  const [reason, setReason] = useState('')
  /** Prompt pro opravný pokus – předvyplněný promptem tohoto návrhu; smazání = další pokus bez promptu */
  const [retryPrompt, setRetryPrompt] = useState(suggestion.promptEntry?.text ?? '')
  const hadPrompt = !!suggestion.promptEntry

  const entry = suggestion.entries[0]
  const total = suggestion.entries.length
  const remaining = total - 1

  useEffect(() => {
    if (!rejecting) acceptRef.current?.focus()
  }, [rejecting])

  return (
    <div className="flex flex-col gap-2 pl-[156px] pr-2 -mt-2 text-sm text-cyan-50">
      <div className="text-xs text-cyan-200/70">
        🤖 Návrh AI · {total === 1 ? 'poslední replika' : `replika 1 z ${total}, ${remaining} ${remaining === 1 ? 'další čeká' : remaining < 5 ? 'další čekají' : 'dalších čeká'}`}
        {suggestion.rejectedReasons.length ? ` · ${suggestion.rejectedReasons.length}. pokus po odmítnutí` : ''}
        {hadPrompt ? ' · s promptem' : ''}
      </div>

      {rejecting && (
        <div className="flex flex-col gap-2 p-3 rounded-lg border border-cyan-500/50 bg-cyan-950/80">
          <label className="flex flex-col gap-1 text-xs text-cyan-200/80">
            Proč replika nesedí? (fakt o světě – AI ho dostane při dalším pokusu; může zůstat prázdné)
            {remaining > 0 ? ` Odmítne se i ${remaining} ${remaining === 1 ? 'další' : 'dalších'}.` : ''}
            <textarea
              value={reason}
              onChange={e => setReason(e.target.value)}
              disabled={busy}
              rows={2}
              autoFocus
              placeholder="Např. Julia není Klářina kamarádka, znají se jen od vidění."
              className={`${inputClass} text-sm`}
            />
          </label>
          {hadPrompt && (
            <label className="flex flex-col gap-1 text-xs text-cyan-200/80">
              💬 Prompt pro opravný pokus – uprav, nebo celý smaž, aby AI psala bez promptu
              <textarea
                value={retryPrompt}
                onChange={e => setRetryPrompt(e.target.value)}
                disabled={busy}
                rows={Math.min(6, Math.max(2, retryPrompt.split('\n').length))}
                className={`${inputClass} text-sm`}
              />
            </label>
          )}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        {!rejecting ? (
          <>
            <button
              ref={acceptRef}
              type="button"
              onClick={() => onAccept(entry, remaining === 0)}
              disabled={busy}
              className="px-3 py-1 rounded-md border border-emerald-400 bg-emerald-700/50 hover:bg-emerald-600/60 focus:outline-none focus:ring-2 focus:ring-emerald-300 transition-colors disabled:opacity-50"
              title={remaining > 0 ? 'Zapsat tuto repliku do scény a ukázat další (Enter)' : 'Zapsat poslední repliku do scény (Enter)'}
            >
              ✅ Přijmout{remaining > 0 ? ' a další' : ''}
            </button>
            <button
              type="button"
              onClick={() => setRejecting(true)}
              disabled={busy}
              className="px-3 py-1 rounded-md border border-red-300/60 hover:border-red-200 hover:bg-red-900/40 transition-colors disabled:opacity-50"
              title={remaining > 0 ? 'Odmítnout tuto repliku i všechny další' : 'Odmítnout repliku'}
            >
              ❌ Odmítnout…
            </button>
            <button
              type="button"
              // S promptem nejdřív nabídnout jeho úpravu (formulář odmítnutí), bez promptu rovnou znovu
              onClick={() => (hadPrompt ? setRejecting(true) : onReject('', true, ''))}
              disabled={busy}
              className="px-3 py-1 rounded-md border border-cyan-300/60 hover:border-cyan-200 transition-colors disabled:opacity-50"
              title={hadPrompt ? 'Zahodit tuto repliku (i další) a nechat AI pokračovat znovu – prompt můžeš před odesláním upravit' : 'Zahodit tuto repliku (i další) bez důvodu a nechat AI pokračovat odsud znovu'}
            >
              🔄 Zkusit znovu
            </button>
          </>
        ) : (
          <>
            <button
              type="button"
              onClick={() => onReject(reason, true, retryPrompt)}
              disabled={busy}
              className="px-3 py-1 rounded-md border border-cyan-300/60 bg-cyan-800/50 hover:bg-cyan-700/60 transition-colors disabled:opacity-50"
            >
              🔄 Odmítnout a pokračovat znovu{hadPrompt ? (retryPrompt.trim() ? ' s promptem' : ' bez promptu') : ''}
            </button>
            <button
              type="button"
              onClick={() => onReject(reason, false, '')}
              disabled={busy}
              className="px-3 py-1 rounded-md border border-red-300/60 hover:border-red-200 transition-colors disabled:opacity-50"
            >
              ❌ Jen odmítnout
            </button>
            <button type="button" onClick={() => setRejecting(false)} disabled={busy} className="px-3 py-1 rounded-md border border-cyan-300/40 hover:border-cyan-200 transition-colors">
              Zpět
            </button>
          </>
        )}
      </div>
    </div>
  )
}
