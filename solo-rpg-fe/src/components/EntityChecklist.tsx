/** Položka checklistu entit (postava, frakce…) */
export interface EntityOption {
  /** Kanonický název = hodnota v seznamu vybraných */
  name: string
  /** Zobrazený text (nickname postavy, název frakce) */
  label: string
  image: string | null
  icon?: string
}

interface EntityChecklistProps {
  legend: React.ReactNode
  options: EntityOption[]
  selected: string[]
  onToggle: (name: string) => void
  emptyText: string
  columns?: 2 | 3
}

/** Mřížka zaškrtávacích políček s miniaturou – sdílená pro postavy a frakce v dialozích */
export default function EntityChecklist({ legend, options, selected, onToggle, emptyText, columns = 3 }: EntityChecklistProps) {
  return (
    <fieldset className="flex flex-col gap-2 text-left text-sm text-[var(--text)]">
      <legend className="mb-1">
        {legend} <span className="opacity-60">({selected.length})</span>
      </legend>
      {options.length === 0 ? (
        <p className="opacity-60 text-xs">{emptyText}</p>
      ) : (
        <div className={`grid grid-cols-2 ${columns === 3 ? 'sm:grid-cols-3' : ''} gap-2 max-h-40 overflow-y-auto pr-1`}>
          {options.map(o => {
            const checked = selected.includes(o.name)
            return (
              <label
                key={o.name}
                title={o.name}
                className={`flex items-center gap-2 px-2 py-1.5 rounded-lg border cursor-pointer select-none transition-colors ${
                  checked ? 'border-[var(--accent)] bg-[var(--accent)]/15' : 'border-[var(--accent)]/30 opacity-70 hover:opacity-100'
                }`}
              >
                <input type="checkbox" checked={checked} onChange={() => onToggle(o.name)} className="accent-[var(--accent)]" />
                <span className="w-7 h-7 rounded overflow-hidden bg-gray-800 flex-shrink-0 flex items-center justify-center text-xs">
                  {o.image ? <img src={o.image} alt="" className="w-full h-full object-cover" /> : o.icon ?? o.label.slice(0, 1)}
                </span>
                <span className="font-semibold truncate">{o.label}</span>
              </label>
            )
          })}
        </div>
      )}
    </fieldset>
  )
}
