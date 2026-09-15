import { useEffect, useRef, useState } from 'react'
import type { LoreEntry, LoreInput, LoreKnowledge, LoreTruth, LoreType } from '@solo-rpg/shared'
import ChipGroup from './ChipGroup'
import EntityChecklist, { type EntityOption } from './EntityChecklist'
import { inputClass, selectAll } from '../utils/forms'
import {
  LORE_KNOWLEDGES,
  LORE_KNOWLEDGE_CLASS,
  LORE_KNOWLEDGE_HINTS,
  LORE_KNOWLEDGE_LABELS,
  LORE_TRUTHS,
  LORE_TRUTH_CLASS,
  LORE_TRUTH_HINTS,
  LORE_TRUTH_LABELS,
  LORE_TYPES,
  LORE_TYPE_HINTS,
  LORE_TYPE_ICONS,
  LORE_TYPE_LABELS,
} from '../utils/lore'

interface LoreModalProps {
  /** Upravovaný záznam; null = vytvoření nového */
  entry: LoreEntry | null
  allCharacters: EntityOption[]
  allLocations: EntityOption[]
  allFactions: EntityOption[]
  allQuests: EntityOption[]
  allThreads: EntityOption[]
  /** Předvyplněná vazba pro nový záznam (např. z detailu lokace) */
  defaultLocations?: string[]
  /** Uloží záznam; při chybě (např. duplicitní název) vyhodí výjimku s hláškou pro uživatele */
  onSubmit: (input: LoreInput) => Promise<void>
  onDelete?: () => Promise<void>
  onClose: () => void
}

/** Dialog pro vytvoření a úpravu záznamu lore (encyklopedie světa) */
export default function LoreModal({ entry, allCharacters, allLocations, allFactions, allQuests, allThreads, defaultLocations = [], onSubmit, onDelete, onClose }: LoreModalProps) {
  const isEdit = entry !== null
  const [title, setTitle] = useState(entry?.title ?? '')
  const [type, setType] = useState<LoreType | null>(entry?.type ?? null)
  const [truth, setTruth] = useState<LoreTruth>(entry?.truth ?? 'unknown')
  const [knowledge, setKnowledge] = useState<LoreKnowledge>(entry?.knowledge ?? 'known')
  const [characters, setCharacters] = useState<string[]>(entry?.characters ?? [])
  const [locations, setLocations] = useState<string[]>(entry ? entry.locations : defaultLocations)
  const [factions, setFactions] = useState<string[]>(entry?.factions ?? [])
  const [quests, setQuests] = useState<string[]>(entry?.quests ?? [])
  const [threads, setThreads] = useState<string[]>(entry?.threads ?? [])
  const [content, setContent] = useState(entry?.content ?? '')
  const [secrets, setSecrets] = useState(entry?.secrets ?? '')
  const [showSecrets, setShowSecrets] = useState(Boolean(entry?.secrets))
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

  const onlyExisting = (selected: string[], options: EntityOption[]) => selected.filter(n => options.some(o => o.name === n))

  const handleSubmit = async (e?: React.FormEvent) => {
    e?.preventDefault()
    if (saving) return
    const trimmed = title.trim()
    if (!trimmed) {
      setError('Vyplň název záznamu.')
      titleRef.current?.focus()
      return
    }
    if (!type) {
      setError('Zvol typ záznamu.')
      return
    }
    setSaving(true)
    setError(null)
    try {
      await onSubmit({
        title: trimmed,
        type,
        truth,
        knowledge,
        characters: onlyExisting(characters, allCharacters),
        locations: onlyExisting(locations, allLocations),
        factions: onlyExisting(factions, allFactions),
        quests: onlyExisting(quests, allQuests),
        threads: onlyExisting(threads, allThreads),
        content,
        secrets,
      })
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Uložení záznamu selhalo.')
      titleRef.current?.focus()
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async () => {
    if (!onDelete || !entry) return
    if (!window.confirm(`Opravdu smazat záznam „${entry.title}“ včetně jeho souboru ve vaultu?`)) return
    setSaving(true)
    try {
      await onDelete()
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Smazání záznamu selhalo.')
    } finally {
      setSaving(false)
    }
  }

  const textareaKeys = (e: React.KeyboardEvent) => { if (e.key === 'Enter' && e.ctrlKey) { e.preventDefault(); void handleSubmit() } }

  return (
    <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4" onClick={onClose}>
      <form
        onSubmit={handleSubmit}
        className="bg-[#111] border-2 border-[var(--accent)]/60 rounded-xl p-6 w-[860px] max-w-full max-h-full overflow-y-auto flex flex-col gap-4"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-xl font-bold text-[var(--accent)]">{isEdit ? 'Upravit záznam lore' : 'Nový záznam lore'}</h2>

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
            placeholder="např. Pád rodu Valdyrů, Velký požár Laernu, Legenda o mrtvém králi"
            className={inputClass}
          />
        </label>

        <ChipGroup
          label={<>Typ {!type && <span className="opacity-60">(povinný)</span>}</>}
          options={LORE_TYPES}
          value={type}
          labels={Object.fromEntries(LORE_TYPES.map(t => [t, `${LORE_TYPE_ICONS[t]} ${LORE_TYPE_LABELS[t]}`])) as Record<LoreType, string>}
          hints={LORE_TYPE_HINTS}
          onChange={setType}
        />

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <ChipGroup
            label={<>Znalost postav <span className="opacity-60">(co o tom postavy vědí)</span></>}
            options={LORE_KNOWLEDGES}
            value={knowledge}
            labels={LORE_KNOWLEDGE_LABELS}
            hints={LORE_KNOWLEDGE_HINTS}
            onChange={setKnowledge}
            className={(k, selected) => (selected ? LORE_KNOWLEDGE_CLASS[k] : '')}
          />
          <ChipGroup
            label={<>Pravdivost <span className="opacity-60">(je to skutečně pravda?)</span></>}
            options={LORE_TRUTHS}
            value={truth}
            labels={LORE_TRUTH_LABELS}
            hints={LORE_TRUTH_HINTS}
            onChange={setTruth}
            className={(t, selected) => (selected ? LORE_TRUTH_CLASS[t] : '')}
          />
        </div>

        <label className="flex flex-col gap-1 text-left text-sm text-[var(--text)]">
          Obsah <span className="opacity-60">(markdown – jak je věc známá ve světě; tělo souboru v Obsidianu)</span>
          <textarea
            rows={7}
            value={content}
            onFocus={selectAll}
            onChange={(e) => setContent(e.target.value)}
            onKeyDown={textareaKeys}
            placeholder="Před sto lety byl rod Valdyrů vyhlazen během jediné noci. Podle kronik za tím stál…"
            className={`${inputClass} font-mono text-sm resize-y whitespace-pre-wrap`}
          />
        </label>

        <div className="flex flex-col gap-1 text-left text-sm text-[var(--text)]">
          <button type="button" onClick={() => setShowSecrets(v => !v)} className="self-start flex items-center gap-2 hover:text-[var(--accent)]">
            <span>{showSecrets ? '▾' : '▸'}</span>
            🔒 Skutečná pravda <span className="opacity-60">(co se opravdu stalo; v souboru za značkou <code>&lt;!-- secrets --&gt;</code>)</span>
            {!showSecrets && secrets.trim() && <span className="opacity-60 text-xs">· vyplněno</span>}
          </button>
          {showSecrets && (
            <textarea
              rows={4}
              value={secrets}
              onFocus={selectAll}
              onChange={(e) => setSecrets(e.target.value)}
              onKeyDown={textareaKeys}
              placeholder="Ve skutečnosti rod přežil – poslední dědic žije pod jiným jménem v Laernu…"
              className={`${inputClass} font-mono text-sm resize-y whitespace-pre-wrap border-amber-500/40`}
            />
          )}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <EntityChecklist legend="Souvisí s lokacemi" options={allLocations} selected={locations} onToggle={toggleIn(setLocations)} emptyText="Hra zatím nemá žádné lokace." columns={2} />
          <EntityChecklist legend="Souvisí s frakcemi" options={allFactions} selected={factions} onToggle={toggleIn(setFactions)} emptyText="Hra zatím nemá žádné frakce." columns={2} />
          <EntityChecklist legend="Souvisí s postavami" options={allCharacters} selected={characters} onToggle={toggleIn(setCharacters)} emptyText="Hra zatím nemá žádné postavy." columns={2} />
          <EntityChecklist legend="Souvisí s questy" options={allQuests} selected={quests} onToggle={toggleIn(setQuests)} emptyText="Hra zatím nemá žádné questy." columns={2} />
          <EntityChecklist legend="Souvisí s dějovými nitěmi" options={allThreads} selected={threads} onToggle={toggleIn(setThreads)} emptyText="Hra zatím nemá žádné nitě." columns={2} />
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
