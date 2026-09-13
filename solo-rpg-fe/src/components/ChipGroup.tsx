/** Skupina přepínacích odznaků pro výčet (typ, stav, postoj…) – sdílené dialogy nití a frakcí */
export default function ChipGroup<T extends string>({ label, options, value, labels, hints, onChange, className }: {
  label: React.ReactNode
  options: readonly T[]
  value: T | null
  labels: Record<T, string>
  hints?: Record<T, string>
  onChange: (value: T) => void
  /** Doplňkové třídy podle hodnoty (např. barva stavu) */
  className?: (value: T, selected: boolean) => string
}) {
  return (
    <fieldset className="flex flex-col gap-1 text-left text-sm text-[var(--text)]">
      <legend className="mb-1">{label}</legend>
      <div className="flex flex-wrap gap-1.5">
        {options.map(option => {
          const selected = option === value
          const extra = className?.(option, selected) ?? ''
          return (
            <button
              key={option}
              type="button"
              title={hints?.[option]}
              onClick={() => onChange(option)}
              className={`px-2.5 py-1 rounded-full border text-xs font-semibold transition-all ${
                selected
                  ? `border-[var(--accent)] ${extra || 'bg-[var(--accent)]/25 text-white'} shadow-[0_0_12px_rgba(170,59,255,0.35)]`
                  : `border-[var(--accent)]/30 opacity-60 hover:opacity-100 hover:border-[var(--accent)]/70 ${extra}`
              }`}
            >
              {labels[option]}
            </button>
          )
        })}
      </div>
    </fieldset>
  )
}
