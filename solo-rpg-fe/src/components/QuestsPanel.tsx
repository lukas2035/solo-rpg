import { useMemo, useState } from 'react'
import type { Quest, QuestStatus, QuestType } from '@solo-rpg/shared'
import { OPEN_QUEST_STATUSES, QUEST_STATUS_ORDER, questProgress } from '@solo-rpg/shared'
import type { EntityOption } from './EntityChecklist'
import { inputClass } from '../utils/forms'
import {
  OBJECTIVE_STATUS_CLASS,
  OBJECTIVE_STATUS_ICONS,
  QUEST_STATUSES,
  QUEST_STATUS_CLASS,
  QUEST_STATUS_LABELS,
  QUEST_TYPES,
  QUEST_TYPE_ICONS,
  QUEST_TYPE_LABELS,
} from '../utils/quests'

/** Quest s dopočítanými zobrazovacími údaji */
export interface DisplayQuest extends Quest {
  /** Nickname zadavatele (celé jméno je v `questGiver`) */
  questGiverLabel: string | null
}

interface QuestsPanelProps {
  quests: DisplayQuest[]
  /** Postavy hry pro filtr „podle postavy“ */
  characterOptions: EntityOption[]
  onCreate: () => void
  onEdit: (quest: Quest) => void
  /** Rychlá změna stavu přímo ze seznamu */
  onStatusChange: (quest: Quest, status: QuestStatus) => void
}

const OPEN_SET = new Set<QuestStatus>(OPEN_QUEST_STATUSES)
const STATUS_RANK = new Map(QUEST_STATUS_ORDER.map((s, i) => [s, i]))

/** Filtrovací select: prázdná hodnota = vše */
function FilterSelect<T extends string>({ value, options, labels, all, onChange }: {
  value: T | ''
  options: readonly T[]
  labels: Record<T, string>
  all: string
  onChange: (value: T | '') => void
}) {
  return (
    <select value={value} onChange={(e) => onChange(e.target.value as T | '')} className={`${inputClass} py-1 text-xs`}>
      <option value="">{all}</option>
      {options.map(o => <option key={o} value={o}>{labels[o]}</option>)}
    </select>
  )
}

/** Postup podle povinných cílů: proužek + `2/5` */
export function ProgressBar({ objectives, className = '' }: { objectives: Quest['objectives']; className?: string }) {
  const { done, total } = questProgress(objectives)
  if (total === 0) return null
  const percent = Math.round((done / total) * 100)
  return (
    <span className={`inline-flex items-center gap-1.5 ${className}`} title={`${done} z ${total} povinných cílů (${percent} %)`}>
      <span className="w-16 h-1.5 rounded-full bg-white/10 overflow-hidden">
        <span className="block h-full rounded-full bg-[var(--accent)] transition-all" style={{ width: `${percent}%` }} />
      </span>
      <span className="tabular-nums">{done}/{total}</span>
    </span>
  )
}

function QuestRow({ quest, onEdit, onStatusChange }: {
  quest: DisplayQuest
  onEdit: () => void
  onStatusChange: (status: QuestStatus) => void
}) {
  const closed = !OPEN_SET.has(quest.status)
  // „Co mám udělat dál“: rozpracované cíle, jinak první čekající
  const current = quest.objectives.filter(o => o.status === 'active')
  const next = current.length > 0 ? current : quest.objectives.filter(o => o.status === 'pending').slice(0, 1)
  const hasProgress = questProgress(quest.objectives).total > 0
  return (
    <li className={`rounded-lg border border-[var(--accent)]/30 bg-black/40 p-2.5 flex flex-col gap-1.5 ${closed ? 'opacity-60 hover:opacity-100' : ''} transition-opacity`}>
      <div className="flex items-start gap-2">
        <span className="text-base leading-6" title={QUEST_TYPE_LABELS[quest.type]}>{QUEST_TYPE_ICONS[quest.type]}</span>
        <button type="button" onClick={onEdit} className="flex-1 text-left font-semibold text-[var(--text)] hover:text-[var(--accent)] transition-colors leading-6" title="Otevřít detail">
          {quest.title}
        </button>
        <select
          value={quest.status}
          onChange={(e) => onStatusChange(e.target.value as QuestStatus)}
          title="Změnit stav"
          className={`text-xs font-semibold rounded-full border px-2 py-0.5 cursor-pointer bg-black/60 ${QUEST_STATUS_CLASS[quest.status]}`}
        >
          {QUEST_STATUSES.map(s => <option key={s} value={s} className="bg-[#111] text-white">{QUEST_STATUS_LABELS[s]}</option>)}
        </select>
      </div>

      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-[var(--text)] opacity-80 pl-7">
        <span>{QUEST_TYPE_LABELS[quest.type]}</span>
        {hasProgress && (
          <>
            <span className="opacity-50">·</span>
            <ProgressBar objectives={quest.objectives} />
          </>
        )}
        {quest.questGiverLabel && (
          <>
            <span className="opacity-50">·</span>
            <span title={`Zadavatel: ${quest.questGiver}`}>🗣 {quest.questGiverLabel}</span>
          </>
        )}
        {quest.parentQuest && (
          <>
            <span className="opacity-50">·</span>
            <span title="Nadřazený quest">⤴ {quest.parentQuest}</span>
          </>
        )}
        {quest.threads.length > 0 && (
          <>
            <span className="opacity-50">·</span>
            <span title={quest.threads.join('\n')}>🧵 {quest.threads.length}</span>
          </>
        )}
      </div>

      {!closed && next.length > 0 && (
        <ul className="pl-7 flex flex-col gap-0.5 text-xs">
          {next.map(o => (
            <li key={o.id} className="truncate" title={o.title}>
              <span className={`${OBJECTIVE_STATUS_CLASS[o.status]} mr-1.5`}>{OBJECTIVE_STATUS_ICONS[o.status]}</span>
              {o.title}
            </li>
          ))}
        </ul>
      )}
    </li>
  )
}

/** Obsah záložky „Questy“ v postranním panelu */
export default function QuestsPanel({ quests, characterOptions, onCreate, onEdit, onStatusChange }: QuestsPanelProps) {
  const [query, setQuery] = useState('')
  const [typeFilter, setTypeFilter] = useState<QuestType | ''>('')
  const [statusFilter, setStatusFilter] = useState<QuestStatus | ''>('')
  const [characterFilter, setCharacterFilter] = useState('')
  const [showClosed, setShowClosed] = useState(false)

  const { open, closed } = useMemo(() => {
    const q = query.trim().toLowerCase()
    const filtered = quests
      .filter(qu =>
        (!q || qu.title.toLowerCase().includes(q)) &&
        (!typeFilter || qu.type === typeFilter) &&
        (!statusFilter || qu.status === statusFilter) &&
        (!characterFilter || qu.characters.includes(characterFilter) || qu.questGiver === characterFilter),
      )
      // Aktivní → dostupné → odložené → ukončené; uvnitř stavu nejnověji upravené nahoře
      .sort((a, b) => (STATUS_RANK.get(a.status) ?? 99) - (STATUS_RANK.get(b.status) ?? 99) || b.updatedAt - a.updatedAt)
    return { open: filtered.filter(qu => OPEN_SET.has(qu.status)), closed: filtered.filter(qu => !OPEN_SET.has(qu.status)) }
  }, [quests, query, typeFilter, statusFilter, characterFilter])

  const hasFilter = query || typeFilter || statusFilter || characterFilter
  const closedVisible = showClosed || (statusFilter !== '' && !OPEN_SET.has(statusFilter))

  return (
    <>
      <div className="px-4 py-3 flex flex-col gap-2 border-b border-[var(--accent)]/20">
        <div className="flex gap-2">
          <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Hledat podle názvu…" className={`${inputClass} py-1.5 text-sm flex-1`} />
          <button type="button" onClick={onCreate} className="px-3 py-1 rounded-lg bg-[var(--accent)] text-white text-sm font-semibold hover:opacity-80 transition-opacity whitespace-nowrap">
            + Nový
          </button>
        </div>
        <div className="grid grid-cols-3 gap-2">
          <FilterSelect value={typeFilter} options={QUEST_TYPES} labels={QUEST_TYPE_LABELS} all="Všechny typy" onChange={setTypeFilter} />
          <FilterSelect value={statusFilter} options={QUEST_STATUSES} labels={QUEST_STATUS_LABELS} all="Všechny stavy" onChange={setStatusFilter} />
          <select value={characterFilter} onChange={(e) => setCharacterFilter(e.target.value)} className={`${inputClass} py-1 text-xs`}>
            <option value="">Každá postava</option>
            {characterOptions.map(c => <option key={c.name} value={c.name}>{c.label}</option>)}
          </select>
        </div>
        {hasFilter && (
          <button type="button" onClick={() => { setQuery(''); setTypeFilter(''); setStatusFilter(''); setCharacterFilter('') }} className="self-end text-xs opacity-70 hover:opacity-100 hover:text-[var(--accent)]">
            Zrušit filtry
          </button>
        )}
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-3 flex flex-col gap-3">
        {quests.length === 0 ? (
          <p className="text-sm opacity-70 text-center py-6">
            Zatím žádné questy. Zapiš si, co se postavy snaží udělat – úkol, cíl nebo dějovou linii.
          </p>
        ) : open.length === 0 && (!closedVisible || closed.length === 0) ? (
          <p className="text-sm opacity-70 text-center py-6">{hasFilter ? 'Filtru neodpovídá žádný běžící quest.' : 'Žádný běžící quest.'}</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {open.map(q => <QuestRow key={q.id} quest={q} onEdit={() => onEdit(q)} onStatusChange={(s) => onStatusChange(q, s)} />)}
          </ul>
        )}

        {closed.length > 0 && (
          <section className="flex flex-col gap-2">
            <button type="button" onClick={() => setShowClosed(v => !v)} className="flex items-center gap-2 text-xs uppercase tracking-wide opacity-70 hover:opacity-100 text-left">
              <span>{closedVisible ? '▾' : '▸'}</span>
              Splněné, neúspěšné a opuštěné ({closed.length})
            </button>
            {closedVisible && (
              <ul className="flex flex-col gap-2">
                {closed.map(q => <QuestRow key={q.id} quest={q} onEdit={() => onEdit(q)} onStatusChange={(s) => onStatusChange(q, s)} />)}
              </ul>
            )}
          </section>
        )}
      </div>
    </>
  )
}
