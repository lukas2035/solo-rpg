import { useEffect, useRef, useState } from 'react'
import type { Narrator } from '@solo-rpg/shared'
import ImageDropField from './ImageDropField'
import { inputClass, selectAll } from '../utils/forms'

/** Hodnoty formuláře; `image` = undefined → portrét beze změny, null → odstranit, string → nový (data:/http URL) */
export interface NarratorFormValues {
  name: string
  description: string
  image: string | null | undefined
}

interface NarratorModalProps {
  /** Upravovaný vypravěč; null = vytvoření nového */
  narrator: Narrator | null
  /** Aktuální portrét jako URL použitelná v <img> */
  image: string | null
  /** Uloží vypravěče; při chybě (např. duplicitní jméno) vyhodí výjimku s hláškou pro uživatele */
  onSubmit: (values: NarratorFormValues) => Promise<void>
  onDelete?: () => Promise<void>
  onClose: () => void
}

/** Dialog pro vytvoření a úpravu vypravěče (jméno, portrét, markdown popis) */
export default function NarratorModal({ narrator, image, onSubmit, onDelete, onClose }: NarratorModalProps) {
  const isEdit = narrator !== null
  const [name, setName] = useState(narrator?.name ?? '')
  const [description, setDescription] = useState(narrator?.description ?? '')
  const [editImage, setEditImage] = useState<string | null>(image)
  const [imageChanged, setImageChanged] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const nameRef = useRef<HTMLInputElement | null>(null)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const handleImageChange = (next: string | null) => {
    setEditImage(next)
    setImageChanged(true)
  }

  const handleSubmit = async (e?: React.FormEvent) => {
    e?.preventDefault()
    if (saving) return
    const trimmed = name.trim()
    if (!trimmed) {
      setError('Vyplň jméno vypravěče.')
      nameRef.current?.focus()
      return
    }
    setSaving(true)
    setError(null)
    try {
      await onSubmit({ name: trimmed, description, image: imageChanged ? editImage : undefined })
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Uložení vypravěče selhalo.')
      nameRef.current?.focus()
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async () => {
    if (!onDelete || !narrator) return
    if (!window.confirm(`Opravdu chceš smazat vypravěče „${narrator.name}“ včetně jeho souboru ve vaultu?`)) return
    setSaving(true)
    try {
      await onDelete()
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Smazání vypravěče selhalo.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4" onClick={onClose}>
      <form
        onSubmit={handleSubmit}
        className="bg-[#111] border-2 border-[var(--accent)]/60 rounded-xl p-6 w-[720px] max-w-full max-h-full overflow-y-auto flex flex-col gap-4"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-xl font-bold text-[var(--accent)]">{isEdit ? 'Upravit vypravěče' : 'Nový vypravěč'}</h2>

        <div className="flex gap-4 flex-col sm:flex-row">
          <div className="flex-1 flex flex-col gap-3">
            <label className="flex flex-col gap-1 text-left text-sm text-[var(--text)]">
              Jméno
              <input
                ref={nameRef}
                type="text"
                autoFocus
                value={name}
                onFocus={selectAll}
                onChange={(e) => setName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault()
                    void handleSubmit()
                  }
                }}
                placeholder="např. Kronikář"
                className={inputClass}
              />
            </label>
            <label className="flex-1 flex flex-col gap-1 text-left text-sm text-[var(--text)]">
              Popis <span className="opacity-60">(markdown, tělo souboru vypravěče v Obsidianu)</span>
              <textarea
                rows={8}
                value={description}
                onFocus={selectAll}
                onChange={(e) => setDescription(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && e.ctrlKey) {
                    e.preventDefault()
                    void handleSubmit()
                  }
                }}
                placeholder="Styl vyprávění, tón, pravidla, které vypravěč dodržuje…"
                className={`${inputClass} flex-1 font-mono text-sm resize-y whitespace-pre-wrap`}
              />
            </label>
          </div>

          <ImageDropField label="Portrét" value={editImage} onChange={handleImageChange} removeLabel="Odebrat portrét" className="sm:w-56" />
        </div>

        {error && (
          <div className="px-3 py-2 rounded-lg bg-red-900/70 border border-red-500 text-sm text-red-100">{error}</div>
        )}

        <div className="flex gap-3 items-center">
          {isEdit && onDelete && (
            <button
              type="button"
              onClick={handleDelete}
              disabled={saving}
              className="px-4 py-2 rounded-lg border border-red-500/60 text-red-300 hover:border-red-400 hover:text-red-200 transition-colors disabled:opacity-50"
            >
              Smazat
            </button>
          )}
          <div className="ml-auto flex gap-3">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-lg border border-[var(--accent)]/40 text-[var(--text)] hover:border-[var(--accent)] transition-colors"
            >
              Zrušit
            </button>
            <button
              type="submit"
              disabled={saving}
              className="px-4 py-2 rounded-lg bg-[var(--accent)] text-white font-semibold hover:opacity-80 transition-opacity disabled:opacity-50"
            >
              {saving ? 'Ukládám…' : isEdit ? 'Uložit' : 'Vytvořit'}
            </button>
          </div>
        </div>
      </form>
    </div>
  )
}
