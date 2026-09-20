import { useEffect, useState } from 'react'
import type { SceneImportAmbiguity, SceneImportResponse } from '@solo-rpg/shared'
import { inputClass } from '../utils/forms'

interface ImportTranscriptModalProps {
  sceneTitle: string
  /**
   * Pošle text na BE, který ho rozdělí na záznamy a připíše do scény. Když vrátí neprázdné `ambiguous`, nic se neuložilo –
   * dialog nechá hráče vybrat postavy a zavolá import znovu s `resolutions` (jméno v textu → celé jméno postavy).
   */
  onImport: (text: string, resolutions?: Record<string, string>) => Promise<SceneImportResponse>
  onClose: () => void
}

/**
 * Dialog „Vložit odehraný text“: hráč sem vloží přepis ze schránky (např. z Notionu) ve tvaru `**Jméno**: replika`
 * a BE ho rozdělí na záznamy podle mluvčích – víceřádkové repliky jako markdown, neznámá tučná jména jako dočasné postavy.
 * Jméno odpovídající více postavám (dvě Kláry) se řeší výběrem postavy přímo v dialogu.
 */
export default function ImportTranscriptModal({ sceneTitle, onImport, onClose }: ImportTranscriptModalProps) {
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  /** Nejednoznačná jména z posledního pokusu a hráčova volba (celé jméno postavy) pro každé z nich */
  const [ambiguous, setAmbiguous] = useState<SceneImportAmbiguity[]>([])
  const [resolutions, setResolutions] = useState<Record<string, string>>({})

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && !busy) onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose, busy])

  const unresolved = ambiguous.filter(a => !resolutions[a.name])

  const handleSubmit = async (e?: React.FormEvent) => {
    e?.preventDefault()
    if (busy) return
    if (!text.trim()) {
      setError('Vlož text, který se má do scény přidat.')
      return
    }
    if (unresolved.length) {
      setError(`Vyber postavu pro: ${unresolved.map(a => `„${a.name}“`).join(', ')}.`)
      return
    }
    setBusy(true)
    setError(null)
    try {
      const result = await onImport(text, ambiguous.length ? resolutions : undefined)
      if (result.ambiguous.length) {
        // BE hlásí jen jména bez rozhodnutí → přidat k výběru, už zvolená zůstávají
        setAmbiguous(prev => [...prev, ...result.ambiguous.filter(a => !prev.some(p => p.name === a.name))])
        setError(null)
        return
      }
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Import textu selhal.')
    } finally {
      setBusy(false)
    }
  }

  const handleTextChange = (next: string) => {
    setText(next)
    // Jiný text = jiná jména; výběr postav platí až pro další pokus
    if (ambiguous.length) {
      setAmbiguous([])
      setResolutions({})
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4" onClick={() => { if (!busy) onClose() }}>
      <form
        onSubmit={handleSubmit}
        className="bg-[#111] border-2 border-[var(--accent)]/60 rounded-xl p-6 w-[760px] max-w-full max-h-full overflow-y-auto flex flex-col gap-4"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-xl font-bold text-[var(--accent)]">📥 Vložit odehraný text do scény „{sceneTitle}“</h2>
        <p className="text-sm text-[var(--text)] opacity-80">
          Vlož přepis ze schránky (např. z Notionu). Každá replika začíná jménem mluvčího a dvojtečkou – <code>**Jméno**: text</code>{' '}
          nebo <code>**Jméno:** text</code> (tučné písmo nevadí). Řádky bez jména navazují na předchozí repliku a uloží se jako
          víceřádkový markdown. Jména se párují na postavy hry (celé jméno i přezdívka) a vypravěče; neznámé tučné jméno vytvoří
          dočasnou postavu, kterou pak můžeš v pásu postav uložit. Záznamy se připíší na konec scény.
        </p>

        <label className="flex flex-col gap-1 text-left text-sm text-[var(--text)]">
          Text přepisu
          <textarea
            rows={16}
            autoFocus
            value={text}
            onChange={(e) => handleTextChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && e.ctrlKey) {
                e.preventDefault()
                void handleSubmit()
              }
            }}
            placeholder={'**Kronikář**: Noc je chladná a ulice prázdné.\n**Aria**: Rozhlédnu se kolem.\nZa rohem vidím mihnout se stín.\n\n**Kronikář:** Stín se zastaví…'}
            className={`${inputClass} font-mono text-sm resize-y whitespace-pre-wrap`}
          />
        </label>

        {ambiguous.length > 0 && (
          <fieldset className="flex flex-col gap-3 text-left text-sm text-[var(--text)] border border-amber-400/60 rounded-lg p-3 bg-amber-900/20">
            <legend className="px-1 font-semibold text-amber-300">Nejednoznačná jména – vyber, o kterou postavu jde</legend>
            {ambiguous.map(a => (
              <div key={a.name} className="flex flex-col gap-1">
                <span>
                  „<span className="font-semibold">{a.name}</span>“ odpovídá více postavám:
                </span>
                <div className="flex flex-wrap gap-2">
                  {a.candidates.map(candidate => {
                    const checked = resolutions[a.name] === candidate
                    return (
                      <label
                        key={candidate}
                        className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border cursor-pointer select-none transition-colors ${
                          checked ? 'border-[var(--accent)] bg-[var(--accent)]/15' : 'border-[var(--accent)]/30 opacity-80 hover:opacity-100'
                        }`}
                      >
                        <input
                          type="radio"
                          name={`ambiguous-${a.name}`}
                          checked={checked}
                          onChange={() => setResolutions(prev => ({ ...prev, [a.name]: candidate }))}
                          className="accent-[var(--accent)]"
                        />
                        {candidate}
                      </label>
                    )
                  })}
                </div>
              </div>
            ))}
            <p className="text-xs opacity-70">Zatím se nic neuložilo – po výběru klikni znovu na „Přidat do scény“.</p>
          </fieldset>
        )}

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
            disabled={busy || unresolved.length > 0}
            title="Ctrl+Enter"
            className="px-4 py-2 rounded-lg bg-[var(--accent)] text-white font-semibold hover:opacity-80 transition-opacity disabled:opacity-50"
          >
            {busy ? 'Přidávám…' : 'Přidat do scény'}
          </button>
        </div>
      </form>
    </div>
  )
}
