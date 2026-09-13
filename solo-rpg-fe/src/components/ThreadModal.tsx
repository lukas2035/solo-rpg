import { useEffect, useRef, useState } from 'react'
import type { Quest, StoryThread, ThreadCertainty, ThreadHorizon, ThreadInput, ThreadStatus, ThreadType } from '@solo-rpg/shared'
import ChipGroup from './ChipGroup'
import EntityChecklist, { type EntityOption } from './EntityChecklist'
import { inputClass, selectAll } from '../utils/forms'
import { QUEST_STATUS_LABELS, QUEST_TYPE_ICONS } from '../utils/quests'
import {
  THREAD_CERTAINTIES,
  THREAD_CERTAINTY_HINTS,
  THREAD_CERTAINTY_LABELS,
  THREAD_HORIZONS,
  THREAD_HORIZON_HINTS,
  THREAD_HORIZON_LABELS,
  THREAD_STATUSES,
  THREAD_STATUS_CLASS,
  THREAD_STATUS_HINTS,
  THREAD_STATUS_LABELS,
  THREAD_TYPES,
  THREAD_TYPE_HINTS,
  THREAD_TYPE_ICONS,
  THREAD_TYPE_LABELS,
} from '../utils/threads'

interface ThreadModalProps {
  /** Upravovaná nit; null = vytvoření nové */
  thread: StoryThread | null
  allCharacters: EntityOption[]
  allFactions: EntityOption[]
  /** Názvy scén hry (vazba „vznikla ve scéně“) */
  sceneTitles: string[]
  /** Předvyplněná scéna pro novou nit (aktuální scéna) */
  defaultScene?: string | null
  /** Dopočítané: questy, které na nit odkazují (vazba se edituje u questu) */
  relatedQuests?: Quest[]
  onOpenQuest?: (quest: Quest) => void
  /** Uloží nit; při chybě (např. duplicitní název) vyhodí výjimku s hláškou pro uživatele */
  onSubmit: (input: ThreadInput) => Promise<void>
  onDelete?: () => Promise<void>
  onClose: () => void
}

const DEFAULT_CLOCK_MAX = 6

/** Dialog pro vytvoření a úpravu dějové nitě */
export default function ThreadModal({ thread, allCharacters, allFactions, sceneTitles, defaultScene = null, relatedQuests = [], onOpenQuest, onSubmit, onDelete, onClose }: ThreadModalProps) {
  const isEdit = thread !== null
  const [title, setTitle] = useState(thread?.title ?? '')
  const [type, setType] = useState<ThreadType | null>(thread?.type ?? null)
  const [status, setStatus] = useState<ThreadStatus>(thread?.status ?? 'latent')
  const [horizon, setHorizon] = useState<ThreadHorizon>(thread?.horizon ?? 'short-term')
  const [certainty, setCertainty] = useState<ThreadCertainty>(thread?.certainty ?? 'confirmed')
  const [revealCondition, setRevealCondition] = useState(thread?.revealCondition ?? '')
  const [clockEnabled, setClockEnabled] = useState(thread?.clock !== null && thread?.clock !== undefined)
  const [clockCurrent, setClockCurrent] = useState(thread?.clock?.current ?? 0)
  const [clockMax, setClockMax] = useState(thread?.clock?.max ?? DEFAULT_CLOCK_MAX)
  const [characters, setCharacters] = useState<string[]>(thread?.characters ?? [])
  const [factions, setFactions] = useState<string[]>(thread?.factions ?? [])
  const [scene, setScene] = useState<string | null>(thread ? thread.scene : defaultScene)
  const [description, setDescription] = useState(thread?.description ?? '')
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const titleRef = useRef<HTMLInputElement | null>(null)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const toggleIn = (setter: React.Dispatch<React.SetStateAction<string[]>>) => (name: string) =>
    setter(prev => (prev.includes(name) ? prev.filter(n => n !== name) : [...prev, name]))

  const setClockMaxClamped = (value: number) => {
    const max = Math.min(24, Math.max(1, Math.round(value) || 1))
    setClockMax(max)
    setClockCurrent(c => Math.min(c, max))
  }

  const handleSubmit = async (e?: React.FormEvent) => {
    e?.preventDefault()
    if (saving) return
    const trimmed = title.trim()
    if (!trimmed) {
      setError('Vyplň název dějové nitě.')
      titleRef.current?.focus()
      return
    }
    if (!type) {
      setError('Zvol typ dějové nitě.')
      return
    }
    setSaving(true)
    setError(null)
    try {
      await onSubmit({
        title: trimmed,
        type,
        status,
        horizon,
        certainty,
        revealCondition,
        clock: clockEnabled ? { current: Math.min(clockCurrent, clockMax), max: clockMax } : null,
        characters: characters.filter(n => allCharacters.some(c => c.name === n)),
        factions: factions.filter(n => allFactions.some(f => f.name === n)),
        scene,
        description,
      })
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Uložení dějové nitě selhalo.')
      titleRef.current?.focus()
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async () => {
    if (!onDelete || !thread) return
    if (!window.confirm(`Opravdu smazat dějovou nit „${thread.title}“ včetně jejího souboru ve vaultu?`)) return
    setSaving(true)
    try {
      await onDelete()
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Smazání dějové nitě selhalo.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4" onClick={onClose}>
      <form
        onSubmit={handleSubmit}
        className="bg-[#111] border-2 border-[var(--accent)]/60 rounded-xl p-6 w-[760px] max-w-full max-h-full overflow-y-auto flex flex-col gap-4"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-xl font-bold text-[var(--accent)]">{isEdit ? 'Upravit dějovou nit' : 'Nová dějová nit'}</h2>

        <label className="flex flex-col gap-1 text-left text-sm text-[var(--text)]">
          Název
          <input
            ref={titleRef}
            type="text"
            autoFocus
            value={title}
            onFocus={selectAll}
            onChange={(e) => setTitle(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); void handleSubmit() } }}
            placeholder="např. Někdo si všiml, že se ptáme na relikvii"
            className={inputClass}
          />
        </label>

        <ChipGroup
          label={<>Typ {!type && <span className="opacity-60">(povinný)</span>}</>}
          options={THREAD_TYPES}
          value={type}
          labels={Object.fromEntries(THREAD_TYPES.map(t => [t, `${THREAD_TYPE_ICONS[t]} ${THREAD_TYPE_LABELS[t]}`])) as Record<ThreadType, string>}
          hints={THREAD_TYPE_HINTS}
          onChange={setType}
        />

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <ChipGroup
            label="Stav"
            options={THREAD_STATUSES}
            value={status}
            labels={THREAD_STATUS_LABELS}
            hints={THREAD_STATUS_HINTS}
            onChange={setStatus}
            className={(s, selected) => (selected ? THREAD_STATUS_CLASS[s] : '')}
          />
          <ChipGroup label="Horizont" options={THREAD_HORIZONS} value={horizon} labels={THREAD_HORIZON_LABELS} hints={THREAD_HORIZON_HINTS} onChange={setHorizon} />
          <ChipGroup label="Jistota" options={THREAD_CERTAINTIES} value={certainty} labels={THREAD_CERTAINTY_LABELS} hints={THREAD_CERTAINTY_HINTS} onChange={setCertainty} />
        </div>

        {certainty === 'unresolved' && (
          <label className="flex flex-col gap-1 text-left text-sm text-[var(--text)]">
            Kdy nejistotu vyhodnotit <span className="opacity-60">(jen popis situace, nic se neděje automaticky)</span>
            <input
              type="text"
              value={revealCondition}
              onFocus={selectAll}
              onChange={(e) => setRevealCondition(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); void handleSubmit() } }}
              placeholder="např. Někdo si prohlédne záznam z kamery."
              className={inputClass}
            />
          </label>
        )}

        <fieldset className="flex flex-col gap-2 text-left text-sm text-[var(--text)]">
          <legend className="mb-1 flex items-center gap-2">
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={clockEnabled} onChange={(e) => setClockEnabled(e.target.checked)} className="accent-[var(--accent)]" />
              Hodiny <span className="opacity-60">(postup / eskalace, ručně)</span>
            </label>
          </legend>
          {clockEnabled && (
            <div className="flex flex-wrap items-center gap-3">
              <div className="flex items-center gap-1">
                <button type="button" onClick={() => setClockCurrent(c => Math.max(0, c - 1))} className="w-7 h-7 rounded-md border border-[var(--accent)]/60 text-[var(--accent)] hover:bg-black/60">−</button>
                <span className="font-mono text-base tracking-wider text-[var(--accent)] px-2 select-none">
                  {Array.from({ length: clockMax }, (_, i) => (
                    <button
                      key={i}
                      type="button"
                      title={`Nastavit ${i + 1}`}
                      onClick={() => setClockCurrent(i + 1 === clockCurrent ? i : i + 1)}
                      className="hover:opacity-70"
                    >
                      {i < clockCurrent ? '●' : '○'}
                    </button>
                  ))}
                </span>
                <button type="button" onClick={() => setClockCurrent(c => Math.min(clockMax, c + 1))} className="w-7 h-7 rounded-md border border-[var(--accent)]/60 text-[var(--accent)] hover:bg-black/60">+</button>
              </div>
              <span className="font-mono text-sm">{clockCurrent} / {clockMax}</span>
              <label className="flex items-center gap-2 ml-auto">
                Maximum
                <input
                  type="number"
                  min={1}
                  max={24}
                  value={clockMax}
                  onFocus={selectAll}
                  onChange={(e) => setClockMaxClamped(Number(e.target.value))}
                  className={`${inputClass} w-20 py-1`}
                />
              </label>
            </div>
          )}
        </fieldset>

        <div className="grid grid-cols-1 sm:grid-cols-[1fr_220px] gap-4">
          <EntityChecklist legend="Propojené postavy" options={allCharacters} selected={characters} onToggle={toggleIn(setCharacters)} emptyText="Hra zatím nemá žádné postavy." />
          <label className="flex flex-col gap-1 text-left text-sm text-[var(--text)]">
            Vznikla ve scéně
            <select value={scene ?? ''} onChange={(e) => setScene(e.target.value || null)} className={inputClass}>
              <option value="">— neuvedeno —</option>
              {sceneTitles.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
          </label>
        </div>

        {allFactions.length > 0 && (
          <EntityChecklist legend="Týká se frakcí" options={allFactions} selected={factions} onToggle={toggleIn(setFactions)} emptyText="" />
        )}

        {isEdit && relatedQuests.length > 0 && (
          <div className="flex flex-col gap-1 text-left text-sm text-[var(--text)]">
            <span className="opacity-70 text-xs uppercase tracking-wide">Součást questů <span className="normal-case">(vazba se upravuje u questu)</span></span>
            {relatedQuests.map(q => (
              <span key={q.id} title={QUEST_STATUS_LABELS[q.status]}>
                {QUEST_TYPE_ICONS[q.type]}{' '}
                <button type="button" onClick={onOpenQuest ? () => onOpenQuest(q) : undefined} disabled={!onOpenQuest} className="text-[var(--accent)] hover:underline disabled:no-underline disabled:opacity-70 text-left">
                  {q.title}
                </button>
                <span className="opacity-50 text-xs"> · {QUEST_STATUS_LABELS[q.status]}</span>
              </span>
            ))}
          </div>
        )}

        <label className="flex flex-col gap-1 text-left text-sm text-[var(--text)]">
          Popis <span className="opacity-60">(markdown, tělo souboru v Obsidianu – co nit představuje a proč vznikla)</span>
          <textarea
            rows={6}
            value={description}
            onFocus={selectAll}
            onChange={(e) => setDescription(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && e.ctrlKey) { e.preventDefault(); void handleSubmit() } }}
            placeholder="Marek vypáčil zadní dveře, ale nepodařilo se mu zůstat mimo záběr kamery. Zatím není jisté, zda kamera zachytila použitelný snímek…"
            className={`${inputClass} font-mono text-sm resize-y whitespace-pre-wrap`}
          />
        </label>

        {error && (
          <div className="px-3 py-2 rounded-lg bg-red-900/70 border border-red-500 text-sm text-red-100">{error}</div>
        )}

        <div className="flex gap-3 items-center">
          {isEdit && onDelete && (
            <button
              type="button"
              onClick={handleDelete}
              disabled={saving}
              className="px-4 py-2 rounded-lg border border-red-500/60 text-red-300 hover:border-red-400 hover:text-red-200 transition-colors disabled:opacity-50"
            >
              Smazat
            </button>
          )}
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
              {saving ? 'Ukládám…' : isEdit ? 'Uložit' : 'Vytvořit'}
            </button>
          </div>
        </div>
      </form>
    </div>
  )
}
