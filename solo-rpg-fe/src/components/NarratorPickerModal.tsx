import { useEffect } from 'react'

/** Vypravěč s portrétem převedeným na URL použitelnou v <img> */
export interface NarratorOption {
  id: string
  name: string
  description: string
  image: string | null
}

interface NarratorPickerModalProps {
  narrators: NarratorOption[]
  /** Id aktuálního vypravěče hry; null = žádný */
  currentId: string | null
  /** Vybere vypravěče jako aktuálního */
  onSelect: (narratorId: string) => void
  /** Otevře úpravu vypravěče */
  onEdit: (narratorId: string) => void
  /** Otevře vytvoření nového vypravěče */
  onCreate: () => void
  onClose: () => void
}

/** Dialog se seznamem vypravěčů hry – výběr aktuálního, úprava a vytvoření nového */
export default function NarratorPickerModal({ narrators, currentId, onSelect, onEdit, onCreate, onClose }: NarratorPickerModalProps) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4" onClick={onClose}>
      <div
        className="bg-[#111] border-2 border-[var(--accent)]/60 rounded-xl p-6 w-[560px] max-w-full max-h-full overflow-y-auto flex flex-col gap-4"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-xl font-bold text-[var(--accent)]">Vypravěč</h2>

        {narrators.length === 0 ? (
          <p className="text-sm text-[var(--text)] opacity-80 text-left">
            Hra zatím nemá žádného vypravěče. Vytvoř prvního – bez něj nelze psát text vypravěče.
          </p>
        ) : (
          <ul className="flex flex-col gap-2">
            {narrators.map(narrator => {
              const selected = narrator.id === currentId
              return (
                <li key={narrator.id}>
                  <div
                    role="button"
                    tabIndex={0}
                    onClick={() => onSelect(narrator.id)}
                    onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onSelect(narrator.id) } }}
                    title={selected ? 'Aktuální vypravěč' : 'Vybrat jako aktuálního vypravěče'}
                    className={`flex items-center gap-3 p-2 rounded-lg border-2 cursor-pointer transition-all text-left ${
                      selected
                        ? 'border-[var(--accent)] bg-[var(--accent)]/15 shadow-[0_0_20px_rgba(170,59,255,0.3)]'
                        : 'border-[var(--accent)]/30 hover:border-[var(--accent)]/70 bg-black/40'
                    }`}
                  >
                    <div className="w-14 h-14 flex-shrink-0 rounded-md overflow-hidden border border-[var(--accent)]/50 bg-gray-800 flex items-center justify-center">
                      {narrator.image ? (
                        <img src={narrator.image} alt={narrator.name} className="w-full h-full object-cover" />
                      ) : (
                        <span className="text-lg text-[var(--text)]">{narrator.name.charAt(0)}</span>
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="font-semibold text-[var(--accent)] truncate">
                        {narrator.name}
                        {selected && <span className="ml-2 text-xs font-normal opacity-80">(aktuální)</span>}
                      </div>
                      {narrator.description && (
                        <div className="text-xs text-[var(--text)] opacity-70 truncate">{narrator.description.split('\n')[0]}</div>
                      )}
                    </div>
                    {selected && (
                      <span title="Aktuální vypravěč" className="w-8 h-8 flex-shrink-0 flex items-center justify-center text-lg font-bold text-[var(--accent)]">
                        ✓
                      </span>
                    )}
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); onEdit(narrator.id) }}
                      title="Upravit vypravěče"
                      className="w-8 h-8 flex-shrink-0 rounded-md border border-[var(--accent)]/60 bg-black/50 flex items-center justify-center text-sm text-[var(--accent)] hover:bg-black/80 hover:border-[var(--accent)] transition-all"
                    >
                      ✏️
                    </button>
                  </div>
                </li>
              )
            })}
          </ul>
        )}

        <div className="flex gap-3 items-center">
          <button
            type="button"
            onClick={onCreate}
            className="px-4 py-2 rounded-lg border-2 border-dashed border-[var(--accent)] text-[var(--accent)] hover:bg-black/60 hover:border-solid transition-all"
          >
            + Nový vypravěč
          </button>
          <button
            type="button"
            onClick={onClose}
            className="ml-auto px-4 py-2 rounded-lg border border-[var(--accent)]/40 text-[var(--text)] hover:border-[var(--accent)] transition-colors"
          >
            Zavřít
          </button>
        </div>
      </div>
    </div>
  )
}
