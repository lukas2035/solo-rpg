import { useMemo, useState } from 'react'
import type { Faction, FactionStance, FactionStatus, FactionType } from '@solo-rpg/shared'
import FilterSelect from './FilterSelect'
import { inputClass } from '../utils/forms'
import {
  FACTION_STANCES,
  FACTION_STANCE_CLASS,
  FACTION_STANCE_LABELS,
  FACTION_STATUSES,
  FACTION_STATUS_CLASS,
  FACTION_STATUS_LABELS,
  FACTION_TYPES,
  FACTION_TYPE_ICONS,
  FACTION_TYPE_LABELS,
} from '../utils/factions'

/** Frakce s URL emblému a dopočítaným počtem souvisejících nití */
export interface DisplayFaction extends Faction {
  emblemUrl: string | null
  openThreadCount: number
  /** Nickname vůdce pro zobrazení (celé jméno je v `leader`) */
  leaderLabel: string | null
}

interface FactionsPanelProps {
  factions: DisplayFaction[]
  onCreate: () => void
  onEdit: (faction: Faction) => void
  /** Rychlá změna postoje k družině přímo ze seznamu */
  onStanceChange: (faction: Faction, stance: FactionStance) => void
}

function FactionRow({ faction, onEdit, onStanceChange }: {
  faction: DisplayFaction
  onEdit: () => void
  onStanceChange: (stance: FactionStance) => void
}) {
  const inactive = faction.status !== 'active'
  return (
    <li className={`rounded-lg border border-[var(--accent)]/30 bg-black/40 p-2.5 flex gap-2.5 ${inactive ? 'opacity-60 hover:opacity-100' : ''} transition-opacity`}>
      <button type="button" onClick={onEdit} title="Otevřít detail" className="w-11 h-11 rounded-lg overflow-hidden bg-gray-800 flex-shrink-0 flex items-center justify-center text-xl border border-[var(--accent)]/30 hover:border-[var(--accent)]">
        {faction.emblemUrl ? <img src={faction.emblemUrl} alt="" className="w-full h-full object-cover" /> : FACTION_TYPE_ICONS[faction.type]}
      </button>
      <div className="flex-1 min-w-0 flex flex-col gap-1">
        <div className="flex items-start gap-2">
          <button type="button" onClick={onEdit} className="flex-1 text-left font-semibold text-[var(--text)] hover:text-[var(--accent)] transition-colors leading-5 truncate" title={faction.title}>
            {faction.title}
          </button>
          <select
            value={faction.stance}
            onChange={(e) => onStanceChange(e.target.value as FactionStance)}
            title="Postoj k družině"
            className={`text-xs font-semibold rounded-full border px-2 py-0.5 cursor-pointer bg-black/60 ${FACTION_STANCE_CLASS[faction.stance]}`}
          >
            {FACTION_STANCES.map(s => <option key={s} value={s} className="bg-[#111] text-white">{FACTION_STANCE_LABELS[s]}</option>)}
          </select>
        </div>
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-[var(--text)] opacity-80">
          <span>{FACTION_TYPE_LABELS[faction.type]}</span>
          {faction.status !== 'active' && (
            <>
              <span className="opacity-50">·</span>
              <span className={`px-1.5 rounded-full border ${FACTION_STATUS_CLASS[faction.status]}`}>{FACTION_STATUS_LABELS[faction.status]}</span>
            </>
          )}
          {faction.leaderLabel && (
            <>
              <span className="opacity-50">·</span>
              <span title={`Vůdce: ${faction.leader}`}>👑 {faction.leaderLabel}</span>
            </>
          )}
          {faction.parentFaction && (
            <>
              <span className="opacity-50">·</span>
              <span title="Nadřazená frakce">⤴ {faction.parentFaction}</span>
            </>
          )}
          {faction.openThreadCount > 0 && (
            <>
              <span className="opacity-50">·</span>
              <span title="Otevřené dějové nitě">🧵 {faction.openThreadCount}</span>
            </>
          )}
        </div>
        {faction.goals.length > 0 && (
          <p className="text-xs opacity-70 truncate" title={faction.goals.join('\n')}>
            🎯 {faction.goals[0]}{faction.goals.length > 1 ? ` (+${faction.goals.length - 1})` : ''}
          </p>
        )}
      </div>
    </li>
  )
}

/** Obsah záložky „Frakce“ v postranním panelu */
export default function FactionsPanel({ factions, onCreate, onEdit, onStanceChange }: FactionsPanelProps) {
  const [query, setQuery] = useState('')
  const [typeFilter, setTypeFilter] = useState<FactionType | ''>('')
  const [statusFilter, setStatusFilter] = useState<FactionStatus | ''>('')
  const [stanceFilter, setStanceFilter] = useState<FactionStance | ''>('')
  const [showInactive, setShowInactive] = useState(false)

  const { active, inactive } = useMemo(() => {
    const q = query.trim().toLowerCase()
    const filtered = factions.filter(f =>
      (!q || f.title.toLowerCase().includes(q)) &&
      (!typeFilter || f.type === typeFilter) &&
      (!statusFilter || f.status === statusFilter) &&
      (!stanceFilter || f.stance === stanceFilter),
    )
    return { active: filtered.filter(f => f.status === 'active'), inactive: filtered.filter(f => f.status !== 'active') }
  }, [factions, query, typeFilter, statusFilter, stanceFilter])

  const hasFilter = query || typeFilter || statusFilter || stanceFilter
  const inactiveVisible = showInactive || (statusFilter !== '' && statusFilter !== 'active')

  return (
    <>
      <div className="px-4 py-3 flex flex-col gap-2 border-b border-[var(--accent)]/20">
        <div className="flex gap-2">
          <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Hledat podle názvu…" className={`${inputClass} py-1.5 text-sm flex-1`} />
          <button type="button" onClick={onCreate} className="px-3 py-1 rounded-lg bg-[var(--accent)] text-white text-sm font-semibold hover:opacity-80 transition-opacity whitespace-nowrap">
            + Nová
          </button>
        </div>
        <div className="grid grid-cols-3 gap-2">
          <FilterSelect value={typeFilter} options={FACTION_TYPES} labels={FACTION_TYPE_LABELS} all="Všechny typy" onChange={setTypeFilter} />
          <FilterSelect value={statusFilter} options={FACTION_STATUSES} labels={FACTION_STATUS_LABELS} all="Všechny stavy" onChange={setStatusFilter} />
          <FilterSelect value={stanceFilter} options={FACTION_STANCES} labels={FACTION_STANCE_LABELS} all="Každý postoj" onChange={setStanceFilter} />
        </div>
        {hasFilter && (
          <button type="button" onClick={() => { setQuery(''); setTypeFilter(''); setStatusFilter(''); setStanceFilter('') }} className="self-end text-xs opacity-70 hover:opacity-100 hover:text-[var(--accent)]">
            Zrušit filtry
          </button>
        )}
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-3 flex flex-col gap-3">
        {factions.length === 0 ? (
          <p className="text-sm opacity-70 text-center py-6">
            Zatím žádné frakce. Zapiš si organizace, které ve světě hrají roli – stát, cech, kult, gang…
          </p>
        ) : active.length === 0 && (!inactiveVisible || inactive.length === 0) ? (
          <p className="text-sm opacity-70 text-center py-6">{hasFilter ? 'Filtru neodpovídá žádná aktivní frakce.' : 'Žádná aktivní frakce.'}</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {active.map(f => <FactionRow key={f.id} faction={f} onEdit={() => onEdit(f)} onStanceChange={(s) => onStanceChange(f, s)} />)}
          </ul>
        )}

        {inactive.length > 0 && (
          <section className="flex flex-col gap-2">
            <button type="button" onClick={() => setShowInactive(v => !v)} className="flex items-center gap-2 text-xs uppercase tracking-wide opacity-70 hover:opacity-100 text-left">
              <span>{inactiveVisible ? '▾' : '▸'}</span>
              Neaktivní, rozpuštěné a zničené ({inactive.length})
            </button>
            {inactiveVisible && (
              <ul className="flex flex-col gap-2">
                {inactive.map(f => <FactionRow key={f.id} faction={f} onEdit={() => onEdit(f)} onStanceChange={(s) => onStanceChange(f, s)} />)}
              </ul>
            )}
          </section>
        )}
      </div>
    </>
  )
}
