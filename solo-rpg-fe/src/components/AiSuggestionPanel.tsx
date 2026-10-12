import { useState } from 'react'
import type { AiSuggestion, StoryEntry } from '@solo-rpg/shared'
import { inputClass } from '../utils/forms'

interface SpeakerCharacter {
  id: string
  /** Celé jméno (identita v záznamu) */
  name: string
  nickname: string
}

interface SpeakerNarrator {
  id: string
  name: string
}

interface AiSuggestionPanelProps {
  suggestion: AiSuggestion
  /** Postavy aktuální scény + vypravěči hry, na které lze repliku přepsat */
  speakerOptions: { characters: SpeakerCharacter[]; narrators: SpeakerNarrator[] }
  /** Probíhá accept/reject/regenerace */
  busy: boolean
  /** Přijetí aktuální (první zbývající) repliky – `last` = byla poslední, návrh je tím vyřízen */
  onAccept: (entry: StoryEntry, last: boolean) => void
  /** Odmítnutí aktuální repliky a všech dalších; `regenerate` = hned nechat AI pokračovat od tohoto místa, `prompt` = (upravený) prompt pro nový pokus ('' = bez promptu) */
  onReject: (reason: string, regenerate: boolean, prompt: string) => void
  /** Ztmavit podklad (při zesvětleném pozadí) */
  darken?: boolean
}

/** Hodnota selectu mluvčího: `c:<celé jméno>` / `n:<jméno vypravěče>` */
const speakerValue = (entry: StoryEntry) => (entry.characterName !== null ? `c:${entry.characterName}` : `n:${entry.narratorName ?? ''}`)

/**
 * Náhled návrhu AI vypravěče pod příběhem – hodnotí se **po replikách**: zobrazí se vždy první zbývající replika,
 * hráč ji může upravit (text, mluvčí) a Přijmout (zapíše se do scény, ukáže se další) / Odmítnout (ta i všechny další
 * se zahodí; důvod jde do dalšího pokusu) / Zkusit znovu (AI pokračuje od tohoto místa).
 * Stav editace žije v komponentě – rodič ji remountuje přes `key` z id návrhu a id repliky.
 */
export default function AiSuggestionPanel({ suggestion, speakerOptions, busy, onAccept, onReject, darken }: AiSuggestionPanelProps) {
  const [entry, setEntry] = useState<StoryEntry>(suggestion.entries[0])
  const [editing, setEditing] = useState(false)
  const [rejecting, setRejecting] = useState(false)
  const [reason, setReason] = useState('')
  /** Prompt pro opravný pokus – předvyplněný promptem tohoto návrhu; smazání = další pokus bez promptu */
  const [retryPrompt, setRetryPrompt] = useState(suggestion.promptEntry?.text ?? '')
  const [showContext, setShowContext] = useState(false)
  const hadPrompt = !!suggestion.promptEntry

  const update = (patch: Partial<StoryEntry>) => setEntry(prev => ({ ...prev, ...patch }))

  const changeSpeaker = (value: string) => {
    if (value.startsWith('c:')) update({ characterName: value.slice(2), narratorName: null })
    else update({ characterName: null, narratorName: value.slice(2) || null })
  }

  const total = suggestion.entries.length
  const remaining = total - 1
  const edited = JSON.stringify(entry) !== JSON.stringify(suggestion.entries[0])
  const speakerLabel = (e: StoryEntry) => {
    if (e.characterName === null) return e.narratorName ?? 'Vypravěč'
    return speakerOptions.characters.find(c => c.name === e.characterName)?.nickname ?? e.characterName
  }
  const knownSpeaker = (e: StoryEntry) =>
    e.characterName === null
      ? speakerOptions.narrators.some(n => n.name === e.narratorName)
      : speakerOptions.characters.some(c => c.name === e.characterName)

  return (
    <div className={`flex-shrink-0 mx-4 mb-2 rounded-lg border border-cyan-500 text-sm text-cyan-50 ${darken ? 'bg-cyan-950/90' : 'bg-cyan-950/80'} max-h-[45vh] flex flex-col`}>
      <div className="flex items-center gap-3 px-4 py-2 border-b border-cyan-500/40">
        <span className="font-semibold">🤖 Návrh pokračování</span>
        <span className="text-cyan-200/70 text-xs">
          {total === 1 ? 'poslední replika' : `replika 1 z ${total} · ${remaining} ${remaining === 1 ? 'další čeká' : remaining < 5 ? 'další čekají' : 'dalších čeká'}`}
          {edited ? ' · upraveno' : ''}
          {suggestion.rejectedReasons.length ? ` · ${suggestion.rejectedReasons.length}. pokus po odmítnutí` : ''}
          {hadPrompt ? ' · s promptem' : ''}
        </span>
        <button
          type="button"
          onClick={() => setShowContext(v => !v)}
          className="ml-auto text-xs text-cyan-200/70 hover:text-cyan-100 underline-offset-2 hover:underline"
          title="Co z kampaně dostala AI do kontextu"
        >
          kontext ({suggestion.contextIncluded.length})
        </button>
      </div>

      {showContext && (
        <div className="px-4 py-2 border-b border-cyan-500/40 text-xs text-cyan-200/80 max-h-32 overflow-y-auto">
          {hadPrompt && (
            <div className="mb-2">
              <span className="font-semibold">💬 Prompt hráče pro tento pokus:</span>
              <p className="whitespace-pre-wrap">{suggestion.promptEntry!.text}</p>
            </div>
          )}
          {suggestion.contextIncluded.length ? (
            <ul className="list-disc pl-4">
              {suggestion.contextIncluded.map(item => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          ) : (
            '(žádné položky kampaně – scéna nemá vazby na nitě, questy, frakce ani lokace)'
          )}
          {suggestion.rejectedReasons.length > 0 && (
            <>
              <div className="mt-2 font-semibold">Důvody odmítnutí předchozích návrhů:</div>
              <ul className="list-disc pl-4">
                {suggestion.rejectedReasons.map((r, i) => (
                  <li key={i}>{r}</li>
                ))}
              </ul>
            </>
          )}
        </div>
      )}

      <div className="overflow-y-auto px-4 py-3">
        {!editing ? (
          <div className="flex flex-col gap-1">
            <div className="flex items-center gap-2">
              <span className={`font-bold ${entry.characterName === null ? 'text-cyan-200' : 'text-amber-200'}`}>
                {entry.characterName === null ? '🎭 ' : ''}{speakerLabel(entry)}{!knownSpeaker(entry) ? ' (neznámý)' : ''}
              </span>
              <button
                type="button"
                onClick={() => setEditing(true)}
                disabled={busy}
                className="text-xs text-cyan-200/60 hover:text-cyan-100"
                title="Upravit text nebo mluvčího před přijetím"
              >
                ✏️ upravit
              </button>
            </div>
            <p className="whitespace-pre-wrap leading-relaxed text-base text-cyan-50">{entry.text}</p>
          </div>
        ) : (
          <div className="flex gap-2 items-start">
            <div className="flex flex-col gap-1 w-40 flex-shrink-0">
              <select
                value={speakerValue(entry)}
                onChange={e => changeSpeaker(e.target.value)}
                disabled={busy}
                className={`${inputClass} py-1 text-xs`}
                title="Mluvčí repliky"
              >
                {!knownSpeaker(entry) && <option value={speakerValue(entry)}>{speakerLabel(entry)} (neznámý)</option>}
                {speakerOptions.narrators.map(n => (
                  <option key={`n:${n.id}`} value={`n:${n.name}`}>
                    🎭 {n.name}
                  </option>
                ))}
                {speakerOptions.characters.map(c => (
                  <option key={`c:${c.id}`} value={`c:${c.name}`}>
                    {c.nickname}
                  </option>
                ))}
              </select>
              <button type="button" onClick={() => setEditing(false)} disabled={busy} className="text-xs text-cyan-200/60 hover:text-cyan-100 self-start">
                hotovo
              </button>
            </div>
            <textarea
              value={entry.text}
              onChange={e => update({ text: e.target.value })}
              disabled={busy}
              autoFocus
              rows={Math.min(10, Math.max(3, entry.text.split('\n').length + Math.ceil(entry.text.length / 120)))}
              className={`${inputClass} flex-1 text-sm leading-snug resize-y`}
            />
          </div>
        )}
      </div>

      <div className="px-4 py-2 border-t border-cyan-500/40 flex flex-col gap-2">
        {rejecting && (
          <div className="flex flex-col gap-2">
            <div className="flex flex-col gap-1">
              <label className="text-xs text-cyan-200/80">
                Proč replika nesedí? (fakt o světě – AI ho dostane při dalším pokusu; může zůstat prázdné)
                {remaining > 0 ? ` Odmítne se i ${remaining} ${remaining === 1 ? 'další' : 'dalších'}.` : ''}
              </label>
              <textarea
                value={reason}
                onChange={e => setReason(e.target.value)}
                disabled={busy}
                rows={2}
                autoFocus
                placeholder="Např. Julia není Klářina kamarádka, znají se jen od vidění."
                className={`${inputClass} text-sm`}
              />
            </div>
            {hadPrompt && (
              <div className="flex flex-col gap-1">
                <label className="text-xs text-cyan-200/80">
                  💬 Prompt pro opravný pokus – uprav, nebo celý smaž, aby AI psala bez promptu
                </label>
                <textarea
                  value={retryPrompt}
                  onChange={e => setRetryPrompt(e.target.value)}
                  disabled={busy}
                  rows={Math.min(6, Math.max(2, retryPrompt.split('\n').length))}
                  className={`${inputClass} text-sm`}
                />
              </div>
            )}
          </div>
        )}
        <div className="flex flex-wrap items-center gap-2">
          {!rejecting ? (
            <>
              <button
                type="button"
                onClick={() => onAccept(entry, remaining === 0)}
                disabled={busy}
                className="px-3 py-1 rounded-md border border-emerald-400 bg-emerald-700/50 hover:bg-emerald-600/60 transition-colors disabled:opacity-50"
                title={remaining > 0 ? 'Zapsat tuto repliku do scény a ukázat další' : 'Zapsat poslední repliku do scény'}
              >
                ✅ Přijmout{edited ? ' upravené' : ''}{remaining > 0 ? ' a další' : ''}
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
    </div>
  )
}
