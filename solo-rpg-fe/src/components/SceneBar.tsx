import type { SceneMeta } from '@solo-rpg/shared'

interface SceneBarProps {
  scenes: SceneMeta[]
  currentSceneId: string | null
  onSelect: (sceneId: string) => void
  onCreate: () => void
  onDelete: (sceneId: string) => void
}

/** Tenký pás pro přepínání scén (každá scéna = samostatný .md soubor ve vaultu) */
export default function SceneBar({ scenes, currentSceneId, onSelect, onCreate, onDelete }: SceneBarProps) {
  const current = scenes.find(s => s.id === currentSceneId) ?? null

  return (
    <div className="relative z-10 flex items-center gap-2 px-4 py-1.5 bg-black/60 border-b border-[var(--accent)]/40 text-sm">
      <span className="text-[var(--accent)] font-semibold">Scéna:</span>
      <select
        value={currentSceneId ?? ''}
        onChange={(e) => onSelect(e.target.value)}
        className="bg-black/60 border border-[var(--accent)]/60 rounded-md px-2 py-1 text-[var(--text)] focus:outline-none focus:border-[var(--accent)] max-w-xs"
      >
        {scenes.map(scene => (
          <option key={scene.id} value={scene.id}>
            {String(scene.order).padStart(2, '0')} · {scene.title}
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
      {current && scenes.length > 1 && (
        <button
          type="button"
          onClick={() => onDelete(current.id)}
          title="Smazat aktuální scénu"
          className="w-7 h-7 rounded-md border border-red-400/60 bg-black/50 flex items-center justify-center text-red-400 hover:bg-black/80 hover:border-red-400 transition-all"
        >
          ×
        </button>
      )}
      <span className="ml-auto text-xs text-[var(--text)] opacity-60 truncate">
        Ukládá se do Obsidian vaultu · úpravy z Obsidianu načteš tlačítky 📂 / 💬
      </span>
    </div>
  )
}
