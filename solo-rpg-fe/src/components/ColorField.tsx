import { useState } from 'react'
import { inputClass } from '../utils/forms'

interface ColorFieldProps {
  value: string
  onChange: (hex: string) => void
  /** Rychlé volby barvy: [hex, popisek] */
  swatches?: [string, string][]
}

/** Výběr barvy `#rrggbb`: nativní color picker + textové pole s hex kódem + volitelné vzorníky */
export default function ColorField({ value, onChange, swatches = [] }: ColorFieldProps) {
  const [text, setText] = useState(value)
  const [lastValue, setLastValue] = useState(value)
  // Změna zvenčí (vzorník, předvolba) → srovnat textové pole
  if (value !== lastValue) {
    setLastValue(value)
    setText(value)
  }
  const set = (hex: string) => { onChange(hex); setText(hex) }

  return (
    <div className="flex items-center gap-2 flex-wrap">
      <input type="color" value={value} onChange={e => set(e.target.value)} className="w-10 h-8 rounded cursor-pointer bg-transparent border border-white/15" />
      <input
        type="text"
        value={text}
        onChange={e => {
          const v = e.target.value.trim()
          setText(v)
          if (/^#[0-9a-fA-F]{6}$/.test(v)) onChange(v)
        }}
        onBlur={() => setText(value)}
        className={`${inputClass} w-28 font-mono`}
      />
      {swatches.length > 0 && <span className="w-px h-6 bg-white/15 mx-1" />}
      {swatches.map(([hex, label]) => (
        <button
          key={hex}
          type="button"
          title={label}
          onClick={() => set(hex)}
          className={`w-7 h-7 rounded-md border ${value.toLowerCase() === hex.toLowerCase() ? 'border-cyan-400 ring-1 ring-cyan-400/60' : 'border-white/20'}`}
          style={{ backgroundColor: hex }}
        />
      ))}
    </div>
  )
}
