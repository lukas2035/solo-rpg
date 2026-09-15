import { useMemo, useState } from 'react'
import type { LoreEntry, LoreKnowledge, LoreTruth, LoreType } from '@solo-rpg/shared'
import FilterSelect from './FilterSelect'
import { inputClass } from '../utils/forms'
import {
  LORE_KNOWLEDGES,
  LORE_KNOWLEDGE_CLASS,
  LORE_KNOWLEDGE_LABELS,
  LORE_TRUTHS,
  LORE_TRUTH_CLASS,
  LORE_TRUTH_LABELS,
  LORE_TYPES,
  LORE_TYPE_ICONS,
  LORE_TYPE_LABELS,
} from '../utils/lore'

interface LorePanelProps {
  lore: LoreEntry[]
  onCreate: () => void
  onEdit: (entry: LoreEntry) => void
  /** Rychlá změna osy „znalost postav“ / „pravdivost“ přímo ze seznamu */
  onKnowledgeChange: (entry: LoreEntry, knowledge: LoreKnowledge) => void
  onTruthChange: (entry: LoreEntry, truth: LoreTruth) => void
}

function LoreRow({ entry, onEdit, onKnowledgeChange, onTruthChange }: {
  entry: LoreEntry
  onEdit: () => void
  onKnowledgeChange: (knowledge: LoreKnowledge) => void
  onTruthChange: (truth: LoreTruth) => void
}) {
  const relationCount = entry.characters.length + entry.locations.length + entry.factions.length + entry.quests.length + entry.threads.length
  const excerpt = entry.content.trim().split('\n')[0]?.slice(0, 110) ?? ''
  return (
    <li className="rounded-lg border border-[var(--accent)]/30 bg-black/40 p-2.5 flex gap-2.5">
      <button type="button" onClick={onEdit} title={LORE_TYPE_LABELS[entry.type]} className="w-11 h-11 rounded-lg bg-gray-800 flex-shrink-0 flex items-center justify-center text-xl border border-[var(--accent)]/30 hover:border-[var(--accent)]">
        {LORE_TYPE_ICONS[entry.type]}
      </button>
      <div className="flex-1 min-w-0 flex flex-col gap-1">
        <button type="button" onClick={onEdit} className="text-left font-semibold text-[var(--text)] hover:text-[var(--accent)] transition-colors leading-5 truncate" title={entry.title}>
          {entry.title}
        </button>
        {excerpt && <p className="text-xs text-[var(--text)] opacity-70 truncate" title={excerpt}>{excerpt}</p>}
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-[var(--text)] opacity-80">
          <span>{LORE_TYPE_LABELS[entry.type]}</span>
          <select
            value={entry.knowledge}
            onChange={(e) => onKnowledgeChange(e.target.value as LoreKnowledge)}
            title="Jak dobře to postavy znají"
            className={`text-xs font-semibold rounded-full border px-2 py-0.5 cursor-pointer bg-black/60 ${LORE_KNOWLEDGE_CLASS[entry.knowledge]}`}
          >
            {LORE_KNOWLEDGES.map(k => <option key={k} value={k} className="bg-[#111] text-white">{LORE_KNOWLEDGE_LABELS[k]}</option>)}
          </select>
          <select
            value={entry.truth}
            onChange={(e) => onTruthChange(e.target.value as LoreTruth)}
            title="Je to skutečně pravda?"
            className={`text-xs font-semibold rounded-full border px-2 py-0.5 cursor-pointer bg-black/60 ${LORE_TRUTH_CLASS[entry.truth]}`}
          >
            {LORE_TRUTHS.map(t => <option key={t} value={t} className="bg-[#111] text-white">{LORE_TRUTH_LABELS[t]}</option>)}
          </select>
          {relationCount > 0 && (
            <>
              <span className="opacity-50">·</span>
              <span title="Počet propojených entit">🔗 {relationCount}</span>
            </>
          )}
          {entry.secrets.trim() && <span title="Záznam má skrytou skutečnou pravdu">🔒</span>}
        </div>
      </div>
    </li>
  )
}

/** Obsah záložky „Lore“ v postranním panelu – encyklopedie světa s hledáním i v obsahu */
export default function LorePanel({ lore, onCreate, onEdit, onKnowledgeChange, onTruthChange }: LorePanelProps) {
  const [query, setQuery] = useState('')
  const [typeFilter, setTypeFilter] = useState<LoreType | ''>('')
  const [truthFilter, setTruthFilter] = useState<LoreTruth | ''>('')
  const [knowledgeFilter, setKnowledgeFilter] = useState<LoreKnowledge | ''>('')

  const hasFilter = Boolean(query || typeFilter || truthFilter || knowledgeFilter)

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase()
    return lore
      .filter(l =>
        (!q || l.title.toLowerCase().includes(q) || l.content.toLowerCase().includes(q)) &&
        (!typeFilter || l.type === typeFilter) &&
        (!truthFilter || l.truth === truthFilter) &&
        (!knowledgeFilter || l.knowledge === knowledgeFilter),
      )
      .sort((a, b) => a.title.localeCompare(b.title, 'cs'))
  }, [lore, query, typeFilter, truthFilter, knowledgeFilter])

  return (
    <>
      <div className="px-4 py-3 flex flex-col gap-2 border-b border-[var(--accent)]/20">
        <div className="flex gap-2">
          <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Hledat v názvu i obsahu…" className={`${inputClass} py-1.5 text-sm flex-1`} />
          <button type="button" onClick={onCreate} className="px-3 py-1 rounded-lg bg-[var(--accent)] text-white text-sm font-semibold hover:opacity-80 transition-opacity whitespace-nowrap">
            + Nový
          </button>
        </div>
        <div className="grid grid-cols-3 gap-2">
          <FilterSelect value={typeFilter} options={LORE_TYPES} labels={LORE_TYPE_LABELS} all="Všechny typy" onChange={setTypeFilter} />
          <FilterSelect value={knowledgeFilter} options={LORE_KNOWLEDGES} labels={LORE_KNOWLEDGE_LABELS} all="Znalost: vše" onChange={setKnowledgeFilter} />
          <FilterSelect value={truthFilter} options={LORE_TRUTHS} labels={LORE_TRUTH_LABELS} all="Pravdivost: vše" onChange={setTruthFilter} />
        </div>
        {hasFilter && (
          <button type="button" onClick={() => { setQuery(''); setTypeFilter(''); setTruthFilter(''); setKnowledgeFilter('') }} className="self-end text-xs opacity-70 hover:opacity-100 hover:text-[var(--accent)]">
            Zrušit filtry
          </button>
        )}
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-3 flex flex-col gap-3">
        {lore.length === 0 ? (
          <p className="text-sm opacity-70 text-center py-6">
            Zatím žádné záznamy. Lore je encyklopedie světa – historie, legendy, náboženství, magie… Co postavy znají, a co je pravda.
          </p>
        ) : visible.length === 0 ? (
          <p className="text-sm opacity-70 text-center py-6">Filtru neodpovídá žádný záznam.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {visible.map(l => (
              <LoreRow
                key={l.id}
                entry={l}
                onEdit={() => onEdit(l)}
                onKnowledgeChange={(k) => onKnowledgeChange(l, k)}
                onTruthChange={(t) => onTruthChange(l, t)}
              />
            ))}
          </ul>
        )}
      </div>
    </>
  )
}
