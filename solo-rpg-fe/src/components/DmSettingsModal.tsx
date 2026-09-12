import { useState } from 'react'

interface DmSettingsModalProps {
  /** Aktuální jméno vypravěče */
  name: string
  /** Aktuální portrét vypravěče (null = výchozí /dm.png) */
  image: string | null
  onSave: (name: string, image: string | null) => void
  onClose: () => void
}

/** Dialog pro přejmenování vypravěče (DM) a nastavení jeho portrétu */
export default function DmSettingsModal({ name, image, onSave, onClose }: DmSettingsModalProps) {
  const [editName, setEditName] = useState(name)
  const [editImage, setEditImage] = useState<string | null>(image)
  const [dragOver, setDragOver] = useState(false)

  const readImageFile = (file: File) => {
    if (!file.type.startsWith('image/')) return
    const reader = new FileReader()
    reader.onload = (e) => setEditImage(e.target?.result as string)
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
    // Přetažení obrázku z jiné stránky (URL)
    const url = e.dataTransfer.getData('text/uri-list') || e.dataTransfer.getData('text/plain')
    if (url && /^https?:\/\//.test(url)) {
      setEditImage(url)
    }
  }

  const handleSave = () => {
    const trimmed = editName.trim()
    onSave(trimmed || 'DM', editImage)
    onClose()
  }

  return (
    <div
      className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="bg-[#111] border-2 border-[var(--accent)]/60 rounded-xl p-6 w-96 max-w-full flex flex-col gap-4"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-xl font-bold text-[var(--accent)]">Nastavení vypravěče</h2>

        <label className="flex flex-col gap-1 text-left text-sm text-[var(--text)]">
          Jméno vypravěče
          <input
            type="text"
            autoFocus
            value={editName}
            onChange={(e) => setEditName(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') handleSave() }}
            placeholder="DM"
            className="px-3 py-2 rounded-lg border border-[var(--accent)]/40 bg-black/50 text-[var(--text)] focus:outline-none focus:border-[var(--accent)]"
          />
        </label>

        <div className="flex flex-col gap-1 text-left text-sm text-[var(--text)]">
          Portrét vypravěče
          <label
            onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
            onDragLeave={() => setDragOver(false)}
            onDrop={handleDrop}
            className={`flex flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed p-3 cursor-pointer transition-colors ${dragOver ? 'border-[var(--accent)] bg-[var(--accent)]/10' : 'border-[var(--accent)]/40 hover:border-[var(--accent)]'}`}
          >
            <img
              src={editImage ?? '/dm.png'}
              alt="Portrét vypravěče"
              className="max-h-40 rounded-md object-contain"
            />
            <span className="text-xs opacity-70">Klikni nebo přetáhni obrázek</span>
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
          {editImage && (
            <button
              type="button"
              onClick={() => setEditImage(null)}
              className="self-start text-xs text-[var(--accent)] hover:underline"
            >
              Vrátit výchozí portrét
            </button>
          )}
        </div>

        <div className="flex gap-3 justify-end">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-lg border border-[var(--accent)]/40 text-[var(--text)] hover:border-[var(--accent)] transition-colors"
          >
            Zrušit
          </button>
          <button
            type="button"
            onClick={handleSave}
            className="px-4 py-2 rounded-lg bg-[var(--accent)] text-white font-semibold hover:opacity-80 transition-opacity"
          >
            Uložit
          </button>
        </div>
      </div>
    </div>
  )
}
