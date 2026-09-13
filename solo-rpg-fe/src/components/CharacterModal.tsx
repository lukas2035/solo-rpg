import { useEffect, useRef, useState } from 'react'
import type { Character } from '@solo-rpg/shared'
import ImageDropField from './ImageDropField'
import { inputClass, selectAll } from '../utils/forms'

/** Hodnoty formuláře; `image` = undefined → portrét beze změny, null → odstranit, string → nový (data:/http URL) */
export interface CharacterFormValues {
  firstName: string
  lastName: string
  nickname: string
  notes: string
  image: string | null | undefined
}

interface CharacterModalProps {
  /** Upravovaná postava; null = vytvoření nové */
  character: Character | null
  /** Aktuální portrét jako URL použitelná v <img> */
  image: string | null
  /** Uloží postavu; při chybě (např. duplicitní jméno) vyhodí výjimku s hláškou pro uživatele */
  onSubmit: (values: CharacterFormValues) => Promise<void>
  onDelete?: () => Promise<void>
  onClose: () => void
}

/** Dialog pro vytvoření a úpravu postavy (jméno, příjmení, nickname, portrét, markdown poznámky) */
export default function CharacterModal({ character, image, onSubmit, onDelete, onClose }: CharacterModalProps) {
  const isEdit = character !== null
  const [firstName, setFirstName] = useState(character?.firstName ?? '')
  const [lastName, setLastName] = useState(character?.lastName ?? '')
  const [nickname, setNickname] = useState(character?.nickname ?? '')
  // Nickname sleduje křestní jméno, dokud ho uživatel ručně nepřepíše
  const [nicknameAuto, setNicknameAuto] = useState(!character || character.nickname === character.firstName)
  const [notes, setNotes] = useState(character?.notes ?? '')
  const [editImage, setEditImage] = useState<string | null>(image)
  const [imageChanged, setImageChanged] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const firstNameRef = useRef<HTMLInputElement | null>(null)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const handleFirstNameChange = (value: string) => {
    setFirstName(value)
    if (nicknameAuto) setNickname(value)
  }

  const handleNicknameChange = (value: string) => {
    setNickname(value)
    setNicknameAuto(value === '' || value === firstName)
  }

  const handleImageChange = (next: string | null) => {
    setEditImage(next)
    setImageChanged(true)
  }

  const handleSubmit = async (e?: React.FormEvent) => {
    e?.preventDefault()
    if (saving) return
    const first = firstName.trim()
    const nick = nickname.trim() || first
    if (!first) {
      setError('Vyplň jméno postavy.')
      firstNameRef.current?.focus()
      return
    }
    setSaving(true)
    setError(null)
    try {
      await onSubmit({
        firstName: first,
        lastName: lastName.trim(),
        nickname: nick,
        notes,
        image: imageChanged ? editImage : undefined,
      })
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Uložení postavy selhalo.')
      firstNameRef.current?.focus()
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async () => {
    if (!onDelete || !character) return
    if (!window.confirm(`Opravdu chceš smazat postavu „${character.name}“ včetně jejího souboru ve vaultu?`)) return
    setSaving(true)
    try {
      await onDelete()
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Smazání postavy selhalo.')
    } finally {
      setSaving(false)
    }
  }

  const submitOnEnter = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      void handleSubmit()
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4" onClick={onClose}>
      <form
        onSubmit={handleSubmit}
        className="bg-[#111] border-2 border-[var(--accent)]/60 rounded-xl p-6 w-[720px] max-w-full max-h-full overflow-y-auto flex flex-col gap-4"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-xl font-bold text-[var(--accent)]">{isEdit ? 'Upravit postavu' : 'Nová postava'}</h2>

        <div className="flex gap-4 flex-col sm:flex-row">
          <div className="flex-1 flex flex-col gap-3">
            <label className="flex flex-col gap-1 text-left text-sm text-[var(--text)]">
              Jméno
              <input
                ref={firstNameRef}
                type="text"
                autoFocus
                value={firstName}
                onFocus={selectAll}
                onChange={(e) => handleFirstNameChange(e.target.value)}
                onKeyDown={submitOnEnter}
                className={inputClass}
              />
            </label>
            <label className="flex flex-col gap-1 text-left text-sm text-[var(--text)]">
              Příjmení
              <input
                type="text"
                value={lastName}
                onFocus={selectAll}
                onChange={(e) => setLastName(e.target.value)}
                onKeyDown={submitOnEnter}
                className={inputClass}
              />
            </label>
            <label className="flex flex-col gap-1 text-left text-sm text-[var(--text)]">
              Nickname <span className="opacity-60">(zobrazuje se u replik)</span>
              <input
                type="text"
                value={nickname}
                onFocus={selectAll}
                onChange={(e) => handleNicknameChange(e.target.value)}
                onKeyDown={submitOnEnter}
                className={inputClass}
              />
            </label>
          </div>

          <ImageDropField label="Portrét" value={editImage} onChange={handleImageChange} removeLabel="Odebrat portrét" className="sm:w-56" />
        </div>

        <label className="flex flex-col gap-1 text-left text-sm text-[var(--text)]">
          Poznámky <span className="opacity-60">(markdown, tělo souboru postavy v Obsidianu)</span>
          <textarea
            rows={8}
            value={notes}
            onFocus={selectAll}
            onChange={(e) => setNotes(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && e.ctrlKey) {
                e.preventDefault()
                void handleSubmit()
              }
            }}
            placeholder="Popis, vzhled, motivace, vztahy…"
            className={`${inputClass} font-mono text-sm resize-y whitespace-pre-wrap`}
          />
        </label>

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
