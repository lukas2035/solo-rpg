import { useMemo, useState } from 'react'
import type { LocationStatus, LocationType, StoryLocation } from '@solo-rpg/shared'
import FilterSelect from './FilterSelect'
import { inputClass } from '../utils/forms'
import {
  LOCATION_STATUSES,
  LOCATION_STATUS_CLASS,
  LOCATION_STATUS_LABELS,
  LOCATION_TYPES,
  LOCATION_TYPE_ICONS,
  LOCATION_TYPE_LABELS,
} from '../utils/locations'

/** Lokace s dopočítanými zobrazovacími údaji */
export interface DisplayLocation extends StoryLocation {
  imageUrl: string | null
  /** Řetězec rodičů od kořene po lokaci samotnou (breadcrumb) */
  path: StoryLocation[]
  childCount: number
  /** Běžící questy / otevřené nitě odkazující na lokaci */
  openQuestCount: number
  openThreadCount: number
}

interface LocationsPanelProps {
  locations: DisplayLocation[]
  onCreate: () => void
  onEdit: (location: StoryLocation) => void
  /** Rychlá změna stavu přímo ze seznamu */
  onStatusChange: (location: StoryLocation, status: LocationStatus) => void
}

function LocationRow({ location, indent, onEdit, onStatusChange }: {
  location: DisplayLocation
  /** Odsazení podle hloubky v hierarchii (0 = bez odsazení) */
  indent: number
  onEdit: () => void
  onStatusChange: (status: LocationStatus) => void
}) {
  const faded = location.status === 'destroyed' || location.status === 'abandoned'
  const parents = location.path.slice(0, -1)
  return (
    <li
      className={`rounded-lg border border-[var(--accent)]/30 bg-black/40 p-2.5 flex gap-2.5 ${faded ? 'opacity-60 hover:opacity-100' : ''} transition-opacity`}
      style={indent > 0 ? { marginLeft: `${Math.min(indent, 4) * 14}px` } : undefined}
    >
      <button type="button" onClick={onEdit} title="Otevřít detail" className="w-11 h-11 rounded-lg overflow-hidden bg-gray-800 flex-shrink-0 flex items-center justify-center text-xl border border-[var(--accent)]/30 hover:border-[var(--accent)]">
        {location.imageUrl ? <img src={location.imageUrl} alt="" className="w-full h-full object-cover" /> : LOCATION_TYPE_ICONS[location.type]}
      </button>
      <div className="flex-1 min-w-0 flex flex-col gap-1">
        <div className="flex items-start gap-2">
          <button type="button" onClick={onEdit} className="flex-1 text-left font-semibold text-[var(--text)] hover:text-[var(--accent)] transition-colors leading-5 truncate" title={location.title}>
            {location.title}
          </button>
          <select
            value={location.status}
            onChange={(e) => onStatusChange(e.target.value as LocationStatus)}
            title="Změnit stav"
            className={`text-xs font-semibold rounded-full border px-2 py-0.5 cursor-pointer bg-black/60 ${LOCATION_STATUS_CLASS[location.status]}`}
          >
            {LOCATION_STATUSES.map(s => <option key={s} value={s} className="bg-[#111] text-white">{LOCATION_STATUS_LABELS[s]}</option>)}
          </select>
        </div>
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-[var(--text)] opacity-80">
          <span>{LOCATION_TYPE_LABELS[location.type]}</span>
          {parents.length > 0 && indent === 0 && (
            <>
              <span className="opacity-50">·</span>
              <span className="truncate" title={parents.map(p => p.title).join(' → ')}>⤴ {parents[parents.length - 1].title}</span>
            </>
          )}
          {location.childCount > 0 && (
            <>
              <span className="opacity-50">·</span>
              <span title="Podřízené lokace">⤵ {location.childCount}</span>
            </>
          )}
          {location.openQuestCount > 0 && (
            <>
              <span className="opacity-50">·</span>
              <span title="Běžící questy na tomto místě">📜 {location.openQuestCount}</span>
            </>
          )}
          {location.openThreadCount > 0 && (
            <>
              <span className="opacity-50">·</span>
              <span title="Otevřené dějové nitě na tomto místě">🧵 {location.openThreadCount}</span>
            </>
          )}
        </div>
      </div>
    </li>
  )
}

/** Obsah záložky „Lokace“ v postranním panelu – bez filtru jako strom (odsazení podle hloubky), s filtrem plochý seznam */
export default function LocationsPanel({ locations, onCreate, onEdit, onStatusChange }: LocationsPanelProps) {
  const [query, setQuery] = useState('')
  const [typeFilter, setTypeFilter] = useState<LocationType | ''>('')
  const [statusFilter, setStatusFilter] = useState<LocationStatus | ''>('')

  const hasFilter = Boolean(query || typeFilter || statusFilter)

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase()
    return locations
      .filter(l =>
        (!q || l.title.toLowerCase().includes(q)) &&
        (!typeFilter || l.type === typeFilter) &&
        (!statusFilter || l.status === statusFilter),
      )
      // Podle cesty v hierarchii → rodiče těsně nad svými dětmi
      .sort((a, b) => a.path.map(p => p.title).join('\u0000').localeCompare(b.path.map(p => p.title).join('\u0000'), 'cs'))
  }, [locations, query, typeFilter, statusFilter])

  return (
    <>
      <div className="px-4 py-3 flex flex-col gap-2 border-b border-[var(--accent)]/20">
        <div className="flex gap-2">
          <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Hledat podle názvu…" className={`${inputClass} py-1.5 text-sm flex-1`} />
          <button type="button" onClick={onCreate} className="px-3 py-1 rounded-lg bg-[var(--accent)] text-white text-sm font-semibold hover:opacity-80 transition-opacity whitespace-nowrap">
            + Nová
          </button>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <FilterSelect value={typeFilter} options={LOCATION_TYPES} labels={LOCATION_TYPE_LABELS} all="Všechny typy" onChange={setTypeFilter} />
          <FilterSelect value={statusFilter} options={LOCATION_STATUSES} labels={LOCATION_STATUS_LABELS} all="Všechny stavy" onChange={setStatusFilter} />
        </div>
        {hasFilter && (
          <button type="button" onClick={() => { setQuery(''); setTypeFilter(''); setStatusFilter('') }} className="self-end text-xs opacity-70 hover:opacity-100 hover:text-[var(--accent)]">
            Zrušit filtry
          </button>
        )}
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-3 flex flex-col gap-3">
        {locations.length === 0 ? (
          <p className="text-sm opacity-70 text-center py-6">
            Zatím žádné lokace. Zapiš si místa, kde se kampaň odehrává – od kontinentu po jednotlivé budovy.
          </p>
        ) : visible.length === 0 ? (
          <p className="text-sm opacity-70 text-center py-6">Filtru neodpovídá žádná lokace.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {visible.map(l => (
              <LocationRow
                key={l.id}
                location={l}
                indent={hasFilter ? 0 : l.path.length - 1}
                onEdit={() => onEdit(l)}
                onStatusChange={(s) => onStatusChange(l, s)}
              />
            ))}
          </ul>
        )}
      </div>
    </>
  )
}
