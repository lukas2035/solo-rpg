import { useEffect, useMemo, useRef, useState } from 'react'
import type { ObjectiveStatus, Quest, QuestInput, QuestObjectiveInput, QuestStatus, QuestType, StoryThread } from '@solo-rpg/shared'
import { questProgress } from '@solo-rpg/shared'
import ChipGroup from './ChipGroup'
import EntityChecklist, { type EntityOption } from './EntityChecklist'
import { ProgressBar } from './QuestsPanel'
import { inputClass, selectAll } from '../utils/forms'
import {
  OBJECTIVE_STATUSES,
  OBJECTIVE_STATUS_CLASS,
  OBJECTIVE_STATUS_ICONS,
  OBJECTIVE_STATUS_LABELS,
  QUEST_STATUSES,
  QUEST_STATUS_CLASS,
  QUEST_STATUS_HINTS,
  QUEST_STATUS_LABELS,
  QUEST_TYPES,
  QUEST_TYPE_HINTS,
  QUEST_TYPE_ICONS,
  QUEST_TYPE_LABELS,
} from '../utils/quests'
import { THREAD_STATUS_LABELS, THREAD_TYPE_ICONS } from '../utils/threads'

/** Cíl ve formuláři; `id` chybí u nově přidaných (přidělí BE), `key` je jen pro React */
interface ObjectiveDraft extends QuestObjectiveInput {
  key: string
  status: ObjectiveStatus
  optional: boolean
}

interface QuestModalProps {
  /** Upravovaný quest; null = vytvoření nového */
  quest: Quest | null
  allCharacters: EntityOption[]
  allFactions: EntityOption[]
  /** Nitě hry (checklist souvisejících nití) */
  allThreads: StoryThread[]
  /** Ostatní questy hry (bez upravovaného) – nabídka nadřazeného questu */
  otherQuests: Quest[]
  /** Dopočítané: podřízené questy */
  childQuests: Quest[]
  onSubmit: (input: QuestInput) => Promise<void>
  onDelete?: () => Promise<void>
  onOpenQuest?: (quest: Quest) => void
  onOpenThread?: (thread: StoryThread) => void
  onClose: () => void
}

let draftCounter = 0
const nextKey = () => `draft-${++draftCounter}`

/** Dialog pro vytvoření a úpravu questu */
export default function QuestModal({
  quest, allCharacters, allFactions, allThreads, otherQuests, childQuests,
  onSubmit, onDelete, onOpenQuest, onOpenThread, onClose,
}: QuestModalProps) {
  const isEdit = quest !== null
  const [title, setTitle] = useState(quest?.title ?? '')
  const [type, setType] = useState<QuestType | null>(quest?.type ?? null)
  const [status, setStatus] = useState<QuestStatus>(quest?.status ?? 'available')
  const [objectives, setObjectives] = useState<ObjectiveDraft[]>(
    () => (quest?.objectives ?? []).map(o => ({ ...o, key: o.id }))
  )
  const [newObjective, setNewObjective] = useState('')
  const [questGiver, setQuestGiver] = useState<string | null>(quest?.questGiver ?? null)
  const [parentQuest, setParentQuest] = useState<string | null>(quest?.parentQuest ?? null)
  const [rewards, setRewards] = useState<string[]>(quest?.rewards ?? [])
  const [newReward, setNewReward] = useState('')
  const [characters, setCharacters] = useState<string[]>(quest?.characters ?? [])
  const [threads, setThreads] = useState<string[]>(quest?.threads ?? [])
  const [factions, setFactions] = useState<string[]>(quest?.factions ?? [])
  const [description, setDescription] = useState(quest?.description ?? '')
  const [outcome, setOutcome] = useState(quest?.outcome ?? '')
  const [notes, setNotes] = useState(quest?.notes ?? '')
  const [showNotes, setShowNotes] = useState(Boolean(quest?.notes))
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const titleRef = useRef<HTMLInputElement | null>(null)
  const objectiveRef = useRef<HTMLInputElement | null>(null)
  const rewardRef = useRef<HTMLInputElement | null>(null)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const giverOption = useMemo(() => allCharacters.find(c => c.name === questGiver) ?? null, [allCharacters, questGiver])
  const threadOptions = useMemo<EntityOption[]>(
    () => allThreads.map(t => ({ name: t.title, label: t.title, image: null, icon: THREAD_TYPE_ICONS[t.type] })),
    [allThreads]
  )
  const closedStatus = status === 'completed' || status === 'failed' || status === 'abandoned'

  const toggleIn = (setter: React.Dispatch<React.SetStateAction<string[]>>) => (name: string) =>
    setter(prev => (prev.includes(name) ? prev.filter(n => n !== name) : [...prev, name]))

  // ---- cíle ----
  const addObjective = () => {
    const t = newObjective.trim()
    if (!t) return
    setObjectives(prev => [...prev, { key: nextKey(), title: t, status: 'pending', optional: false }])
    setNewObjective('')
    objectiveRef.current?.focus()
  }
  const updateObjective = (index: number, patch: Partial<ObjectiveDraft>) =>
    setObjectives(prev => prev.map((o, i) => (i === index ? { ...o, ...patch } : o)))
  const removeObjective = (index: number) => setObjectives(prev => prev.filter((_, i) => i !== index))
  const moveIn = <T,>(setter: React.Dispatch<React.SetStateAction<T[]>>) => (index: number, delta: -1 | 1) =>
    setter(prev => {
      const target = index + delta
      if (target < 0 || target >= prev.length) return prev
      const next = [...prev]
      ;[next[index], next[target]] = [next[target], next[index]]
      return next
    })
  const moveObjective = moveIn(setObjectives)
  /** Klik na značku stavu: čeká → řešíme → splněný → čeká (neúspěšný/přeskočený jen přes select) */
  const cycleObjective = (index: number) => {
    const order: ObjectiveStatus[] = ['pending', 'active', 'completed']
    setObjectives(prev => prev.map((o, i) => {
      if (i !== index) return o
      const position = order.indexOf(o.status)
      return { ...o, status: position === -1 ? 'pending' : order[(position + 1) % order.length] }
    }))
  }

  // ---- odměny ----
  const addReward = () => {
    const r = newReward.trim()
    if (!r) return
    setRewards(prev => [...prev, r])
    setNewReward('')
    rewardRef.current?.focus()
  }
  const updateReward = (index: number, value: string) => setRewards(prev => prev.map((r, i) => (i === index ? value : r)))
  const removeReward = (index: number) => setRewards(prev => prev.filter((_, i) => i !== index))
  const moveReward = moveIn(setRewards)

  const handleSubmit = async (e?: React.FormEvent) => {
    e?.preventDefault()
    if (saving) return
    const trimmed = title.trim()
    if (!trimmed) {
      setError('Vyplň název questu.')
      titleRef.current?.focus()
      return
    }
    if (!type) {
      setError('Zvol typ questu.')
      return
    }
    setSaving(true)
    setError(null)
    try {
      const pendingObjective = newObjective.trim()
      const pendingReward = newReward.trim()
      await onSubmit({
        title: trimmed,
        type,
        status,
        objectives: [
          ...objectives.map(({ key: _key, ...o }) => ({ ...o, title: o.title.trim() })).filter(o => o.title),
          ...(pendingObjective ? [{ title: pendingObjective, status: 'pending' as const, optional: false }] : []),
        ],
        questGiver,
        parentQuest,
        rewards: [...rewards.map(r => r.trim()).filter(Boolean), ...(pendingReward ? [pendingReward] : [])],
        characters: characters.filter(n => allCharacters.some(c => c.name === n)),
        threads: threads.filter(n => allThreads.some(t => t.title === n)),
        factions: factions.filter(n => allFactions.some(f => f.name === n)),
        description,
        outcome,
        notes,
      })
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Uložení questu selhalo.')
      titleRef.current?.focus()
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async () => {
    if (!onDelete || !quest) return
    if (!window.confirm(`Opravdu smazat quest „${quest.title}“ včetně jeho souboru ve vaultu? Podřízené questy zůstanou.`)) return
    setSaving(true)
    try {
      await onDelete()
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Smazání questu selhalo.')
    } finally {
      setSaving(false)
    }
  }

  const linkButton = (label: string, onClick?: () => void) => (
    <button type="button" onClick={onClick} disabled={!onClick} className="text-[var(--accent)] hover:underline disabled:no-underline disabled:opacity-70 text-left">
      {label}
    </button>
  )

  const parentQuestObj = otherQuests.find(q => q.title === parentQuest) ?? null
  /** Cíle v tvaru pro výpočet postupu (id nahrazuje klíč návrhu) */
  const progressObjectives = objectives.map(o => ({ id: o.key, title: o.title, status: o.status, optional: o.optional }))
  const hasProgress = questProgress(progressObjectives).total > 0
  const linkedThreads = allThreads.filter(t => threads.includes(t.title))

  return (
    <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4" onClick={onClose}>
      <form
        onSubmit={handleSubmit}
        className="bg-[#111] border-2 border-[var(--accent)]/60 rounded-xl p-6 w-[860px] max-w-full max-h-full overflow-y-auto flex flex-col gap-4"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-xl font-bold text-[var(--accent)] flex items-center gap-3">
          {isEdit ? 'Upravit quest' : 'Nový quest'}
          {hasProgress && <ProgressBar objectives={progressObjectives} className="text-sm font-normal text-[var(--text)]" />}
        </h2>

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
            placeholder="např. Zjistit, komu patří Phoenix"
            className={inputClass}
          />
        </label>

        <ChipGroup
          label={<>Typ {!type && <span className="opacity-60">(povinný)</span>}</>}
          options={QUEST_TYPES}
          value={type}
          labels={Object.fromEntries(QUEST_TYPES.map(t => [t, `${QUEST_TYPE_ICONS[t]} ${QUEST_TYPE_LABELS[t]}`])) as Record<QuestType, string>}
          hints={QUEST_TYPE_HINTS}
          onChange={setType}
        />

        <ChipGroup
          label="Stav"
          options={QUEST_STATUSES}
          value={status}
          labels={QUEST_STATUS_LABELS}
          hints={QUEST_STATUS_HINTS}
          onChange={setStatus}
          className={(s, selected) => (selected ? QUEST_STATUS_CLASS[s] : '')}
        />

        <label className="flex flex-col gap-1 text-left text-sm text-[var(--text)]">
          Popis <span className="opacity-60">(markdown – co je cílem, proč quest vznikl, co o něm postavy vědí)</span>
          <textarea
            rows={4}
            value={description}
            onFocus={selectAll}
            onChange={(e) => setDescription(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && e.ctrlKey) { e.preventDefault(); void handleSubmit() } }}
            placeholder="Královský rádce žádá družinu, aby zjistila, proč se kmeny na severním ostrově začínají spojovat…"
            className={`${inputClass} font-mono text-sm resize-y whitespace-pre-wrap`}
          />
        </label>

        {/* Cíle */}
        <fieldset className="flex flex-col gap-2 text-left text-sm text-[var(--text)]">
          <legend className="mb-1">Cíle <span className="opacity-60">({objectives.length}; klik na značku přepíná čeká → řešíme → splněný, nemusí se plnit v pořadí)</span></legend>
          {objectives.length > 0 && (
            <ol className="flex flex-col gap-1.5">
              {objectives.map((o, i) => (
                <li key={o.key} className={`flex items-center gap-1.5 ${o.status === 'completed' || o.status === 'skipped' || o.status === 'failed' ? 'opacity-70' : ''}`}>
                  <button
                    type="button"
                    onClick={() => cycleObjective(i)}
                    title={OBJECTIVE_STATUS_LABELS[o.status]}
                    className={`w-7 h-7 rounded-md border border-[var(--accent)]/40 hover:border-[var(--accent)] text-base leading-none ${OBJECTIVE_STATUS_CLASS[o.status]}`}
                  >
                    {OBJECTIVE_STATUS_ICONS[o.status]}
                  </button>
                  <input
                    type="text"
                    value={o.title}
                    onChange={(e) => updateObjective(i, { title: e.target.value })}
                    className={`${inputClass} py-1 flex-1 ${o.status === 'completed' ? 'line-through' : ''}`}
                  />
                  <select
                    value={o.status}
                    onChange={(e) => updateObjective(i, { status: e.target.value as ObjectiveStatus })}
                    title="Stav cíle"
                    className={`${inputClass} py-1 text-xs w-32`}
                  >
                    {OBJECTIVE_STATUSES.map(s => <option key={s} value={s}>{OBJECTIVE_STATUS_LABELS[s]}</option>)}
                  </select>
                  <label className="flex items-center gap-1 text-xs opacity-80 whitespace-nowrap cursor-pointer" title="Volitelný cíl se nepočítá do postupu">
                    <input type="checkbox" checked={o.optional} onChange={(e) => updateObjective(i, { optional: e.target.checked })} className="accent-[var(--accent)]" />
                    volit.
                  </label>
                  <button type="button" onClick={() => moveObjective(i, -1)} disabled={i === 0} title="Posunout výš" className="w-7 h-7 rounded-md border border-[var(--accent)]/40 hover:border-[var(--accent)] disabled:opacity-30">↑</button>
                  <button type="button" onClick={() => moveObjective(i, 1)} disabled={i === objectives.length - 1} title="Posunout níž" className="w-7 h-7 rounded-md border border-[var(--accent)]/40 hover:border-[var(--accent)] disabled:opacity-30">↓</button>
                  <button type="button" onClick={() => removeObjective(i)} title="Odebrat cíl" className="w-7 h-7 rounded-md border border-red-500/50 text-red-300 hover:border-red-400">✕</button>
                </li>
              ))}
            </ol>
          )}
          <div className="flex items-center gap-1.5">
            <span className="w-7" />
            <input
              ref={objectiveRef}
              type="text"
              value={newObjective}
              onChange={(e) => setNewObjective(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addObjective() } }}
              placeholder="Nový cíl… (Enter přidá)"
              className={`${inputClass} py-1 flex-1`}
            />
            <button type="button" onClick={addObjective} disabled={!newObjective.trim()} className="px-3 h-7 rounded-md border border-[var(--accent)]/60 text-[var(--accent)] hover:bg-black/60 disabled:opacity-30">+ Přidat</button>
          </div>
        </fieldset>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <label className="flex flex-col gap-1 text-left text-sm text-[var(--text)]">
            Zadavatel <span className="opacity-60">(existující postava; quest ze situace zadavatele nemá)</span>
            <div className="flex items-center gap-2">
              {giverOption?.image && <img src={giverOption.image} alt="" className="w-9 h-9 rounded object-cover flex-shrink-0" />}
              <select value={questGiver ?? ''} onChange={(e) => setQuestGiver(e.target.value || null)} className={inputClass}>
                <option value="">— žádný —</option>
                {allCharacters.map(c => <option key={c.name} value={c.name}>{c.label}{c.label !== c.name ? ` (${c.name})` : ''}</option>)}
              </select>
            </div>
          </label>
          <label className="flex flex-col gap-1 text-left text-sm text-[var(--text)]">
            Nadřazený quest <span className="opacity-60">(řetězec questů)</span>
            <div className="flex items-center gap-2">
              <select value={parentQuest ?? ''} onChange={(e) => setParentQuest(e.target.value || null)} className={inputClass}>
                <option value="">— žádný —</option>
                {otherQuests.map(q => <option key={q.id} value={q.title}>{QUEST_TYPE_ICONS[q.type]} {q.title}</option>)}
              </select>
              {parentQuestObj && onOpenQuest && (
                <button type="button" onClick={() => onOpenQuest(parentQuestObj)} title="Otevřít nadřazený quest" className="w-9 h-9 rounded-md border border-[var(--accent)]/40 hover:border-[var(--accent)] flex-shrink-0">↗</button>
              )}
            </div>
          </label>
        </div>

        {/* Odměny */}
        <fieldset className="flex flex-col gap-2 text-left text-sm text-[var(--text)]">
          <legend className="mb-1">Odměny <span className="opacity-60">({rewards.length}; prostý text – zlaťáky, přízeň, přístup, informace…)</span></legend>
          {rewards.length > 0 && (
            <ul className="flex flex-col gap-1.5">
              {rewards.map((r, i) => (
                <li key={i} className="flex items-center gap-1.5">
                  <span className="w-5 text-right opacity-50 text-xs">•</span>
                  <input type="text" value={r} onChange={(e) => updateReward(i, e.target.value)} className={`${inputClass} py-1 flex-1`} />
                  <button type="button" onClick={() => moveReward(i, -1)} disabled={i === 0} title="Posunout výš" className="w-7 h-7 rounded-md border border-[var(--accent)]/40 hover:border-[var(--accent)] disabled:opacity-30">↑</button>
                  <button type="button" onClick={() => moveReward(i, 1)} disabled={i === rewards.length - 1} title="Posunout níž" className="w-7 h-7 rounded-md border border-[var(--accent)]/40 hover:border-[var(--accent)] disabled:opacity-30">↓</button>
                  <button type="button" onClick={() => removeReward(i)} title="Odebrat odměnu" className="w-7 h-7 rounded-md border border-red-500/50 text-red-300 hover:border-red-400">✕</button>
                </li>
              ))}
            </ul>
          )}
          <div className="flex items-center gap-1.5">
            <span className="w-5" />
            <input
              ref={rewardRef}
              type="text"
              value={newReward}
              onChange={(e) => setNewReward(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addReward() } }}
              placeholder="Nová odměna… (Enter přidá)"
              className={`${inputClass} py-1 flex-1`}
            />
            <button type="button" onClick={addReward} disabled={!newReward.trim()} className="px-3 h-7 rounded-md border border-[var(--accent)]/60 text-[var(--accent)] hover:bg-black/60 disabled:opacity-30">+ Přidat</button>
          </div>
        </fieldset>

        <EntityChecklist legend="Související postavy" options={allCharacters} selected={characters} onToggle={toggleIn(setCharacters)} emptyText="Hra zatím nemá žádné postavy." />
        <EntityChecklist legend="Související dějové nitě" options={threadOptions} selected={threads} onToggle={toggleIn(setThreads)} emptyText="Hra zatím nemá žádné dějové nitě." columns={2} />
        <EntityChecklist legend="Související frakce" options={allFactions} selected={factions} onToggle={toggleIn(setFactions)} emptyText="Hra zatím nemá žádné frakce." />

        {/* Dopočítané vazby */}
        {isEdit && (childQuests.length > 0 || linkedThreads.length > 0) && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm text-[var(--text)]">
            {childQuests.length > 0 && (
              <div className="flex flex-col gap-1 text-left">
                <span className="opacity-70 text-xs uppercase tracking-wide">Navazující questy</span>
                {childQuests.map(q => (
                  <span key={q.id} title={QUEST_STATUS_LABELS[q.status]}>
                    {QUEST_TYPE_ICONS[q.type]} {linkButton(q.title, onOpenQuest ? () => onOpenQuest(q) : undefined)}
                    <span className="opacity-50 text-xs"> · {QUEST_STATUS_LABELS[q.status]}</span>
                  </span>
                ))}
              </div>
            )}
            {linkedThreads.length > 0 && (
              <div className="flex flex-col gap-1 text-left">
                <span className="opacity-70 text-xs uppercase tracking-wide">Otevřít nit</span>
                {linkedThreads.map(t => (
                  <span key={t.id} title={THREAD_STATUS_LABELS[t.status]}>
                    {THREAD_TYPE_ICONS[t.type]} {linkButton(t.title, onOpenThread ? () => onOpenThread(t) : undefined)}
                    <span className="opacity-50 text-xs"> · {THREAD_STATUS_LABELS[t.status]}</span>
                  </span>
                ))}
              </div>
            )}
          </div>
        )}

        <label className="flex flex-col gap-1 text-left text-sm text-[var(--text)]">
          Výsledek <span className="opacity-60">(jak quest skutečně dopadl{closedStatus ? '' : ' – hlavně u ukončených'}; v souboru za značkou <code>&lt;!-- outcome --&gt;</code>)</span>
          <textarea
            rows={closedStatus ? 4 : 2}
            value={outcome}
            onFocus={selectAll}
            onChange={(e) => setOutcome(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && e.ctrlKey) { e.preventDefault(); void handleSubmit() } }}
            placeholder="Družina zjistila, že kmeny manipuluje kult z horského kláštera, a vrátila se k rádci s důkazy…"
            className={`${inputClass} font-mono text-sm resize-y whitespace-pre-wrap ${closedStatus ? 'border-emerald-500/40' : ''}`}
          />
        </label>

        <div className="flex flex-col gap-1 text-left text-sm text-[var(--text)]">
          <button type="button" onClick={() => setShowNotes(v => !v)} className="self-start flex items-center gap-2 hover:text-[var(--accent)]">
            <span>{showNotes ? '▾' : '▸'}</span>
            📝 Poznámky <span className="opacity-60">(podezření, plán, co ověřit; v souboru za značkou <code>&lt;!-- notes --&gt;</code>)</span>
            {!showNotes && notes.trim() && <span className="opacity-60 text-xs">· vyplněno</span>}
          </button>
          {showNotes && (
            <textarea
              rows={4}
              value={notes}
              onFocus={selectAll}
              onChange={(e) => setNotes(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && e.ctrlKey) { e.preventDefault(); void handleSubmit() } }}
              placeholder="Kmeny normálně nemají důvod spolupracovat. Něco se děje…"
              className={`${inputClass} font-mono text-sm resize-y whitespace-pre-wrap`}
            />
          )}
        </div>

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
