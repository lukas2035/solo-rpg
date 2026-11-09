import { useEffect, useMemo, useState } from 'react'
import { DEFAULT_PROSE_BACKGROUND, PROSE_FONT_LIGHT, type ImageRef, type Note, type ProseDoc, type SceneMeta } from '@solo-rpg/shared'
import * as api from '../utils/api'
import ProseEditor from './ProseEditor'

interface NotesViewProps {
  game: string
  notes: Note[]
  /** Aktuální scéna – určuje připnuté listy (řazení, výchozí výběr, 📌) a vzhled stránky (pozadí, písmo) */
  scene: SceneMeta | null
  /** Listy se změnily (vytvoření / přejmenování / smazání) – rodič znovu načte listy i scény (názvy v připnutí) */
  onNotesChanged: () => Promise<void>
  /** Uloží seznam listů připnutých k aktuální scéně */
  onPinnedChange: (noteTitles: string[]) => Promise<void>
  /** Otevře hromadnou správu připnutí ke scénám */
  onOpenBulkPin: () => void
  onUploadImage: (image: File | string) => Promise<ImageRef>
  onLibraryChanged: () => Promise<void>
  /** `floating` = vyplní plovoucí okno bez okrajů; `inplace` = karta na místě scény */
  variant: 'inplace' | 'floating'
}

/** Listy seřazené: připnuté k aktuální scéně první (abecedně), pak ostatní abecedně */
function orderNotes(notes: Note[], pinned: readonly string[]): Note[] {
  const pinnedSet = new Set(pinned)
  const byTitle = (a: Note, b: Note) => a.title.localeCompare(b.title, 'cs')
  return [...notes.filter(n => pinnedSet.has(n.title)).sort(byTitle), ...notes.filter(n => !pinnedSet.has(n.title)).sort(byTitle)]
}

/**
 * Poznámkové listy hráče: nahoře výběr listu (připnuté k aktuální scéně první), pod ním stejný editor jako próza.
 * Výchozí list po přepnutí scény = první připnutý (abecedně), jinak první abecedně.
 */
export default function NotesView({ game, notes, scene, onNotesChanged, onPinnedChange, onOpenBulkPin, onUploadImage, onLibraryChanged, variant }: NotesViewProps) {
  const pinned = useMemo(() => scene?.notes ?? [], [scene?.notes])
  const ordered = useMemo(() => orderNotes(notes, pinned), [notes, pinned])
  // Výběr listu platí pro scénu, ve které byl zvolen; po přepnutí scény se vrátí k výchozímu (první připnutý)
  const sceneId = scene?.id ?? null
  const [selection, setSelection] = useState<{ sceneId: string | null; noteId: string | null }>({ sceneId, noteId: null })
  const setSelectedId = (noteId: string | null) => setSelection({ sceneId, noteId })
  const selectedId = selection.sceneId === sceneId ? selection.noteId : null
  const [loaded, setLoaded] = useState<{ noteId: string; doc: ProseDoc | null } | null>(null)
  const [titleDialog, setTitleDialog] = useState<{ mode: 'create' | 'rename'; value: string } | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const selected = ordered.find(n => n.id === selectedId) ?? ordered[0] ?? null

  useEffect(() => {
    if (!selected) return
    if (loaded?.noteId === selected.id) return
    let cancelled = false
    api.getNoteDoc(game, selected.id)
      .then(result => { if (!cancelled) setLoaded({ noteId: selected.id, doc: result.doc }) })
      .catch(err => { if (!cancelled) setError(err instanceof Error ? err.message : 'Načtení poznámek selhalo.') })
    return () => { cancelled = true }
  }, [game, selected, loaded?.noteId])

  const handleSave = async (noteId: string, doc: ProseDoc) => {
    await api.saveNoteDoc(game, noteId, doc)
    setLoaded(prev => (prev?.noteId === noteId ? { noteId, doc } : prev))
  }

  const run = async (action: () => Promise<void>, fallback: string) => {
    setBusy(true)
    setError(null)
    try {
      await action()
    } catch (err) {
      setError(err instanceof Error ? err.message : fallback)
    } finally {
      setBusy(false)
    }
  }

  const submitTitle = async (title: string) => {
    const trimmed = title.trim()
    if (!trimmed || !titleDialog) return
    const mode = titleDialog.mode
    setTitleDialog(null)
    await run(async () => {
      if (mode === 'create') {
        const created = await api.createNote(game, { title: trimmed })
        // Nový list rovnou připnout k aktuální scéně
        if (scene) await onPinnedChange([...pinned, created.title])
        await onNotesChanged()
        setSelectedId(created.id)
      } else if (selected) {
        await api.updateNote(game, selected.id, { title: trimmed })
        await onNotesChanged()
      }
    }, 'Uložení listu selhalo.')
  }

  const handleDelete = async () => {
    if (!selected) return
    if (!window.confirm(`Smazat poznámkový list „${selected.title}“ včetně obsahu? Tohle nejde vrátit.`)) return
    await run(async () => {
      await api.deleteNote(game, selected.id)
      setLoaded(null)
      setSelectedId(null)
      await onNotesChanged()
    }, 'Smazání listu selhalo.')
  }

  const isPinned = selected ? pinned.includes(selected.title) : false
  const togglePin = async () => {
    if (!selected || !scene) return
    await run(() => onPinnedChange(isPinned ? pinned.filter(t => t !== selected.title) : [...pinned, selected.title]), 'Připnutí se nepodařilo uložit.')
  }

  const toolButton = 'px-2 h-7 min-w-7 rounded-md text-sm hover:bg-white/15 disabled:opacity-40 transition-colors'
  const header = (
    <>
      <span className="text-xs opacity-60 mr-1">📝</span>
      <select
        value={selected?.id ?? ''}
        onChange={e => setSelectedId(e.target.value)}
        disabled={busy || ordered.length === 0}
        title="Který poznámkový list zobrazit (připnuté k této scéně jsou první)"
        className="h-7 max-w-[220px] px-2 rounded-md bg-white/10 border border-white/15 text-sm text-white outline-none focus:border-[var(--accent)]"
      >
        {ordered.map(n => (
          <option key={n.id} value={n.id} className="bg-[#111]">
            {pinned.includes(n.title) ? '📌 ' : ''}{n.title}
          </option>
        ))}
      </select>
      <button type="button" title="Nový poznámkový list" disabled={busy} onClick={() => setTitleDialog({ mode: 'create', value: '' })} className={toolButton}>➕</button>
      <button type="button" title="Přejmenovat list" disabled={busy || !selected} onClick={() => selected && setTitleDialog({ mode: 'rename', value: selected.title })} className={toolButton}>✏️</button>
      <button type="button" title="Smazat list" disabled={busy || !selected} onClick={handleDelete} className={`${toolButton} hover:bg-red-500/30`}>🗑</button>
      <button
        type="button"
        title={isPinned ? 'Připnuto k aktuální scéně – kliknutím odepnout' : 'Připnout k aktuální scéně'}
        disabled={busy || !selected || !scene}
        onClick={togglePin}
        className={`${toolButton} ${isPinned ? 'bg-[var(--accent)]/40' : ''}`}
      >
        📌
      </button>
      <button type="button" title="Hromadně přiřadit listy ke scénám" disabled={busy} onClick={onOpenBulkPin} className={toolButton}>🗂 Scény</button>
    </>
  )

  const wrapperClass = variant === 'floating'
    ? 'flex-1 min-h-0 flex flex-col'
    : 'flex-1 min-h-0 flex flex-col m-4 mt-0 rounded-xl overflow-hidden border border-white/10 shadow-xl'

  return (
    <div className={`${wrapperClass} relative`}>
      {ordered.length === 0 ? (
        <div className="flex-1 flex flex-col items-center justify-center gap-3 bg-black/70 text-[var(--text)] p-6 text-center">
          <p className="opacity-80 max-w-md text-sm">
            Zatím nemáš žádný poznámkový list. Listy jsou nezávislé a můžeš je připínat ke scénám – u každé další scény se připnutí převezme z předchozí.
          </p>
          <button
            type="button"
            disabled={busy}
            onClick={() => setTitleDialog({ mode: 'create', value: '' })}
            className="px-4 py-2 rounded-lg bg-[var(--accent)] text-black font-semibold hover:brightness-110 transition disabled:opacity-50"
          >
            ➕ Vytvořit první list
          </button>
          {error && <p className="text-sm text-red-300">{error}</p>}
        </div>
      ) : (
        <ProseEditor
          game={game}
          sceneId={selected?.id ?? ''}
          doc={selected && loaded?.noteId === selected.id ? loaded.doc : undefined}
          background={scene?.proseBackground ?? DEFAULT_PROSE_BACKGROUND}
          font={scene?.proseFont ?? PROSE_FONT_LIGHT}
          onSave={handleSave}
          onUploadImage={onUploadImage}
          onLibraryChanged={async () => { setLoaded(null); await onLibraryChanged() }}
          placeholder="Průběžné poznámky k dobrodružství… „# “ pro nadpis, „- “ pro seznam, ▦ pro tabulku"
          className="flex-1 min-h-0 flex flex-col"
          toolbarStart={header}
        />
      )}
      {error && ordered.length > 0 && (
        <div className="absolute bottom-2 left-1/2 -translate-x-1/2 px-3 py-1.5 rounded-md bg-red-900/90 text-red-100 text-sm shadow-lg">
          {error} <button type="button" onClick={() => setError(null)} className="ml-2 underline">zavřít</button>
        </div>
      )}
      {titleDialog && (
        <NoteTitleDialog
          mode={titleDialog.mode}
          initial={titleDialog.value}
          existing={notes.map(n => n.title).filter(t => titleDialog.mode === 'create' || t !== selected?.title)}
          onSubmit={submitTitle}
          onClose={() => setTitleDialog(null)}
        />
      )}
    </div>
  )
}

interface NoteTitleDialogProps {
  mode: 'create' | 'rename'
  initial: string
  existing: string[]
  onSubmit: (title: string) => void
  onClose: () => void
}

function NoteTitleDialog({ mode, initial, existing, onSubmit, onClose }: NoteTitleDialogProps) {
  const [value, setValue] = useState(initial)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])
  const trimmed = value.trim()
  const duplicate = existing.some(t => t.localeCompare(trimmed, 'cs', { sensitivity: 'accent' }) === 0)

  return (
    <div className="fixed inset-0 z-[60] bg-black/70 flex items-center justify-center p-4" onClick={onClose}>
      <form
        onSubmit={e => { e.preventDefault(); if (trimmed && !duplicate) onSubmit(trimmed) }}
        onClick={e => e.stopPropagation()}
        className="bg-[#111] border-2 border-[var(--accent)]/60 rounded-xl p-5 w-[380px] max-w-full flex flex-col gap-3"
      >
        <h2 className="text-lg font-bold text-[var(--accent)]">{mode === 'create' ? '➕ Nový poznámkový list' : '✏️ Přejmenovat list'}</h2>
        <input
          autoFocus
          value={value}
          onChange={e => setValue(e.target.value)}
          maxLength={100}
          placeholder="Např. Město Ravenholm, Expedice na sever…"
          className="px-3 py-2 rounded-md bg-black/60 border border-[var(--accent)]/40 text-[var(--text)] focus:border-[var(--accent)] outline-none"
        />
        {duplicate && <p className="text-xs text-red-300">List s tímto názvem už existuje.</p>}
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onClose} className="px-3 py-1.5 rounded-lg border border-white/20 text-[var(--text)] hover:bg-white/10 transition-colors">Zrušit</button>
          <button type="submit" disabled={!trimmed || duplicate} className="px-3 py-1.5 rounded-lg bg-[var(--accent)] text-black font-semibold hover:brightness-110 transition disabled:opacity-50">
            {mode === 'create' ? 'Vytvořit' : 'Uložit'}
          </button>
        </div>
      </form>
    </div>
  )
}
