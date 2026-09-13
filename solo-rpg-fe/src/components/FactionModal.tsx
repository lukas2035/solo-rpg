import { useEffect, useMemo, useRef, useState } from 'react'
import type { Faction, FactionRelation, FactionStance, FactionStatus, FactionType, StoryThread } from '@solo-rpg/shared'
import ChipGroup from './ChipGroup'
import EntityChecklist, { type EntityOption } from './EntityChecklist'
import ImageDropField from './ImageDropField'
import { inputClass, selectAll } from '../utils/forms'
import {
  FACTION_STANCES,
  FACTION_STANCE_CLASS,
  FACTION_STANCE_HINTS,
  FACTION_STANCE_LABELS,
  FACTION_STATUSES,
  FACTION_STATUS_CLASS,
  FACTION_STATUS_HINTS,
  FACTION_STATUS_LABELS,
  FACTION_TYPES,
  FACTION_TYPE_ICONS,
  FACTION_TYPE_LABELS,
} from '../utils/factions'
import { THREAD_STATUS_LABELS, THREAD_TYPE_ICONS } from '../utils/threads'

/** Hodnoty formuláře; `emblem` = undefined → beze změny, null → odstranit, string → nový (data:/http URL) */
export interface FactionFormValues {
  title: string
  type: FactionType
  status: FactionStatus
  stance: FactionStance
  leader: string | null
  parentFaction: string | null
  goals: string[]
  characters: string[]
  relations: FactionRelation[]
  description: string
  secrets: string
  emblem: string | null | undefined
}

/** Vztah uložený u jiné frakce, který míří na tuto (zobrazuje se jen pro čtení) */
export interface IncomingRelation {
  from: Faction
  relation: FactionRelation
}

interface FactionModalProps {
  /** Upravovaná frakce; null = vytvoření nové */
  faction: Faction | null
  /** Aktuální emblém jako URL použitelná v <img> */
  emblem: string | null
  allCharacters: EntityOption[]
  /** Ostatní frakce hry (bez upravované) */
  otherFactions: Faction[]
  /** Dopočítané: podfrakce, příchozí vztahy, nitě odkazující na frakci */
  subfactions: Faction[]
  incomingRelations: IncomingRelation[]
  relatedThreads: StoryThread[]
  onSubmit: (values: FactionFormValues) => Promise<void>
  onDelete?: () => Promise<void>
  /** Otevře úpravu jiné frakce (příchozí vztah, podfrakce, rodič) */
  onOpenFaction?: (faction: Faction) => void
  onOpenThread?: (thread: StoryThread) => void
  onClose: () => void
}

/** Dialog pro vytvoření a úpravu frakce */
export default function FactionModal({
  faction, emblem, allCharacters, otherFactions, subfactions, incomingRelations, relatedThreads,
  onSubmit, onDelete, onOpenFaction, onOpenThread, onClose,
}: FactionModalProps) {
  const isEdit = faction !== null
  const [title, setTitle] = useState(faction?.title ?? '')
  const [type, setType] = useState<FactionType | null>(faction?.type ?? null)
  const [status, setStatus] = useState<FactionStatus>(faction?.status ?? 'active')
  const [stance, setStance] = useState<FactionStance>(faction?.stance ?? 'unknown')
  const [leader, setLeader] = useState<string | null>(faction?.leader ?? null)
  const [parentFaction, setParentFaction] = useState<string | null>(faction?.parentFaction ?? null)
  const [goals, setGoals] = useState<string[]>(faction?.goals ?? [])
  const [newGoal, setNewGoal] = useState('')
  const [characters, setCharacters] = useState<string[]>(faction?.characters ?? [])
  const [relations, setRelations] = useState<FactionRelation[]>(faction?.relations ?? [])
  const [description, setDescription] = useState(faction?.description ?? '')
  const [secrets, setSecrets] = useState(faction?.secrets ?? '')
  const [showSecrets, setShowSecrets] = useState(Boolean(faction?.secrets))
  const [editEmblem, setEditEmblem] = useState<string | null>(emblem)
  const [emblemChanged, setEmblemChanged] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const titleRef = useRef<HTMLInputElement | null>(null)
  const goalRef = useRef<HTMLInputElement | null>(null)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const leaderOption = useMemo(() => allCharacters.find(c => c.name === leader) ?? null, [allCharacters, leader])
  /** Frakce, ke kterým ještě není vztah – nabídka pro nový vztah */
  const relationCandidates = useMemo(
    () => otherFactions.filter(f => !relations.some(r => r.faction === f.title)),
    [otherFactions, relations]
  )

  const toggleCharacter = (name: string) =>
    setCharacters(prev => (prev.includes(name) ? prev.filter(n => n !== name) : [...prev, name]))

  // ---- cíle ----
  const addGoal = () => {
    const g = newGoal.trim()
    if (!g) return
    setGoals(prev => [...prev, g])
    setNewGoal('')
    goalRef.current?.focus()
  }
  const updateGoal = (index: number, value: string) => setGoals(prev => prev.map((g, i) => (i === index ? value : g)))
  const removeGoal = (index: number) => setGoals(prev => prev.filter((_, i) => i !== index))
  const moveGoal = (index: number, delta: -1 | 1) =>
    setGoals(prev => {
      const target = index + delta
      if (target < 0 || target >= prev.length) return prev
      const next = [...prev]
      ;[next[index], next[target]] = [next[target], next[index]]
      return next
    })

  // ---- vztahy ----
  const addRelation = (target: string) => {
    if (!target || relations.some(r => r.faction === target)) return
    setRelations(prev => [...prev, { faction: target, stance: 'neutral', note: '' }])
  }
  const updateRelation = (index: number, patch: Partial<FactionRelation>) =>
    setRelations(prev => prev.map((r, i) => (i === index ? { ...r, ...patch } : r)))
  const removeRelation = (index: number) => setRelations(prev => prev.filter((_, i) => i !== index))

  const handleSubmit = async (e?: React.FormEvent) => {
    e?.preventDefault()
    if (saving) return
    const trimmed = title.trim()
    if (!trimmed) {
      setError('Vyplň název frakce.')
      titleRef.current?.focus()
      return
    }
    if (!type) {
      setError('Zvol typ frakce.')
      return
    }
    setSaving(true)
    setError(null)
    try {
      const pendingGoal = newGoal.trim()
      await onSubmit({
        title: trimmed,
        type,
        status,
        stance,
        leader,
        parentFaction,
        goals: [...goals.map(g => g.trim()).filter(Boolean), ...(pendingGoal ? [pendingGoal] : [])],
        characters: characters.filter(n => allCharacters.some(c => c.name === n)),
        relations: relations.map(r => ({ ...r, note: r.note.trim() })),
        description,
        secrets,
        emblem: emblemChanged ? editEmblem : undefined,
      })
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Uložení frakce selhalo.')
      titleRef.current?.focus()
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async () => {
    if (!onDelete || !faction) return
    if (!window.confirm(`Opravdu smazat frakci „${faction.title}“ včetně jejího souboru ve vaultu?`)) return
    setSaving(true)
    try {
      await onDelete()
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Smazání frakce selhalo.')
    } finally {
      setSaving(false)
    }
  }

  const stanceBadge = (s: FactionStance) => (
    <span className={`px-2 py-0.5 rounded-full border text-xs font-semibold ${FACTION_STANCE_CLASS[s]}`}>{FACTION_STANCE_LABELS[s]}</span>
  )

  const linkButton = (label: string, onClick?: () => void) => (
    <button type="button" onClick={onClick} disabled={!onClick} className="text-[var(--accent)] hover:underline disabled:no-underline disabled:opacity-70 text-left">
      {label}
    </button>
  )

  return (
    <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4" onClick={onClose}>
      <form
        onSubmit={handleSubmit}
        className="bg-[#111] border-2 border-[var(--accent)]/60 rounded-xl p-6 w-[860px] max-w-full max-h-full overflow-y-auto flex flex-col gap-4"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-xl font-bold text-[var(--accent)]">{isEdit ? 'Upravit frakci' : 'Nová frakce'}</h2>

        <div className="flex gap-4 flex-col sm:flex-row">
          <div className="flex-1 flex flex-col gap-4">
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
                placeholder="např. Pražská Camarilla"
                className={inputClass}
              />
            </label>

            <ChipGroup
              label={<>Typ {!type && <span className="opacity-60">(povinný)</span>}</>}
              options={FACTION_TYPES}
              value={type}
              labels={Object.fromEntries(FACTION_TYPES.map(t => [t, `${FACTION_TYPE_ICONS[t]} ${FACTION_TYPE_LABELS[t]}`])) as Record<FactionType, string>}
              onChange={setType}
            />

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <ChipGroup
                label="Stav"
                options={FACTION_STATUSES}
                value={status}
                labels={FACTION_STATUS_LABELS}
                hints={FACTION_STATUS_HINTS}
                onChange={setStatus}
                className={(s, selected) => (selected ? FACTION_STATUS_CLASS[s] : '')}
              />
              <ChipGroup
                label="Postoj k družině"
                options={FACTION_STANCES}
                value={stance}
                labels={FACTION_STANCE_LABELS}
                hints={FACTION_STANCE_HINTS}
                onChange={setStance}
                className={(s, selected) => (selected ? FACTION_STANCE_CLASS[s] : '')}
              />
            </div>
          </div>

          <ImageDropField label="Emblém" value={editEmblem} onChange={(next) => { setEditEmblem(next); setEmblemChanged(true) }} removeLabel="Odebrat emblém" className="sm:w-48" />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <label className="flex flex-col gap-1 text-left text-sm text-[var(--text)]">
            Vůdce <span className="opacity-60">(existující postava; jinak popiš v textu)</span>
            <div className="flex items-center gap-2">
              {leaderOption?.image && <img src={leaderOption.image} alt="" className="w-9 h-9 rounded object-cover flex-shrink-0" />}
              <select value={leader ?? ''} onChange={(e) => setLeader(e.target.value || null)} className={inputClass}>
                <option value="">— neznámý / kolektivní —</option>
                {allCharacters.map(c => <option key={c.name} value={c.name}>{c.label}{c.label !== c.name ? ` (${c.name})` : ''}</option>)}
              </select>
            </div>
          </label>
          <label className="flex flex-col gap-1 text-left text-sm text-[var(--text)]">
            Nadřazená frakce
            <select value={parentFaction ?? ''} onChange={(e) => setParentFaction(e.target.value || null)} className={inputClass}>
              <option value="">— žádná —</option>
              {otherFactions.map(f => <option key={f.id} value={f.title}>{f.title}</option>)}
            </select>
          </label>
        </div>

        {/* Cíle */}
        <fieldset className="flex flex-col gap-2 text-left text-sm text-[var(--text)]">
          <legend className="mb-1">Cíle <span className="opacity-60">({goals.length}; obecné záměry organizace, ne úkoly pro hráče)</span></legend>
          {goals.length > 0 && (
            <ol className="flex flex-col gap-1.5">
              {goals.map((g, i) => (
                <li key={i} className="flex items-center gap-1.5">
                  <span className="w-5 text-right opacity-50 text-xs">{i + 1}.</span>
                  <input type="text" value={g} onChange={(e) => updateGoal(i, e.target.value)} className={`${inputClass} py-1 flex-1`} />
                  <button type="button" onClick={() => moveGoal(i, -1)} disabled={i === 0} title="Posunout výš" className="w-7 h-7 rounded-md border border-[var(--accent)]/40 hover:border-[var(--accent)] disabled:opacity-30">↑</button>
                  <button type="button" onClick={() => moveGoal(i, 1)} disabled={i === goals.length - 1} title="Posunout níž" className="w-7 h-7 rounded-md border border-[var(--accent)]/40 hover:border-[var(--accent)] disabled:opacity-30">↓</button>
                  <button type="button" onClick={() => removeGoal(i)} title="Odebrat cíl" className="w-7 h-7 rounded-md border border-red-500/50 text-red-300 hover:border-red-400">✕</button>
                </li>
              ))}
            </ol>
          )}
          <div className="flex items-center gap-1.5">
            <span className="w-5" />
            <input
              ref={goalRef}
              type="text"
              value={newGoal}
              onChange={(e) => setNewGoal(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addGoal() } }}
              placeholder="Nový cíl… (Enter přidá)"
              className={`${inputClass} py-1 flex-1`}
            />
            <button type="button" onClick={addGoal} disabled={!newGoal.trim()} className="px-3 h-7 rounded-md border border-[var(--accent)]/60 text-[var(--accent)] hover:bg-black/60 disabled:opacity-30">+ Přidat</button>
          </div>
        </fieldset>

        <EntityChecklist legend="Důležité postavy" options={allCharacters} selected={characters} onToggle={toggleCharacter} emptyText="Hra zatím nemá žádné postavy." />

        {/* Vztahy k jiným frakcím */}
        <fieldset className="flex flex-col gap-2 text-left text-sm text-[var(--text)]">
          <legend className="mb-1">Vztahy k jiným frakcím <span className="opacity-60">({relations.length + incomingRelations.length})</span></legend>
          {relations.map((r, i) => (
            <div key={r.faction} className="flex flex-col gap-1.5 rounded-lg border border-[var(--accent)]/30 bg-black/40 p-2">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-semibold flex-1">{r.faction}</span>
                <select
                  value={r.stance}
                  onChange={(e) => updateRelation(i, { stance: e.target.value as FactionStance })}
                  className={`text-xs font-semibold rounded-full border px-2 py-0.5 cursor-pointer bg-black/60 ${FACTION_STANCE_CLASS[r.stance]}`}
                >
                  {FACTION_STANCES.map(s => <option key={s} value={s} className="bg-[#111] text-white">{FACTION_STANCE_LABELS[s]}</option>)}
                </select>
                <button type="button" onClick={() => removeRelation(i)} title="Odebrat vztah" className="w-7 h-7 rounded-md border border-red-500/50 text-red-300 hover:border-red-400">✕</button>
              </div>
              <input
                type="text"
                value={r.note}
                onChange={(e) => updateRelation(i, { note: e.target.value })}
                placeholder="Poznámka ke vztahu (volitelné)"
                className={`${inputClass} py-1 text-xs`}
              />
            </div>
          ))}
          {incomingRelations.map(({ from, relation }) => (
            <div key={from.id} className="flex items-center gap-2 flex-wrap rounded-lg border border-dashed border-[var(--accent)]/25 bg-black/20 p-2 opacity-80" title={relation.note || undefined}>
              <span className="flex-1">
                {linkButton(from.title, onOpenFaction ? () => onOpenFaction(from) : undefined)}
                <span className="opacity-60 text-xs"> · zadáno u této frakce</span>
                {relation.note && <span className="block text-xs opacity-70 truncate">{relation.note}</span>}
              </span>
              {stanceBadge(relation.stance)}
            </div>
          ))}
          {relationCandidates.length > 0 ? (
            <select value="" onChange={(e) => addRelation(e.target.value)} className={`${inputClass} py-1 text-xs`}>
              <option value="">+ Přidat vztah k frakci…</option>
              {relationCandidates.map(f => <option key={f.id} value={f.title}>{f.title}</option>)}
            </select>
          ) : otherFactions.length === 0 && (
            <p className="opacity-60 text-xs">Hra zatím nemá jiné frakce.</p>
          )}
        </fieldset>

        {/* Dopočítané vazby */}
        {isEdit && (subfactions.length > 0 || relatedThreads.length > 0) && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm text-[var(--text)]">
            {subfactions.length > 0 && (
              <div className="flex flex-col gap-1 text-left">
                <span className="opacity-70 text-xs uppercase tracking-wide">Podfrakce</span>
                {subfactions.map(f => <span key={f.id}>{FACTION_TYPE_ICONS[f.type]} {linkButton(f.title, onOpenFaction ? () => onOpenFaction(f) : undefined)}</span>)}
              </div>
            )}
            {relatedThreads.length > 0 && (
              <div className="flex flex-col gap-1 text-left">
                <span className="opacity-70 text-xs uppercase tracking-wide">Související dějové nitě</span>
                {relatedThreads.map(t => (
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
          Popis <span className="opacity-60">(markdown – co frakce je, kde působí, jakou má roli)</span>
          <textarea
            rows={5}
            value={description}
            onFocus={selectAll}
            onChange={(e) => setDescription(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && e.ctrlKey) { e.preventDefault(); void handleSubmit() } }}
            placeholder="Dominantní upírská politická struktura ve městě. Udržuje Maškarádu a svůj vliv nad pražskými Rodnými…"
            className={`${inputClass} font-mono text-sm resize-y whitespace-pre-wrap`}
          />
        </label>

        <div className="flex flex-col gap-1 text-left text-sm text-[var(--text)]">
          <button type="button" onClick={() => setShowSecrets(v => !v)} className="self-start flex items-center gap-2 hover:text-[var(--accent)]">
            <span>{showSecrets ? '▾' : '▸'}</span>
            🔒 Tajemství <span className="opacity-60">(pravda kampaně, kterou družina nemusí znát; v souboru za značkou <code>&lt;!-- secrets --&gt;</code>)</span>
            {!showSecrets && secrets.trim() && <span className="opacity-60 text-xs">· vyplněno</span>}
          </button>
          {showSecrets && (
            <textarea
              rows={4}
              value={secrets}
              onFocus={selectAll}
              onChange={(e) => setSecrets(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && e.ctrlKey) { e.preventDefault(); void handleSubmit() } }}
              placeholder="Frakci tajně financuje Guldas. Běžní členové o tom nevědí…"
              className={`${inputClass} font-mono text-sm resize-y whitespace-pre-wrap border-amber-500/40`}
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
