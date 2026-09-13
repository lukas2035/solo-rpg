import { useEffect, useRef, useState } from 'react'
import type { SceneMeta } from '@solo-rpg/shared'
import ImageDropField from './ImageDropField'
import { inputClass, selectAll } from '../utils/forms'

/** Hodnoty formuláře; `image` = undefined → obrázek beze změny, null → odstranit, string → nový (data:/http URL) */
export interface SceneFormValues {
  title: string
  description: string
  image: string | null | undefined
}

interface SceneModalProps {
  /** Upravovaná scéna; null = vytvoření nové */
  scene: SceneMeta | null
  /** Aktuální obrázek scény jako URL použitelná v <img> */
  image: string | null
  /** Navržený název pro novou scénu */
  defaultTitle?: string
  /** Hra nemá žádnou scénu – dialog nelze zavřít bez vytvoření */
  required?: boolean
  /** Uloží scénu; při chybě (např. duplicitní název) vyhodí výjimku s hláškou pro uživatele */
  onSubmit: (values: SceneFormValues) => Promise<void>
  onDelete?: () => Promise<void>
  onClose: () => void
}

/** Dialog pro vytvoření a úpravu scény (název, obrázek = pozadí scény, markdown popis) */
export default function SceneModal({ scene, image, defaultTitle = '', required = false, onSubmit, onDelete, onClose }: SceneModalProps) {
  const isEdit = scene !== null
  const [title, setTitle] = useState(scene?.title ?? defaultTitle)
  const [description, setDescription] = useState(scene?.description ?? '')
  const [editImage, setEditImage] = useState<string | null>(image)
  const [imageChanged, setImageChanged] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const titleRef = useRef<HTMLInputElement | null>(null)

  const close = () => { if (!required) onClose() }

  useEffect(() => {
    if (required) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose, required])

  const handleImageChange = (next: string | null) => {
    setEditImage(next)
    setImageChanged(true)
  }

  const handleSubmit = async (e?: React.FormEvent) => {
    e?.preventDefault()
    if (saving) return
    const trimmed = title.trim()
    if (!trimmed) {
      setError('Vyplň název scény.')
      titleRef.current?.focus()
      return
    }
    setSaving(true)
    setError(null)
    try {
      await onSubmit({ title: trimmed, description, image: imageChanged ? editImage : undefined })
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Uložení scény selhalo.')
      titleRef.current?.focus()
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async () => {
    if (!onDelete || !scene) return
    if (!window.confirm(`Opravdu smazat scénu „${scene.title}“ včetně jejího souboru ve vaultu?`)) return
    setSaving(true)
    try {
      await onDelete()
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Smazání scény selhalo.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4" onClick={close}>
      <form
        onSubmit={handleSubmit}
        className="bg-[#111] border-2 border-[var(--accent)]/60 rounded-xl p-6 w-[720px] max-w-full max-h-full overflow-y-auto flex flex-col gap-4"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-xl font-bold text-[var(--accent)]">{isEdit ? 'Upravit scénu' : required ? 'První scéna' : 'Nová scéna'}</h2>
        {required && (
          <p className="text-sm text-[var(--text)] opacity-80">Hra zatím nemá žádnou scénu. Pojmenuj první scénu, ať je kam psát příběh.</p>
        )}

        <div className="flex gap-4 flex-col sm:flex-row">
          <div className="flex-1 flex flex-col gap-3">
            <label className="flex flex-col gap-1 text-left text-sm text-[var(--text)]">
              Název scény
              <input
                ref={titleRef}
                type="text"
                autoFocus
                value={title}
                onFocus={selectAll}
                onChange={(e) => setTitle(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); void handleSubmit() } }}
                className={inputClass}
              />
            </label>
            <label className="flex flex-col gap-1 text-left text-sm text-[var(--text)] flex-1">
              Popis <span className="opacity-60">(markdown, uloží se do souboru scény nad záznamy)</span>
              <textarea
                rows={6}
                value={description}
                onFocus={selectAll}
                onChange={(e) => setDescription(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && e.ctrlKey) {
                    e.preventDefault()
                    void handleSubmit()
                  }
                }}
                placeholder="Kde se scéna odehrává, kdo je přítomen, co je ve hře…"
                className={`${inputClass} font-mono text-sm resize-y whitespace-pre-wrap flex-1`}
              />
            </label>
          </div>

          <ImageDropField
            label="Obrázek scény (pozadí)"
            value={editImage}
            onChange={handleImageChange}
            removeLabel="Odebrat obrázek"
            className="sm:w-56"
          />
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
            {!required && (
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 rounded-lg border border-[var(--accent)]/40 text-[var(--text)] hover:border-[var(--accent)] transition-colors"
              >
                Zrušit
              </button>
            )}
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
