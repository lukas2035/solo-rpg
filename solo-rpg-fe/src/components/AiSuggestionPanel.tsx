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
  onAccept: (entries: StoryEntry[]) => void
  /** Odmítnutí; `regenerate` = hned nechat AI zkusit znovu */
  onReject: (reason: string, regenerate: boolean) => void
  /** Ztmavit podklad (při zesvětleném pozadí) */
  darken?: boolean
}

/** Hodnota selectu mluvčího: `c:<celé jméno>` / `n:<jméno vypravěče>` */
const speakerValue = (entry: StoryEntry) => (entry.characterName !== null ? `c:${entry.characterName}` : `n:${entry.narratorName ?? ''}`)

/**
 * Náhled návrhu AI vypravěče pod příběhem: repliky lze před přijetím upravit (text, mluvčí, smazat řádek),
 * pak Přijmout / Odmítnout (s důvodem – ten jde do dalšího pokusu) / Zkusit znovu.
 * Stav editace žije v komponentě – rodič ji remountuje přes `key={suggestion.id}`.
 */
export default function AiSuggestionPanel({ suggestion, speakerOptions, busy, onAccept, onReject, darken }: AiSuggestionPanelProps) {
  const [entries, setEntries] = useState<StoryEntry[]>(suggestion.entries)
  const [rejecting, setRejecting] = useState(false)
  const [reason, setReason] = useState('')
  const [showContext, setShowContext] = useState(false)

  const update = (id: string, patch: Partial<StoryEntry>) => setEntries(prev => prev.map(e => (e.id === id ? { ...e, ...patch } : e)))
  const remove = (id: string) => setEntries(prev => prev.filter(e => e.id !== id))

  const changeSpeaker = (id: string, value: string) => {
    if (value.startsWith('c:')) update(id, { characterName: value.slice(2), narratorName: null })
    else update(id, { characterName: null, narratorName: value.slice(2) || null })
  }

  const edited = JSON.stringify(entries) !== JSON.stringify(suggestion.entries)
  const speakerLabel = (entry: StoryEntry) => {
    if (entry.characterName === null) return entry.narratorName ?? 'Vypravěč'
    return speakerOptions.characters.find(c => c.name === entry.characterName)?.nickname ?? entry.characterName
  }
  const knownSpeaker = (entry: StoryEntry) =>
    entry.characterName === null
      ? speakerOptions.narrators.some(n => n.name === entry.narratorName)
      : speakerOptions.characters.some(c => c.name === entry.characterName)

  return (
    <div className={`flex-shrink-0 mx-4 mb-2 rounded-lg border border-cyan-500 text-sm text-cyan-50 ${darken ? 'bg-cyan-950/90' : 'bg-cyan-950/80'} max-h-[45vh] flex flex-col`}>
      <div className="flex items-center gap-3 px-4 py-2 border-b border-cyan-500/40">
        <span className="font-semibold">🤖 Návrh pokračování</span>
        <span className="text-cyan-200/70 text-xs">
          {entries.length} {entries.length === 1 ? 'replika' : entries.length < 5 ? 'repliky' : 'replik'}
          {edited ? ' · upraveno' : ''}
          {suggestion.rejectedReasons.length ? ` · ${suggestion.rejectedReasons.length}. pokus po odmítnutí` : ''}
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

      <div className="overflow-y-auto px-4 py-2 flex flex-col gap-2">
        {entries.length === 0 && <div className="text-cyan-200/70 italic">Všechny repliky byly odebrány – přijetí nic nepřidá.</div>}
        {entries.map(entry => (
          <div key={entry.id} className="flex gap-2 items-start">
            <div className="flex flex-col gap-1 w-40 flex-shrink-0">
              <select
                value={speakerValue(entry)}
                onChange={e => changeSpeaker(entry.id, e.target.value)}
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
              <button
                type="button"
                onClick={() => remove(entry.id)}
                disabled={busy}
                className="text-xs text-cyan-200/60 hover:text-red-300 self-start"
                title="Odebrat repliku z návrhu"
              >
                ✕ odebrat
              </button>
            </div>
            <textarea
              value={entry.text}
              onChange={e => update(entry.id, { text: e.target.value })}
              disabled={busy}
              rows={Math.min(8, Math.max(2, entry.text.split('\n').length + (entry.text.length > 160 ? 1 : 0)))}
              className={`${inputClass} flex-1 text-sm leading-snug resize-y`}
            />
          </div>
        ))}
      </div>

      <div className="px-4 py-2 border-t border-cyan-500/40 flex flex-col gap-2">
        {rejecting && (
          <div className="flex flex-col gap-1">
            <label className="text-xs text-cyan-200/80">Proč návrh nesedí? (fakt o světě – AI ho dostane při dalším pokusu; může zůstat prázdné)</label>
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
        )}
        <div className="flex flex-wrap items-center gap-2">
          {!rejecting ? (
            <>
              <button
                type="button"
                onClick={() => onAccept(entries)}
                disabled={busy}
                className="px-3 py-1 rounded-md border border-emerald-400 bg-emerald-700/50 hover:bg-emerald-600/60 transition-colors disabled:opacity-50"
              >
                ✅ Přijmout{edited ? ' upravené' : ''}
              </button>
              <button
                type="button"
                onClick={() => setRejecting(true)}
                disabled={busy}
                className="px-3 py-1 rounded-md border border-red-300/60 hover:border-red-200 hover:bg-red-900/40 transition-colors disabled:opacity-50"
              >
                ❌ Odmítnout…
              </button>
              <button
                type="button"
                onClick={() => onReject('', true)}
                disabled={busy}
                className="px-3 py-1 rounded-md border border-cyan-300/60 hover:border-cyan-200 transition-colors disabled:opacity-50"
                title="Zahodit návrh bez důvodu a nechat AI zkusit znovu"
              >
                🔄 Zkusit znovu
              </button>
            </>
          ) : (
            <>
              <button
                type="button"
                onClick={() => onReject(reason, true)}
                disabled={busy}
                className="px-3 py-1 rounded-md border border-cyan-300/60 bg-cyan-800/50 hover:bg-cyan-700/60 transition-colors disabled:opacity-50"
              >
                🔄 Odmítnout a zkusit znovu
              </button>
              <button
                type="button"
                onClick={() => onReject(reason, false)}
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
