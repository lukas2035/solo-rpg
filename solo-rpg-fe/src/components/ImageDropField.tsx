import { useState } from 'react'

interface ImageDropFieldProps {
  label: string
  /** Aktuální náhled (URL / data:) nebo null */
  value: string | null
  /** Nová hodnota: data: URL souboru, http(s) URL, nebo null = odebrat */
  onChange: (image: string | null) => void
  /** Text tlačítka pro odebrání */
  removeLabel?: string
  className?: string
}

const isImageFile = (file: File) =>
  file.type.startsWith('image/') || /\.(png|jpe?g|jfif|gif|webp|avif|bmp|svg)$/i.test(file.name)

/** Pole pro výběr obrázku: klik otevře výběr souboru, podporuje drop souboru i obrázku z webu (URL). */
export default function ImageDropField({ label, value, onChange, removeLabel = 'Odebrat obrázek', className = '' }: ImageDropFieldProps) {
  const [dragOver, setDragOver] = useState(false)

  const readImageFile = (file: File) => {
    if (!isImageFile(file)) return
    const reader = new FileReader()
    reader.onload = (e) => onChange(e.target?.result as string)
    reader.readAsDataURL(file)
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setDragOver(false)
    const file = e.dataTransfer.files[0]
    if (file) {
      readImageFile(file)
      return
    }
    // Obrázek přetažený z webu (URL)
    const html = e.dataTransfer.getData('text/html')
    const srcMatch = html.match(/<img[^>]+src="([^"]+)"/i)
    const url = srcMatch?.[1] || e.dataTransfer.getData('text/uri-list') || e.dataTransfer.getData('text/plain')
    if (url && /^(https?:|data:image\/)/i.test(url.trim())) onChange(url.trim())
  }

  return (
    <div className={`flex flex-col gap-1 text-left text-sm text-[var(--text)] ${className}`}>
      {label}
      <label
        onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
        className={`flex-1 min-h-40 flex flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed p-3 cursor-pointer transition-colors ${dragOver ? 'border-[var(--accent)] bg-[var(--accent)]/10' : 'border-[var(--accent)]/40 hover:border-[var(--accent)]'}`}
      >
        {value ? (
          <img src={value} alt={label} className="max-h-40 rounded-md object-contain" />
        ) : (
          <span className="text-3xl opacity-50">+</span>
        )}
        <span className="text-xs opacity-70 text-center">Klikni nebo přetáhni obrázek</span>
        <input
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0]
            if (file) readImageFile(file)
            e.target.value = ''
          }}
        />
      </label>
      {value && (
        <button type="button" onClick={() => onChange(null)} className="self-start text-xs text-[var(--accent)] hover:underline">
          {removeLabel}
        </button>
      )}
    </div>
  )
}
