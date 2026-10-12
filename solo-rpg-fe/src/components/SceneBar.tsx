import type { SceneMeta } from '@solo-rpg/shared'
import { needsSummary } from '../utils/scenes'

interface SceneBarProps {
  scenes: SceneMeta[]
  currentSceneId: string | null
  onSelect: (sceneId: string) => void
  onCreate: () => void
  /** Otevře úpravu aktuální scény (název, popis, obrázek, smazání) */
  onEdit: (sceneId: string) => void
  /** Hromadně doplní AI shrnutí všem scénám, které ho nemají */
  onFillSummaries?: () => void
  /** Průběh hromadného doplňování (null = neběží) */
  summaryProgress?: { done: number; total: number; title: string } | null
  /** Zobrazovat mezi texty scény i prompty pro AI; undefined = zaškrtávátko se nenabízí (scéna bez AI i bez promptů) */
  showAiPrompts?: boolean
  onShowAiPromptsChange?: (value: boolean) => void
}

/** Tenký pás pro přepínání scén (každá scéna = samostatný .md soubor ve vaultu) */
export default function SceneBar({ scenes, currentSceneId, onSelect, onCreate, onEdit, onFillSummaries, summaryProgress = null, showAiPrompts, onShowAiPromptsChange }: SceneBarProps) {
  const current = scenes.find(s => s.id === currentSceneId) ?? null
  const missingSummaries = scenes.filter(needsSummary).length

  return (
    <div className="relative z-10 flex items-center gap-2 px-4 py-1.5 bg-black/60 border-b border-[var(--accent)]/40 text-sm">
      <span className="text-[var(--accent)] font-semibold">Scéna:</span>
      <select
        value={currentSceneId ?? ''}
        onChange={(e) => onSelect(e.target.value)}
        className="bg-black/60 border border-[var(--accent)]/60 rounded-md px-2 py-1 text-[var(--text)] focus:outline-none focus:border-[var(--accent)] max-w-xs"
      >
        {scenes.length === 0 && <option value="">— žádná scéna —</option>}
        {scenes.map(scene => (
          <option key={scene.id} value={scene.id}>
            {String(scene.order).padStart(2, '0')} · {scene.title}{needsSummary(scene) ? ' ⚠️' : ''}
          </option>
        ))}
      </select>
      <button
        type="button"
        onClick={onCreate}
        title="Nová scéna"
        className="w-7 h-7 rounded-md border border-[var(--accent)]/60 bg-black/50 flex items-center justify-center text-[var(--accent)] hover:bg-black/80 hover:border-[var(--accent)] transition-all"
      >
        +
      </button>
      {current && (
        <button
          type="button"
          onClick={() => onEdit(current.id)}
          title="Upravit aktuální scénu (název, popis, obrázek)"
          className="w-7 h-7 rounded-md border border-[var(--accent)]/60 bg-black/50 flex items-center justify-center text-xs text-[var(--accent)] hover:bg-black/80 hover:border-[var(--accent)] transition-all"
        >
          ✏️
        </button>
      )}
      {onFillSummaries && (summaryProgress || missingSummaries > 0) && (
        <button
          type="button"
          onClick={onFillSummaries}
          disabled={!!summaryProgress}
          title={summaryProgress
            ? `Shrnuje se scéna „${summaryProgress.title}“`
            : `Nechat AI doplnit shrnutí ${missingSummaries} scénám, které ho nemají nebo ho mají zastaralé (⚠️)`}
          className={`h-7 px-2 rounded-md border border-cyan-500/60 bg-black/50 flex items-center gap-1 text-xs text-cyan-200 hover:bg-black/80 hover:border-cyan-400 transition-all disabled:cursor-wait ${summaryProgress ? 'animate-pulse' : ''}`}
        >
          🤖 {summaryProgress ? `Shrnutí ${summaryProgress.done + 1}/${summaryProgress.total}…` : `Doplnit shrnutí (${missingSummaries})`}
        </button>
      )}
      {showAiPrompts !== undefined && onShowAiPromptsChange && (
        <label
          title="Zobrazit mezi texty scény i prompty zadané AI vypravěči (záznamy „Prompt AI“)"
          className="h-7 px-2 rounded-md border border-cyan-500/40 bg-black/50 flex items-center gap-1 text-xs text-cyan-200 cursor-pointer hover:border-cyan-400 transition-all select-none"
        >
          <input type="checkbox" checked={showAiPrompts} onChange={(e) => onShowAiPromptsChange(e.target.checked)} className="w-3.5 h-3.5 accent-cyan-400 cursor-pointer" />
          💬 Prompty
        </label>
      )}
      {current?.description && (
        <span className="text-xs text-[var(--text)] opacity-70 truncate max-w-md" title={current.description}>
          {current.description.split('\n')[0]}
        </span>
      )}
    </div>
  )
}
