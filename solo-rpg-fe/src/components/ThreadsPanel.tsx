import { useMemo, useState } from 'react'
import type { StoryThread, ThreadCertainty, ThreadHorizon, ThreadStatus, ThreadType } from '@solo-rpg/shared'
import { OPEN_THREAD_STATUSES } from '@solo-rpg/shared'
import FilterSelect from './FilterSelect'
import { inputClass } from '../utils/forms'
import {
  THREAD_CERTAINTIES,
  THREAD_CERTAINTY_LABELS,
  THREAD_HORIZONS,
  THREAD_HORIZON_LABELS,
  THREAD_STATUSES,
  THREAD_STATUS_CLASS,
  THREAD_STATUS_LABELS,
  THREAD_TYPES,
  THREAD_TYPE_ICONS,
  THREAD_TYPE_LABELS,
  clockDots,
} from '../utils/threads'

interface ThreadsPanelProps {
  threads: StoryThread[]
  onCreate: () => void
  onEdit: (thread: StoryThread) => void
  /** Rychlá změna stavu přímo ze seznamu */
  onStatusChange: (thread: StoryThread, status: ThreadStatus) => void
  /** Posun hodin o ±1 přímo ze seznamu */
  onClockStep: (thread: StoryThread, delta: 1 | -1) => void
}

const OPEN_SET = new Set<ThreadStatus>(OPEN_THREAD_STATUSES)

/** Jedna nit v seznamu */
function ThreadRow({ thread, onEdit, onStatusChange, onClockStep }: {
  thread: StoryThread
  onEdit: () => void
  onStatusChange: (status: ThreadStatus) => void
  onClockStep: (delta: 1 | -1) => void
}) {
  const closed = !OPEN_SET.has(thread.status)
  return (
    <li className={`rounded-lg border border-[var(--accent)]/30 bg-black/40 p-2.5 flex flex-col gap-1.5 ${closed ? 'opacity-60 hover:opacity-100' : ''} transition-opacity`}>
      <div className="flex items-start gap-2">
        <span className="text-base leading-6" title={THREAD_TYPE_LABELS[thread.type]}>{THREAD_TYPE_ICONS[thread.type]}</span>
        <button type="button" onClick={onEdit} className="flex-1 text-left font-semibold text-[var(--text)] hover:text-[var(--accent)] transition-colors leading-6" title="Otevřít detail">
          {thread.title}
        </button>
        <select
          value={thread.status}
          onChange={(e) => onStatusChange(e.target.value as ThreadStatus)}
          title="Změnit stav"
          className={`text-xs font-semibold rounded-full border px-2 py-0.5 cursor-pointer bg-black/60 ${THREAD_STATUS_CLASS[thread.status]}`}
        >
          {THREAD_STATUSES.map(s => <option key={s} value={s} className="bg-[#111] text-white">{THREAD_STATUS_LABELS[s]}</option>)}
        </select>
      </div>

      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-[var(--text)] opacity-80 pl-7">
        <span>{THREAD_TYPE_LABELS[thread.type]}</span>
        <span className="opacity-50">·</span>
        <span>{THREAD_HORIZON_LABELS[thread.horizon]}</span>
        {thread.certainty === 'unresolved' && (
          <>
            <span className="opacity-50">·</span>
            <span className="text-amber-300" title={thread.revealCondition || undefined}>Nejisté{thread.revealCondition ? ' ⓘ' : ''}</span>
          </>
        )}
        {thread.characters.length > 0 && (
          <>
            <span className="opacity-50">·</span>
            <span className="truncate" title={thread.characters.join(', ')}>{thread.characters.join(', ')}</span>
          </>
        )}
      </div>

      {thread.clock && (
        <div className="flex items-center gap-2 pl-7 text-xs">
          <button type="button" onClick={() => onClockStep(-1)} disabled={thread.clock.current <= 0} className="w-5 h-5 rounded border border-[var(--accent)]/50 text-[var(--accent)] hover:bg-black/60 disabled:opacity-30">−</button>
          <span className="font-mono tracking-wider text-[var(--accent)]">{clockDots(thread.clock)}</span>
          <button type="button" onClick={() => onClockStep(1)} disabled={thread.clock.current >= thread.clock.max} className="w-5 h-5 rounded border border-[var(--accent)]/50 text-[var(--accent)] hover:bg-black/60 disabled:opacity-30">+</button>
          <span className="font-mono opacity-80">{thread.clock.current}/{thread.clock.max}</span>
        </div>
      )}
    </li>
  )
}

/** Obsah záložky „Dějové nitě“ v postranním panelu */
export default function ThreadsPanel({ threads, onCreate, onEdit, onStatusChange, onClockStep }: ThreadsPanelProps) {
  const [query, setQuery] = useState('')
  const [typeFilter, setTypeFilter] = useState<ThreadType | ''>('')
  const [statusFilter, setStatusFilter] = useState<ThreadStatus | ''>('')
  const [horizonFilter, setHorizonFilter] = useState<ThreadHorizon | ''>('')
  const [certaintyFilter, setCertaintyFilter] = useState<ThreadCertainty | ''>('')
  const [showClosed, setShowClosed] = useState(false)

  const { open, closed } = useMemo(() => {
    const q = query.trim().toLowerCase()
    const filtered = threads.filter(t =>
      (!q || t.title.toLowerCase().includes(q)) &&
      (!typeFilter || t.type === typeFilter) &&
      (!statusFilter || t.status === statusFilter) &&
      (!horizonFilter || t.horizon === horizonFilter) &&
      (!certaintyFilter || t.certainty === certaintyFilter),
    )
    return {
      open: filtered.filter(t => OPEN_SET.has(t.status)),
      closed: filtered.filter(t => !OPEN_SET.has(t.status)),
    }
  }, [threads, query, typeFilter, statusFilter, horizonFilter, certaintyFilter])

  const hasFilter = query || typeFilter || statusFilter || horizonFilter || certaintyFilter
  // Při filtru na uzavřený stav archiv rovnou rozbalíme
  const closedVisible = showClosed || (statusFilter !== '' && !OPEN_SET.has(statusFilter))

  return (
    <>
      <div className="px-4 py-3 flex flex-col gap-2 border-b border-[var(--accent)]/20">
        <div className="flex gap-2">
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Hledat podle názvu…"
            className={`${inputClass} py-1.5 text-sm flex-1`}
          />
          <button type="button" onClick={onCreate} className="px-3 py-1 rounded-lg bg-[var(--accent)] text-white text-sm font-semibold hover:opacity-80 transition-opacity whitespace-nowrap">
            + Nová
          </button>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <FilterSelect value={typeFilter} options={THREAD_TYPES} labels={THREAD_TYPE_LABELS} all="Všechny typy" onChange={setTypeFilter} />
          <FilterSelect value={statusFilter} options={THREAD_STATUSES} labels={THREAD_STATUS_LABELS} all="Všechny stavy" onChange={setStatusFilter} />
          <FilterSelect value={horizonFilter} options={THREAD_HORIZONS} labels={THREAD_HORIZON_LABELS} all="Každý horizont" onChange={setHorizonFilter} />
          <FilterSelect value={certaintyFilter} options={THREAD_CERTAINTIES} labels={THREAD_CERTAINTY_LABELS} all="Jisté i nejisté" onChange={setCertaintyFilter} />
        </div>
        {hasFilter && (
          <button
            type="button"
            onClick={() => { setQuery(''); setTypeFilter(''); setStatusFilter(''); setHorizonFilter(''); setCertaintyFilter('') }}
            className="self-end text-xs opacity-70 hover:opacity-100 hover:text-[var(--accent)]"
          >
            Zrušit filtry
          </button>
        )}
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-3 flex flex-col gap-3">
        {threads.length === 0 ? (
          <p className="text-sm opacity-70 text-center py-6">
            Zatím žádné dějové nitě. Zapiš si první komplikaci, hrozbu nebo záhadu, která visí nad kampaní.
          </p>
        ) : open.length === 0 && (!closedVisible || closed.length === 0) ? (
          <p className="text-sm opacity-70 text-center py-6">{hasFilter ? 'Filtru neodpovídá žádná otevřená nit.' : 'Žádná otevřená nit – všechno je vyřešené nebo vyhaslé.'}</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {open.map(t => (
              <ThreadRow key={t.id} thread={t} onEdit={() => onEdit(t)} onStatusChange={(s) => onStatusChange(t, s)} onClockStep={(d) => onClockStep(t, d)} />
            ))}
          </ul>
        )}

        {closed.length > 0 && (
          <section className="flex flex-col gap-2">
            <button
              type="button"
              onClick={() => setShowClosed(v => !v)}
              className="flex items-center gap-2 text-xs uppercase tracking-wide opacity-70 hover:opacity-100 text-left"
            >
              <span>{closedVisible ? '▾' : '▸'}</span>
              Vyřešené a vyhaslé ({closed.length})
            </button>
            {closedVisible && (
              <ul className="flex flex-col gap-2">
                {closed.map(t => (
                  <ThreadRow key={t.id} thread={t} onEdit={() => onEdit(t)} onStatusChange={(s) => onStatusChange(t, s)} onClockStep={(d) => onClockStep(t, d)} />
                ))}
              </ul>
            )}
          </section>
        )}
      </div>
    </>
  )
}
