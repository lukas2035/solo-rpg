import { useEffect, useState } from 'react'
import type { AiMode, AiReview, DirectorState } from '@solo-rpg/shared'
import { inputClass } from '../utils/forms'
import { AI_MODE_LABEL, BEAT_SHORT, OUTCOME_LABEL, PHASE_LABEL, STAKES_LABEL, eventTitle } from '../utils/director'

/** Postava scény pro rozdělení hráč / AI */
export interface AiSceneCharacter {
  /** Celé jméno (hodnota v `aiCharacters`) */
  name: string
  nickname: string
  image: string | null
}

export interface AiSceneSettings {
  enabled: boolean
  /** Celá jména postav hraných AI */
  aiCharacters: string[]
  /** Volitelný doplňující/shrnující popis situace jen pro AI */
  aiPrompt: string
  /** Základní (jen vypravěč + scéna) / pokročilá (kontext kampaně + Režie) */
  aiMode: AiMode
  /** Posílat AI sekci o kostkách a pravidlech hry */
  rulesInAi: boolean
  /** Způsob schvalování textů od AI: panel / inline / auto */
  aiReview: AiReview
}

interface AiSceneModalProps {
  sceneTitle: string
  characters: AiSceneCharacter[]
  settings: AiSceneSettings
  /** Aktuální vypravěč hry (portrét jako URL); null = hra vypravěče nemá */
  narrator: { name: string; image: string | null; hasPrompt: boolean } | null
  /** Stav Režie scény (puls, brief, probíhající událost) – jen informativně pro pokročilý režim; null = nenačteno */
  director: DirectorState | null
  /** Hra má vyplněný popis pravidel pod příběhem (🎲) */
  hasRules: boolean
  /** Uloží nastavení scény (PATCH); chyba se zobrazí v dialogu */
  onSave: (settings: AiSceneSettings) => Promise<void>
  /** Otevře výběr vypravěče */
  onSelectNarrator: () => void
  /** Otevře úpravu aktuálního vypravěče (AI prompt) */
  onEditNarrator: () => void
  /** Otevře dialog pravidel pod příběhem (🎲) */
  onOpenRules: () => void
  /** Ručně vyžádá odpověď AI bez nového záznamu (nastavení se předtím uloží) */
  onGenerate: () => Promise<void>
  /** AI právě generuje odpověď */
  busy: boolean
  onClose: () => void
}

const MODE_HINT: Record<AiMode, string> = {
  basic: 'AI dostane jen výchozí prompt, postavy, popis scény, její dosavadní průběh a pokyny vypravěče. Bez kontextu ostatních scén, questů, nití a bez Režie – vhodné pro klidné scény, kde má vypravěč prostě navázat.',
  advanced: 'Navíc kontext kampaně (shrnutí jiných scén, lokace, questy, nitě, frakce, lore, tajemství) a Režie: puls kampaně, brief pro další beat a události přes více beatů (🎬 vedle 🤖 u vstupu).',
}

const REVIEW_LABEL: Record<AiReview, string> = {
  panel: '📋 Panel',
  inline: '📝 V textu',
  auto: '⚡ Automaticky',
}

const REVIEW_HINT: Record<AiReview, string> = {
  panel: 'Každá replika AI se ukáže v samostatném panelu pod příběhem, kde ji můžeš před přijetím upravit, změnit mluvčího, odmítnout s důvodem nebo nechat vygenerovat znovu.',
  inline: 'Replika se zobrazí rovnou jako běžný text ve scéně a pod ní budou tlačítka Přijmout / Odmítnout / Znovu. Fokus je na Přijmout – stačí stisknout Enter.',
  auto: 'Vše, co AI vrátí, se bez schvalování rovnou zapíše do scény jako běžné texty. Nevyhovující text pak můžeš smazat nebo upravit jako kterýkoli jiný.',
}

/** Souhrn Režie pro pokročilý režim: probíhající událost, beaty, rozpracovaný brief a puls */
function DirectorSummary({ director }: { director: DirectorState | null }) {
  if (!director) {
    return <p className="text-xs opacity-70">Stav režie se načte po uložení pokročilého režimu.</p>
  }
  const { event, brief, pulse } = director
  const nextBeat = event ? event.beats.length + 1 : 1
  return (
    <div className="flex flex-col gap-1.5 text-xs">
      {event ? (
        <div>
          <div className="text-amber-200">
            ⚡ Probíhající událost: <span className="font-semibold">{eventTitle(event)}</span>
            <span className="opacity-70"> · sázky {STAKES_LABEL[event.stakes]} · {event.beats.length === 0 ? 'zatím bez beatů' : `${event.beats.length}. beat odehrán`}, další = {nextBeat}. beat</span>
          </div>
          {event.beats.length > 0 && (
            <div className="opacity-70">
              {event.beats.map((b, i) => (
                <span key={i}>{i > 0 && ' → '}{i + 1}. {BEAT_SHORT[b.beatKind]}{b.outcome ? ` (${OUTCOME_LABEL[b.outcome]})` : ''}</span>
              ))}
            </div>
          )}
        </div>
      ) : (
        <div className="opacity-80">Žádná probíhající událost – další režie může novou založit.</div>
      )}
      <div className="opacity-80">
        {brief
          ? `🎬 Rozpracovaný brief: ${BEAT_SHORT[brief.beatKind]}${brief.eventId && event && brief.eventId === event.id ? ` (${nextBeat}. beat události)` : brief.mode === 'event' ? ' (nová událost)' : ' (pokračování)'} – čeká na „Nechat AI psát“`
          : '🎬 Bez rozpracovaného briefu – 🤖 ho nejdřív připraví.'}
      </div>
      <div className="opacity-70">Puls kampaně (společný pro celou hru): napětí {pulse.tension}/10, fáze {PHASE_LABEL[pulse.phase]}</div>
    </div>
  )
}

/** Dialog AI vypravěče pro aktuální scénu: zapnutí, režim AI, rozdělení postav mezi hráče a AI, pravidla pro AI, ruční pokračování */
export default function AiSceneModal({ sceneTitle, characters, settings, narrator, director, hasRules, onSave, onSelectNarrator, onEditNarrator, onOpenRules, onGenerate, busy, onClose }: AiSceneModalProps) {
  const [enabled, setEnabled] = useState(settings.enabled)
  const [aiCharacters, setAiCharacters] = useState<string[]>(settings.aiCharacters)
  const [aiPrompt, setAiPrompt] = useState(settings.aiPrompt)
  const [aiMode, setAiMode] = useState<AiMode>(settings.aiMode)
  const [rulesInAi, setRulesInAi] = useState(settings.rulesInAi)
  const [aiReview, setAiReview] = useState<AiReview>(settings.aiReview)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const setControl = (name: string, ai: boolean) =>
    setAiCharacters(prev => (ai ? (prev.includes(name) ? prev : [...prev, name]) : prev.filter(n => n !== name)))

  const current = (): AiSceneSettings => ({ enabled, aiCharacters: aiCharacters.filter(n => characters.some(c => c.name === n)), aiPrompt, aiMode, rulesInAi, aiReview })

  const handleSave = async (close: boolean) => {
    if (saving) return false
    setSaving(true)
    setError(null)
    try {
      await onSave(current())
      if (close) onClose()
      return true
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Uložení nastavení AI selhalo.')
      return false
    } finally {
      setSaving(false)
    }
  }

  const handleGenerate = async () => {
    if (busy || saving) return
    if (!(await handleSave(false))) return
    setError(null)
    try {
      await onGenerate()
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Generování odpovědi AI selhalo.')
    }
  }

  const playerCount = characters.length - aiCharacters.filter(n => characters.some(c => c.name === n)).length

  return (
    <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4" onClick={onClose}>
      <form
        onSubmit={(e) => { e.preventDefault(); void handleSave(true) }}
        className="bg-[#111] border-2 border-[var(--accent)]/60 rounded-xl p-6 w-[640px] max-w-full max-h-full overflow-y-auto flex flex-col gap-4"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-xl font-bold text-[var(--accent)]">🤖 AI vypravěč – {sceneTitle}</h2>

        <label className="flex items-center gap-3 cursor-pointer text-left text-sm text-[var(--text)]">
          <input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} className="w-5 h-5 accent-[var(--accent)] cursor-pointer" />
          <span>
            <span className="font-semibold">Zapnout AI pro tuto scénu</span>
            <span className="block text-xs opacity-70">Vedle záložky vypravěče se objeví tlačítko „🤖 AI pokračuje“ – na kliknutí aktuální vypravěč napíše přes OpenRouter další text a ten se uloží do scény.</span>
          </span>
        </label>

        <fieldset className="flex flex-col gap-2 text-left text-sm text-[var(--text)]">
          <legend className="mb-1 font-semibold">Režim AI pro tuto scénu</legend>
          <div className="flex items-start gap-3">
            <div className="flex rounded-md overflow-hidden border border-[var(--accent)]/50 text-xs flex-shrink-0">
              {(['basic', 'advanced'] as AiMode[]).map(mode => (
                <button
                  key={mode}
                  type="button"
                  onClick={() => setAiMode(mode)}
                  className={`px-3 py-1.5 transition-colors ${aiMode === mode ? 'bg-[var(--accent)] text-white' : 'bg-black/50 text-gray-400 hover:text-[var(--text)]'}`}
                >
                  {mode === 'basic' ? '📜' : '🎬'} {AI_MODE_LABEL[mode]}
                </button>
              ))}
            </div>
            <p className="text-xs opacity-70 flex-1">{MODE_HINT[aiMode]}</p>
          </div>
          {aiMode === 'advanced' && (
            <div className="p-3 rounded-lg border border-amber-500/40 bg-amber-950/40 text-amber-50">
              <DirectorSummary director={director} />
            </div>
          )}
        </fieldset>

        <fieldset className="flex flex-col gap-2 text-left text-sm text-[var(--text)]">
          <legend className="mb-1 font-semibold">Schvalování textů od AI</legend>
          <div className="flex items-start gap-3">
            <div className="flex rounded-md overflow-hidden border border-[var(--accent)]/50 text-xs flex-shrink-0">
              {(['panel', 'inline', 'auto'] as AiReview[]).map(mode => (
                <button
                  key={mode}
                  type="button"
                  onClick={() => setAiReview(mode)}
                  className={`px-3 py-1.5 transition-colors ${aiReview === mode ? 'bg-[var(--accent)] text-white' : 'bg-black/50 text-gray-400 hover:text-[var(--text)]'}`}
                >
                  {REVIEW_LABEL[mode]}
                </button>
              ))}
            </div>
            <p className="text-xs opacity-70 flex-1">{REVIEW_HINT[aiReview]}</p>
          </div>
        </fieldset>

        <div className="flex items-start gap-3 text-left text-sm text-[var(--text)]">
          <label className="flex items-start gap-3 cursor-pointer flex-1">
            <input type="checkbox" checked={rulesInAi} onChange={(e) => setRulesInAi(e.target.checked)} className="mt-0.5 w-5 h-5 accent-[var(--accent)] cursor-pointer" />
            <span className="flex-1">
              <span className="font-semibold">Posílat informace o kostkách a pravidlech AI vypravěči</span>
              <span className="block text-xs opacity-70">
                Zapnuto: k požadavku se připojí vysvětlení orákula (hody zapsané v textu) a popis pravidel hry. Vypnuto: vypravěč se o kostkách
                nedozví nic – vhodné pro čistě příběhové scény. Platí v obou režimech AI; shrnutí scény a textový export (📄) dostávají pravidla vždy.
                {!hasRules && <span className="block text-amber-300">Hra zatím nemá popis pravidel – AI dostane jen obecné vysvětlení orákula.</span>}
              </span>
            </span>
          </label>
          <button type="button" onClick={onOpenRules} title="Upravit popis pravidel pod příběhem" className="px-3 py-1.5 rounded-md border border-[var(--accent)]/60 text-[var(--accent)] hover:border-[var(--accent)] hover:bg-black/60 transition-all text-xs flex-shrink-0">
            🎲 Pravidla
          </button>
        </div>

        <div className="flex items-center gap-3 p-3 rounded-lg border border-[var(--accent)]/30 bg-black/40 text-left text-sm text-[var(--text)]">
          <div className="w-12 h-12 flex-shrink-0 rounded-md overflow-hidden border border-[var(--accent)]/50 bg-gray-800 flex items-center justify-center">
            {narrator?.image ? <img src={narrator.image} alt={narrator.name} className="w-full h-full object-cover" /> : <span className="text-lg">🎭</span>}
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-xs opacity-60">Vypravěč, který bude odpovídat</div>
            {narrator ? (
              <div className="font-semibold text-[var(--accent)] truncate">
                {narrator.name}
                <span className={`ml-2 text-xs font-normal ${narrator.hasPrompt ? 'opacity-70' : 'text-amber-300'}`}>
                  {narrator.hasPrompt ? '(má vlastní AI prompt)' : '(bez vlastního AI promptu)'}
                </span>
              </div>
            ) : (
              <div className="text-amber-300">Hra nemá aktuálního vypravěče – bez něj AI nemůže odpovídat.</div>
            )}
          </div>
          {narrator && (
            <button type="button" onClick={onEditNarrator} title="Upravit vypravěče (AI prompt)" className="px-3 py-1.5 rounded-md border border-[var(--accent)]/60 text-[var(--accent)] hover:border-[var(--accent)] hover:bg-black/60 transition-all text-xs">
              ✏️ Prompt
            </button>
          )}
          <button type="button" onClick={onSelectNarrator} className="px-3 py-1.5 rounded-md border border-[var(--accent)]/60 text-[var(--accent)] hover:border-[var(--accent)] hover:bg-black/60 transition-all text-xs">
            🎭 Vybrat
          </button>
        </div>

        <fieldset className="flex flex-col gap-2 text-left text-sm text-[var(--text)]">
          <legend className="mb-1">
            Kdo hraje postavy scény <span className="opacity-60">(já: {playerCount}, AI: {characters.length - playerCount})</span>
          </legend>
          {characters.length === 0 ? (
            <p className="opacity-60 text-xs">Scéna nemá žádné postavy – přidej je v úpravě scény (✏️ u názvu scény).</p>
          ) : (
            <ul className="flex flex-col gap-1.5 max-h-64 overflow-y-auto pr-1">
              {characters.map(c => {
                const ai = aiCharacters.includes(c.name)
                return (
                  <li key={c.name} className="flex items-center gap-3 px-2 py-1.5 rounded-lg border border-[var(--accent)]/30 bg-black/30">
                    <span className="w-8 h-8 rounded overflow-hidden bg-gray-800 flex-shrink-0 flex items-center justify-center text-xs">
                      {c.image ? <img src={c.image} alt="" className="w-full h-full object-cover" /> : c.nickname.slice(0, 1)}
                    </span>
                    <span className="flex-1 font-semibold truncate" title={c.name}>{c.nickname}</span>
                    <div className="flex rounded-md overflow-hidden border border-[var(--accent)]/50 text-xs">
                      <button
                        type="button"
                        onClick={() => setControl(c.name, false)}
                        className={`px-3 py-1 transition-colors ${!ai ? 'bg-[var(--accent)] text-white' : 'bg-black/50 text-gray-400 hover:text-[var(--text)]'}`}
                      >
                        🧑 Já
                      </button>
                      <button
                        type="button"
                        onClick={() => setControl(c.name, true)}
                        className={`px-3 py-1 transition-colors ${ai ? 'bg-[var(--accent)] text-white' : 'bg-black/50 text-gray-400 hover:text-[var(--text)]'}`}
                      >
                        🤖 AI
                      </button>
                    </div>
                  </li>
                )
              })}
            </ul>
          )}
        </fieldset>

        <label className="flex flex-col gap-1 text-left text-sm text-[var(--text)]">
          Doplňující popis situace <span className="opacity-60">(volitelné – shrnutí, co se stalo dřív, co má vypravěč vědět; vidí jen AI, vloží se za popis scény)</span>
          <textarea
            rows={4}
            value={aiPrompt}
            onChange={(e) => setAiPrompt(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && e.ctrlKey) {
                e.preventDefault()
                void handleSave(true)
              }
            }}
            placeholder="např. Postavy právě utekly z klubu Phoenix, Eva je zraněná a nevěří Markovi. Za chvíli dorazí policie…"
            className={`${inputClass} font-mono text-sm resize-y whitespace-pre-wrap`}
          />
        </label>

        {error && (
          <div className="px-3 py-2 rounded-lg bg-red-900/70 border border-red-500 text-sm text-red-100">{error}</div>
        )}

        <div className="flex gap-3 items-center">
          <button
            type="button"
            onClick={() => void handleGenerate()}
            disabled={busy || saving || !narrator}
            title="Uloží nastavení a nechá vypravěče navázat na poslední záznam"
            className="px-4 py-2 rounded-lg border-2 border-dashed border-[var(--accent)] text-[var(--accent)] hover:bg-black/60 hover:border-solid transition-all disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {busy ? 'AI píše…' : '🤖 Nechat AI pokračovat'}
          </button>
          <div className="ml-auto flex gap-3">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-lg border border-[var(--accent)]/40 text-[var(--text)] hover:border-[var(--accent)] transition-colors"
            >
              Zrušit
            </button>
            <button
              type="submit"
              disabled={saving}
              className="px-4 py-2 rounded-lg bg-[var(--accent)] text-white font-semibold hover:opacity-80 transition-opacity disabled:opacity-50"
            >
              {saving ? 'Ukládám…' : 'Uložit'}
            </button>
          </div>
        </div>
      </form>
    </div>
  )
}
