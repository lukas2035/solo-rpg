import { inputClass } from '../utils/forms'

/** Filtrovací select pro výčet v postranních panelech: prázdná hodnota = vše */
export default function FilterSelect<T extends string>({ value, options, labels, all, onChange }: {
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
