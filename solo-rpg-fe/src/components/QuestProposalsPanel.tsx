import { useState } from 'react'
import type { QuestProposal } from '@solo-rpg/shared'
import { inputClass } from '../utils/forms'

export interface PendingQuestProposal extends QuestProposal {
  /** Klíč v seznamu (návrhy z víc scén se sčítají) */
  key: string
  /** Scéna, z jejíhož shrnutí návrh vzešel */
  sceneTitle: string
}

interface QuestProposalsPanelProps {
  proposals: PendingQuestProposal[]
  /** Vytvoří quest (název + popis); po úspěchu rodič návrh odebere */
  onAccept: (proposal: PendingQuestProposal) => Promise<void>
  onReject: (key: string) => void
  onClose: () => void
  darken?: boolean
}

/**
 * Nové questy, které AI navrhla při shrnutí scény. Hráč každý návrh schválí (uloží se jako quest s názvem a popisem,
 * ostatní pole zůstanou prázdná) nebo zamítne; název i popis lze před schválením upravit.
 */
export default function QuestProposalsPanel({ proposals, onAccept, onReject, onClose, darken }: QuestProposalsPanelProps) {
  if (!proposals.length) return null
  return (
    <div className={`flex-shrink-0 mx-4 mb-2 rounded-lg border border-amber-500 text-sm text-amber-50 ${darken ? 'bg-amber-950/90' : 'bg-amber-950/80'} max-h-[40vh] flex flex-col`}>
      <div className="flex items-center gap-3 px-4 py-2 border-b border-amber-500/40">
        <span className="font-semibold">🎯 AI navrhuje nové questy</span>
        <span className="text-amber-200/70 text-xs">{proposals.length} {proposals.length === 1 ? 'návrh' : proposals.length < 5 ? 'návrhy' : 'návrhů'} ze shrnutí scény</span>
        <button type="button" onClick={onClose} title="Zavřít (návrhy zahodit)" className="ml-auto px-2 py-0.5 rounded-md border border-amber-300/50 hover:border-amber-200 transition-colors">
          ✕
        </button>
      </div>
      <div className="overflow-y-auto px-4 py-2 flex flex-col gap-3">
        {proposals.map(p => (
          <ProposalRow key={p.key} proposal={p} onAccept={onAccept} onReject={() => onReject(p.key)} />
        ))}
      </div>
    </div>
  )
}

function ProposalRow({ proposal, onAccept, onReject }: { proposal: PendingQuestProposal; onAccept: (p: PendingQuestProposal) => Promise<void>; onReject: () => void }) {
  const [title, setTitle] = useState(proposal.title)
  const [description, setDescription] = useState(proposal.description)
  const [editing, setEditing] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const accept = async () => {
    const trimmed = title.trim()
    if (!trimmed) { setError('Vyplň název questu.'); return }
    setBusy(true)
    setError(null)
    try {
      await onAccept({ ...proposal, title: trimmed, description: description.trim() })
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Uložení questu selhalo.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex flex-col gap-1 rounded-md border border-amber-500/30 bg-black/20 px-3 py-2">
      {editing ? (
        <>
          <input value={title} onChange={e => setTitle(e.target.value)} disabled={busy} maxLength={100} className={`${inputClass} py-1 text-sm font-semibold`} placeholder="Název questu" />
          <textarea value={description} onChange={e => setDescription(e.target.value)} disabled={busy} rows={3} className={`${inputClass} text-sm`} placeholder="Co quest znamená" />
        </>
      ) : (
        <>
          <div className="flex items-baseline gap-2">
            <span className="font-semibold text-amber-100">🎯 {title}</span>
            <span className="text-xs text-amber-200/60">ze scény „{proposal.sceneTitle}“</span>
          </div>
          {description && <p className="whitespace-pre-wrap leading-snug text-amber-50/90">{description}</p>}
        </>
      )}
      {error && <div className="text-xs text-red-300">{error}</div>}
      <div className="flex flex-wrap items-center gap-2 pt-1">
        <button type="button" onClick={() => void accept()} disabled={busy} className="px-3 py-1 rounded-md border border-emerald-400 bg-emerald-700/50 hover:bg-emerald-600/60 transition-colors disabled:opacity-50">
          ✅ Vytvořit quest
        </button>
        <button type="button" onClick={onReject} disabled={busy} className="px-3 py-1 rounded-md border border-red-300/60 hover:border-red-200 hover:bg-red-900/40 transition-colors disabled:opacity-50">
          ❌ Zamítnout
        </button>
        <button type="button" onClick={() => setEditing(v => !v)} disabled={busy} className="text-xs text-amber-200/70 hover:text-amber-100">
          {editing ? 'hotovo' : '✏️ upravit'}
        </button>
      </div>
    </div>
  )
}
