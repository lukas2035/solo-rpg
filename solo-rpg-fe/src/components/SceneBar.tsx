import type { SceneMeta } from '@solo-rpg/shared'

interface SceneBarProps {
  scenes: SceneMeta[]
  currentSceneId: string | null
  onSelect: (sceneId: string) => void
  onCreate: () => void
  /** Otevře úpravu aktuální scény (název, popis, obrázek, smazání) */
  onEdit: (sceneId: string) => void
}

/** Tenký pás pro přepínání scén (každá scéna = samostatný .md soubor ve vaultu) */
export default function SceneBar({ scenes, currentSceneId, onSelect, onCreate, onEdit }: SceneBarProps) {
  const current = scenes.find(s => s.id === currentSceneId) ?? null

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
      {current?.description && (
        <span className="text-xs text-[var(--text)] opacity-70 truncate max-w-md" title={current.description}>
          {current.description.split('\n')[0]}
        </span>
      )}
      <span className="ml-auto text-xs text-[var(--text)] opacity-60 truncate">
        Ukládá se do Obsidian vaultu · úpravy z Obsidianu načteš tlačítky 📂 / 💬
      </span>
    </div>
  )
}
