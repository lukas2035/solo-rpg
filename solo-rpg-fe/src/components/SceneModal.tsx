import { useEffect, useRef, useState } from 'react'
import type { SceneMeta } from '@solo-rpg/shared'
import ImageDropField from './ImageDropField'
import CharacterModal, { type CharacterFormValues } from './CharacterModal'
import { inputClass, selectAll } from '../utils/forms'

/** Hodnoty formuláře; `image` = undefined → obrázek beze změny, null → odstranit, string → nový (data:/http URL) */
export interface SceneFormValues {
  title: string
  description: string
  image: string | null | undefined
  /** Celá jména postav přítomných ve scéně */
  characters: string[]
}

/** Postava hry nabízená v checklistu */
export interface SceneCharacterOption {
  name: string
  nickname: string
  /** URL portrétu použitelná v <img> */
  image: string | null
}

interface SceneModalProps {
  /** Upravovaná scéna; null = vytvoření nové */
  scene: SceneMeta | null
  /** Aktuální obrázek scény jako URL použitelná v <img> */
  image: string | null
  /** Navržený název pro novou scénu */
  defaultTitle?: string
  /** Předvybrané postavy pro novou scénu (typicky postavy poslední scény) */
  defaultCharacters?: string[]
  /** Všechny postavy hry, ze kterých scéna vybírá */
  allCharacters: SceneCharacterOption[]
  /** Hra nemá žádnou scénu – dialog nelze zavřít bez vytvoření */
  required?: boolean
  /** Uloží scénu; při chybě (např. duplicitní název) vyhodí výjimku s hláškou pro uživatele */
  onSubmit: (values: SceneFormValues) => Promise<void>
  /** Vytvoří novou postavu hry (z vnořeného dialogu postavy); vrátí ji pro checklist */
  onCreateCharacter?: (values: CharacterFormValues) => Promise<SceneCharacterOption>
  onDelete?: () => Promise<void>
  onClose: () => void
}

/** Dialog pro vytvoření a úpravu scény (název, obrázek = pozadí scény, markdown popis, přítomné postavy) */
export default function SceneModal({ scene, image, defaultTitle = '', defaultCharacters = [], allCharacters, required = false, onSubmit, onCreateCharacter, onDelete, onClose }: SceneModalProps) {
  const isEdit = scene !== null
  const [title, setTitle] = useState(scene?.title ?? defaultTitle)
  const [description, setDescription] = useState(scene?.description ?? '')
  const [selected, setSelected] = useState<string[]>(scene?.characters ?? defaultCharacters)
  const [creatingCharacter, setCreatingCharacter] = useState(false)
  const [editImage, setEditImage] = useState<string | null>(image)
  const [imageChanged, setImageChanged] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const titleRef = useRef<HTMLInputElement | null>(null)

  const close = () => { if (!required) onClose() }

  useEffect(() => {
    // Při otevřeném vnořeném dialogu postavy Esc zavírá jen ten
    if (required || creatingCharacter) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose, required, creatingCharacter])

  const handleCreateCharacter = async (values: CharacterFormValues) => {
    if (!onCreateCharacter) return
    const created = await onCreateCharacter(values)
    setSelected(prev => (prev.includes(created.name) ? prev : [...prev, created.name]))
  }

  const handleImageChange = (next: string | null) => {
    setEditImage(next)
    setImageChanged(true)
  }

  const toggleCharacter = (name: string) =>
    setSelected(prev => (prev.includes(name) ? prev.filter(n => n !== name) : [...prev, name]))

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
      await onSubmit({ title: trimmed, description, image: imageChanged ? editImage : undefined, characters: selected.filter(n => allCharacters.some(c => c.name === n)) })
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

        <fieldset className="flex flex-col gap-2 text-left text-sm text-[var(--text)]">
          <legend className="mb-1 flex items-center gap-3 w-full">
            <span>
              Postavy ve scéně <span className="opacity-60">({selected.length} z {allCharacters.length})</span>
            </span>
            {onCreateCharacter && (
              <button
                type="button"
                onClick={() => setCreatingCharacter(true)}
                title="Vytvořit novou postavu a přidat ji do scény"
                className="ml-auto px-2 py-1 rounded-md border border-dashed border-[var(--accent)]/70 text-xs text-[var(--accent)] hover:border-solid hover:bg-black/40 transition-all"
              >
                ＋ Nová postava
              </button>
            )}
          </legend>
          {allCharacters.length === 0 ? (
            <p className="opacity-60 text-xs">Hra zatím nemá žádné postavy – vytvoř první tlačítkem „Nová postava“.</p>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 max-h-48 overflow-y-auto pr-1">
              {allCharacters.map(c => {
                const checked = selected.includes(c.name)
                return (
                  <label
                    key={c.name}
                    title={checked ? `Odebrat ${c.name} ze scény` : `Přidat ${c.name} do scény`}
                    className={`flex items-center gap-2 px-2 py-1.5 rounded-lg border cursor-pointer select-none transition-colors ${
                      checked ? 'border-[var(--accent)] bg-[var(--accent)]/15' : 'border-[var(--accent)]/30 opacity-70 hover:opacity-100'
                    }`}
                  >
                    <input type="checkbox" checked={checked} onChange={() => toggleCharacter(c.name)} className="accent-[var(--accent)]" />
                    <span className="w-8 h-8 rounded overflow-hidden bg-gray-800 flex-shrink-0 flex items-center justify-center text-xs">
                      {c.image ? <img src={c.image} alt="" className="w-full h-full object-cover" /> : c.nickname.slice(0, 1)}
                    </span>
                    <span className="flex flex-col min-w-0">
                      <span className="font-semibold truncate">{c.nickname}</span>
                      {c.name !== c.nickname && <span className="text-xs opacity-60 truncate">{c.name}</span>}
                    </span>
                  </label>
                )
              })}
            </div>
          )}
        </fieldset>

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

      {/* Vnořený dialog nové postavy – vykreslen za formulářem, takže leží nad ním */}
      {creatingCharacter && (
        <div onClick={(e) => e.stopPropagation()}>
          <CharacterModal
            character={null}
            image={null}
            onSubmit={handleCreateCharacter}
            onClose={() => setCreatingCharacter(false)}
          />
        </div>
      )}
    </div>
  )
}
