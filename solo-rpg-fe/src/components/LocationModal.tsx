import { useEffect, useMemo, useRef, useState } from 'react'
import type { Faction, LocationStatus, LocationType, LoreEntry, Quest, SceneMeta, StoryLocation, StoryThread } from '@solo-rpg/shared'
import { locationPath } from '@solo-rpg/shared'
import ChipGroup from './ChipGroup'
import ImageDropField from './ImageDropField'
import RelatedEntities from './RelatedEntities'
import { inputClass, selectAll } from '../utils/forms'
import { FACTION_STATUS_LABELS, FACTION_TYPE_ICONS } from '../utils/factions'
import {
  LOCATION_STATUSES,
  LOCATION_STATUS_CLASS,
  LOCATION_STATUS_HINTS,
  LOCATION_STATUS_LABELS,
  LOCATION_TYPES,
  LOCATION_TYPE_ICONS,
  LOCATION_TYPE_LABELS,
} from '../utils/locations'
import { LORE_KNOWLEDGE_LABELS, LORE_TYPE_ICONS } from '../utils/lore'
import { QUEST_STATUS_LABELS, QUEST_TYPE_ICONS } from '../utils/quests'
import { THREAD_STATUS_LABELS, THREAD_TYPE_ICONS } from '../utils/threads'

/** Hodnoty formuláře; `image` = undefined → beze změny, null → odstranit, string → nový (data:/http URL) */
export interface LocationFormValues {
  title: string
  type: LocationType
  status: LocationStatus
  parentLocation: string | null
  description: string
  secrets: string
  image: string | null | undefined
}

interface LocationModalProps {
  /** Upravovaná lokace; null = vytvoření nové */
  location: StoryLocation | null
  /** Aktuální obrázek jako URL použitelná v <img> */
  image: string | null
  /** Předvyplněný rodič pro novou lokaci (tlačítko „Podřízená lokace“ v detailu rodiče) */
  defaultParent?: string | null
  /** Ostatní lokace hry (bez upravované) – nabídka rodiče a výpočet breadcrumb */
  otherLocations: StoryLocation[]
  /** Dopočítané: podřízené lokace a entity, které na lokaci odkazují (vazba se edituje u nich) */
  childLocations: StoryLocation[]
  relatedScenes: SceneMeta[]
  relatedThreads: StoryThread[]
  relatedQuests: Quest[]
  relatedFactions: Faction[]
  relatedLore: LoreEntry[]
  onSubmit: (values: LocationFormValues) => Promise<void>
  onDelete?: () => Promise<void>
  /** Vytvořit novou lokaci s touto jako rodičem (zavře tento dialog) */
  onCreateChild?: () => void
  onOpenLocation?: (location: StoryLocation) => void
  onOpenScene?: (scene: SceneMeta) => void
  onOpenThread?: (thread: StoryThread) => void
  onOpenQuest?: (quest: Quest) => void
  onOpenFaction?: (faction: Faction) => void
  onOpenLore?: (lore: LoreEntry) => void
  onClose: () => void
}

/** Dialog pro vytvoření a úpravu lokace (detail = editace, jako u ostatních entit) */
export default function LocationModal({
  location, image, defaultParent = null, otherLocations, childLocations,
  relatedScenes, relatedThreads, relatedQuests, relatedFactions, relatedLore,
  onSubmit, onDelete, onCreateChild, onOpenLocation, onOpenScene, onOpenThread, onOpenQuest, onOpenFaction, onOpenLore, onClose,
}: LocationModalProps) {
  const isEdit = location !== null
  const [title, setTitle] = useState(location?.title ?? '')
  const [type, setType] = useState<LocationType | null>(location?.type ?? null)
  const [status, setStatus] = useState<LocationStatus>(location?.status ?? 'known')
  const [parentLocation, setParentLocation] = useState<string | null>(location ? location.parentLocation : defaultParent)
  const [description, setDescription] = useState(location?.description ?? '')
  const [secrets, setSecrets] = useState(location?.secrets ?? '')
  const [showSecrets, setShowSecrets] = useState(Boolean(location?.secrets))
  const [editImage, setEditImage] = useState<string | null>(image)
  const [imageChanged, setImageChanged] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const titleRef = useRef<HTMLInputElement | null>(null)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  /** Lokace, které nelze zvolit jako rodiče: potomci upravované lokace (vznikl by cyklus) */
  const descendantTitles = useMemo(() => {
    if (!location) return new Set<string>()
    const result = new Set<string>()
    let frontier = [location.title]
    while (frontier.length > 0) {
      const next = otherLocations.filter(l => l.parentLocation && frontier.includes(l.parentLocation) && !result.has(l.title))
      next.forEach(l => result.add(l.title))
      frontier = next.map(l => l.title)
    }
    return result
  }, [location, otherLocations])
  const parentCandidates = useMemo(
    () => otherLocations.filter(l => !descendantTitles.has(l.title)).sort((a, b) => a.title.localeCompare(b.title, 'cs')),
    [otherLocations, descendantTitles]
  )
  const parentObj = otherLocations.find(l => l.title === parentLocation) ?? null
  /** Breadcrumb od kořene k zvolenému rodiči */
  const breadcrumb = useMemo(() => (parentObj ? locationPath(parentObj, otherLocations) : []), [parentObj, otherLocations])

  const handleSubmit = async (e?: React.FormEvent) => {
    e?.preventDefault()
    if (saving) return
    const trimmed = title.trim()
    if (!trimmed) {
      setError('Vyplň název lokace.')
      titleRef.current?.focus()
      return
    }
    if (!type) {
      setError('Zvol typ lokace.')
      return
    }
    setSaving(true)
    setError(null)
    try {
      await onSubmit({
        title: trimmed,
        type,
        status,
        parentLocation: parentCandidates.some(l => l.title === parentLocation) ? parentLocation : null,
        description,
        secrets,
        image: imageChanged ? editImage : undefined,
      })
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Uložení lokace selhalo.')
      titleRef.current?.focus()
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async () => {
    if (!onDelete || !location) return
    if (!window.confirm(`Opravdu smazat lokaci „${location.title}“ včetně jejího souboru ve vaultu? Podřízené lokace zůstanou, jen ztratí rodiče.`)) return
    setSaving(true)
    try {
      await onDelete()
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Smazání lokace selhalo.')
    } finally {
      setSaving(false)
    }
  }

  const hasRelated = childLocations.length + relatedScenes.length + relatedThreads.length + relatedQuests.length + relatedFactions.length + relatedLore.length > 0

  return (
    <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4" onClick={onClose}>
      <form
        onSubmit={handleSubmit}
        className="bg-[#111] border-2 border-[var(--accent)]/60 rounded-xl p-6 w-[860px] max-w-full max-h-full overflow-y-auto flex flex-col gap-4"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-xl font-bold text-[var(--accent)]">{isEdit ? 'Upravit lokaci' : 'Nová lokace'}</h2>

        {/* Breadcrumb hierarchie – od kořene po rodiče, pak tato lokace */}
        {(breadcrumb.length > 0 || isEdit) && (
          <div className="flex flex-wrap items-center gap-1 text-xs text-[var(--text)] opacity-80 -mt-2">
            {breadcrumb.map(l => (
              <span key={l.id} className="flex items-center gap-1">
                <button type="button" onClick={onOpenLocation ? () => onOpenLocation(l) : undefined} disabled={!onOpenLocation} className="hover:text-[var(--accent)] hover:underline disabled:no-underline" title={LOCATION_TYPE_LABELS[l.type]}>
                  {LOCATION_TYPE_ICONS[l.type]} {l.title}
                </button>
                <span className="opacity-50">→</span>
              </span>
            ))}
            <span className="font-semibold text-[var(--accent)]">{type ? LOCATION_TYPE_ICONS[type] : '📍'} {title.trim() || '…'}</span>
          </div>
        )}

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
                placeholder="např. Staré město, Phoenix klub, Severní ostrovy"
                className={inputClass}
              />
            </label>

            <ChipGroup
              label={<>Typ {!type && <span className="opacity-60">(povinný)</span>}</>}
              options={LOCATION_TYPES}
              value={type}
              labels={Object.fromEntries(LOCATION_TYPES.map(t => [t, `${LOCATION_TYPE_ICONS[t]} ${LOCATION_TYPE_LABELS[t]}`])) as Record<LocationType, string>}
              onChange={setType}
            />

            <ChipGroup
              label="Stav"
              options={LOCATION_STATUSES}
              value={status}
              labels={LOCATION_STATUS_LABELS}
              hints={LOCATION_STATUS_HINTS}
              onChange={setStatus}
              className={(s, selected) => (selected ? LOCATION_STATUS_CLASS[s] : '')}
            />

            <label className="flex flex-col gap-1 text-left text-sm text-[var(--text)]">
              Leží v <span className="opacity-60">(nadřazená lokace; prázdné = nejvyšší úroveň)</span>
              <div className="flex items-center gap-2">
                <select value={parentLocation ?? ''} onChange={(e) => setParentLocation(e.target.value || null)} className={inputClass}>
                  <option value="">— žádná —</option>
                  {parentCandidates.map(l => <option key={l.id} value={l.title}>{LOCATION_TYPE_ICONS[l.type]} {l.title}</option>)}
                </select>
                {parentObj && onOpenLocation && (
                  <button type="button" onClick={() => onOpenLocation(parentObj)} title="Otevřít nadřazenou lokaci" className="w-9 h-9 rounded-md border border-[var(--accent)]/40 hover:border-[var(--accent)] flex-shrink-0">↗</button>
                )}
              </div>
            </label>
          </div>

          <ImageDropField label="Obrázek" value={editImage} onChange={(next) => { setEditImage(next); setImageChanged(true) }} className="sm:w-48" />
        </div>

        <label className="flex flex-col gap-1 text-left text-sm text-[var(--text)]">
          Popis <span className="opacity-60">(markdown – jak místo vypadá, kdo tam žije, co je pro něj typické)</span>
          <textarea
            rows={5}
            value={description}
            onFocus={selectAll}
            onChange={(e) => setDescription(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && e.ctrlKey) { e.preventDefault(); void handleSubmit() } }}
            placeholder="Přístavní čtvrť plná skladišť a levných hospod. V noci ji ovládá Přístavní cech…"
            className={`${inputClass} font-mono text-sm resize-y whitespace-pre-wrap`}
          />
        </label>

        <div className="flex flex-col gap-1 text-left text-sm text-[var(--text)]">
          <button type="button" onClick={() => setShowSecrets(v => !v)} className="self-start flex items-center gap-2 hover:text-[var(--accent)]">
            <span>{showSecrets ? '▾' : '▸'}</span>
            🔒 Tajemství <span className="opacity-60">(co o místě postavy nevědí; v souboru za značkou <code>&lt;!-- secrets --&gt;</code>)</span>
            {!showSecrets && secrets.trim() && <span className="opacity-60 text-xs">· vyplněno</span>}
          </button>
          {showSecrets && (
            <textarea
              rows={4}
              value={secrets}
              onFocus={selectAll}
              onChange={(e) => setSecrets(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && e.ctrlKey) { e.preventDefault(); void handleSubmit() } }}
              placeholder="Pod sklepem je zapomenutá krypta s portálem do Abyssu…"
              className={`${inputClass} font-mono text-sm resize-y whitespace-pre-wrap border-amber-500/40`}
            />
          )}
        </div>

        {/* Dopočítané vazby – editují se u druhé strany */}
        {isEdit && (hasRelated || onCreateChild) && (
          <div className="flex flex-col gap-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="flex flex-col gap-1 text-left text-sm text-[var(--text)]">
                <RelatedEntities
                  heading="Podřízené lokace"
                  items={childLocations.map(l => ({ key: l.id, icon: LOCATION_TYPE_ICONS[l.type], label: l.title, suffix: LOCATION_STATUS_LABELS[l.status], title: LOCATION_TYPE_LABELS[l.type], onOpen: onOpenLocation ? () => onOpenLocation(l) : undefined }))}
                />
                {onCreateChild && (
                  <button type="button" onClick={onCreateChild} className="self-start px-2 py-1 rounded-md border border-dashed border-[var(--accent)]/70 text-xs text-[var(--accent)] hover:border-solid hover:bg-black/40 transition-all">
                    ＋ Podřízená lokace
                  </button>
                )}
              </div>
              <RelatedEntities
                heading={<>Scény <span className="normal-case">(vazba se upravuje u scény)</span></>}
                items={relatedScenes.map(s => ({ key: s.id, icon: '🎬', label: s.title, onOpen: onOpenScene ? () => onOpenScene(s) : undefined }))}
              />
              <RelatedEntities
                heading={<>Questy <span className="normal-case">(vazba se upravuje u questu)</span></>}
                items={relatedQuests.map(q => ({ key: q.id, icon: QUEST_TYPE_ICONS[q.type], label: q.title, suffix: QUEST_STATUS_LABELS[q.status], onOpen: onOpenQuest ? () => onOpenQuest(q) : undefined }))}
              />
              <RelatedEntities
                heading={<>Dějové nitě <span className="normal-case">(vazba se upravuje u nitě)</span></>}
                items={relatedThreads.map(t => ({ key: t.id, icon: THREAD_TYPE_ICONS[t.type], label: t.title, suffix: THREAD_STATUS_LABELS[t.status], onOpen: onOpenThread ? () => onOpenThread(t) : undefined }))}
              />
              <RelatedEntities
                heading={<>Frakce <span className="normal-case">(vazba se upravuje u frakce)</span></>}
                items={relatedFactions.map(f => ({ key: f.id, icon: FACTION_TYPE_ICONS[f.type], label: f.title, suffix: FACTION_STATUS_LABELS[f.status], onOpen: onOpenFaction ? () => onOpenFaction(f) : undefined }))}
              />
              <RelatedEntities
                heading={<>Lore <span className="normal-case">(vazba se upravuje u záznamu)</span></>}
                items={relatedLore.map(l => ({ key: l.id, icon: LORE_TYPE_ICONS[l.type], label: l.title, suffix: LORE_KNOWLEDGE_LABELS[l.knowledge], onOpen: onOpenLore ? () => onOpenLore(l) : undefined }))}
              />
            </div>
          </div>
        )}

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
