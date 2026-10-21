import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { EditorContent, NodeViewWrapper, ReactNodeViewRenderer, useEditor, type Editor, type JSONContent, type NodeViewProps } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Image from '@tiptap/extension-image'
import { Placeholder } from '@tiptap/extensions'
import { Markdown } from '@tiptap/markdown'
import type { ImageRef, ProseAiRequest, ProseBackground, ProseDoc, ProseFont, ProseFontPreset, ProseImageLayout, ProsePromptEntry } from '@solo-rpg/shared'
import { assetUrl, useAssetVersion } from '../utils/api'
import { proseBackgroundStyle, proseFontStyle } from '../utils/proseStyle'
import ProseAiModal, { type ProseAiDraft, type ProseRewriteTarget } from './ProseAiModal'
import ProseBackgroundModal, { type ProseBackgroundDraft } from './ProseBackgroundModal'
import ProseFontModal from './ProseFontModal'
import ProseImageLibraryModal from './ProseImageLibraryModal'
import FloatingPortrait from './FloatingPortrait'
import PortraitModal from './PortraitModal'
import { restoreMissingImages } from '../utils/proseImages'

/**
 * Textový editor pro scény v režimu „próza“ (WYSIWYG markdown přes TipTap/ProseMirror).
 *
 * Dokument se drží jako TipTap JSON (ProseDoc) a ukládá se automaticky s prodlevou; při odchodu ze scény
 * se rozpracovaný stav uloží okamžitě. Obrázky v textu nesou jako `src` odkaz do vaultu (ImageRef),
 * na URL se překládají až při vykreslení – export i přesun vaultu tak nic nerozbijí.
 */

interface ProseEditorProps {
  game: string
  /** Id scény – změna přepne dokument (a uloží ten předchozí) */
  sceneId: string
  /** Načtený dokument; null = nová prázdná scéna, undefined = ještě se načítá (editor je zatím jen pro čtení) */
  doc: ProseDoc | null | undefined
  /** Vzhled stránky (per scéna): pozadí a písmo */
  background: ProseBackground
  font: ProseFont
  /** Knihovna písem kampaně (GameSettings.proseFonts) */
  fontPresets: ProseFontPreset[]
  onSave: (sceneId: string, doc: ProseDoc) => Promise<void>
  /** Uloží obrázek (soubor nebo URL) do vaultu a vrátí odkaz pro `src` */
  onUploadImage: (image: File | string) => Promise<ImageRef>
  /** Uloží pozadí scény; nový soubor / URL v `image` rodič nejdřív nahraje */
  onBackgroundChange: (draft: ProseBackgroundDraft) => Promise<void>
  onFontChange: (font: ProseFont) => Promise<void>
  onFontPresetsChange: (presets: ProseFontPreset[]) => Promise<void>
  /** Knihovna obrázků změnila odkazy (nahrazení / smazání) – rodič znovu načte scény a dokument */
  onLibraryChanged: () => Promise<void>
  /** Historie AI této scény – pokyny i odpovědi (nejnovější první) */
  aiPrompts: ProsePromptEntry[]
  /** Pošle požadavek AI a vrátí markdown od modelu (pokračování, nebo nový úsek místo označeného) */
  onGenerateAi: (body: ProseAiRequest) => Promise<string>
  onDeleteAiPrompt: (entry: ProsePromptEntry) => Promise<void>
}

/** Úsek dokumentu k přepracování AI: pozice v ProseMirroru + markdown úseku a textu kolem (kontext pro model) */
interface AiSelectionRange extends ProseRewriteTarget {
  from: number
  to: number
}

/** Rozpracovaný návrh úpravy: úsek, pokyn a text od AI čekající na potvrzení */
interface AiDraft extends ProseAiDraft {
  range: AiSelectionRange
}

const SAVE_DELAY_MS = 1000

/** Prázdný dokument TipTapu (jeden prázdný odstavec) */
const EMPTY_DOC: ProseDoc = { type: 'doc', content: [{ type: 'paragraph' }] }

// Kontext pro NodeView obrázku (TipTap 3 vykresluje React NodeView uvnitř stromu editoru, takže context projde)
interface ProseImageContextValue {
  game: string
  onReplace: (pos: number, image: File | string) => void
  /** Otevřít obrázek v plovoucím okně (dvojklik na obrázek nebo 🗗 v jeho liště) */
  onFloat: (src: ImageRef) => void
}
const ProseImageContext = createContext<ProseImageContextValue>({ game: '', onReplace: () => {}, onFloat: () => {} })

/** Obrázek s rozložením: přes celou šířku / vlevo vedle textu / vpravo vedle textu */
const ProseImage = Image.extend({
  name: 'image',
  draggable: true,
  addAttributes() {
    return {
      ...this.parent?.(),
      layout: {
        default: 'full' as ProseImageLayout,
        parseHTML: element => (element.getAttribute('data-layout') as ProseImageLayout | null) ?? 'full',
        renderHTML: attributes => ({ 'data-layout': attributes.layout }),
      },
    }
  },
  addNodeView() {
    return ReactNodeViewRenderer(ProseImageView)
  },
})

const LAYOUTS: { value: ProseImageLayout; label: string; title: string }[] = [
  { value: 'full', label: '▬', title: 'Na celou šířku' },
  { value: 'left', label: '◧', title: 'Vlevo, text vpravo' },
  { value: 'right', label: '◨', title: 'Vpravo, text vlevo' },
]

function ProseImageView({ node, updateAttributes, deleteNode, selected, editor, getPos }: NodeViewProps) {
  const version = useAssetVersion()
  const storage = useContext(ProseImageContext)
  const src = typeof node.attrs.src === 'string' ? node.attrs.src : null
  const layout = (node.attrs.layout as ProseImageLayout) ?? 'full'
  const url = src ? assetUrl(storage.game, src, version) : null
  const fileRef = useRef<HTMLInputElement | null>(null)

  const layoutClass = layout === 'left'
    ? 'float-left w-1/2 mr-6 mb-2'
    : layout === 'right'
      ? 'float-right w-1/2 ml-6 mb-2'
      : 'w-full clear-both'

  return (
    <NodeViewWrapper
      as="figure"
      data-layout={layout}
      className={`prose-image group relative my-3 ${layoutClass} ${selected ? 'ring-2 ring-[var(--accent)] rounded-lg' : ''}`}
      data-drag-handle
    >
      {url ? (
        <img
          src={url}
          alt={typeof node.attrs.alt === 'string' ? node.attrs.alt : ''}
          title="Dvojklik = otevřít v plovoucím okně"
          onDoubleClick={e => { e.preventDefault(); if (src) storage.onFloat(src) }}
          className="block w-full h-auto rounded-lg select-none"
          draggable={false}
        />
      ) : (
        <div className="w-full aspect-video rounded-lg bg-black/40 flex items-center justify-center text-sm opacity-60">Obrázek chybí</div>
      )}
      {editor.isEditable && (
        <div
          contentEditable={false}
          className={`absolute top-2 left-1/2 -translate-x-1/2 flex gap-1 px-1.5 py-1 rounded-lg bg-black/80 border border-white/20 text-sm text-white shadow-lg transition-opacity ${
            selected ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
          }`}
        >
          {LAYOUTS.map(l => (
            <button
              key={l.value}
              type="button"
              title={l.title}
              onMouseDown={e => e.preventDefault()}
              onClick={() => updateAttributes({ layout: l.value })}
              className={`w-7 h-7 rounded-md hover:bg-white/15 ${layout === l.value ? 'bg-[var(--accent)]/40' : ''}`}
            >
              {l.label}
            </button>
          ))}
          <span className="w-px bg-white/20 mx-0.5" />
          <button
            type="button"
            title="Otevřít v plovoucím okně (nebo dvojklik na obrázek)"
            disabled={!src}
            onMouseDown={e => e.preventDefault()}
            onClick={() => { if (src) storage.onFloat(src) }}
            className="w-7 h-7 rounded-md hover:bg-white/15 disabled:opacity-40"
          >
            🗗
          </button>
          <button
            type="button"
            title="Nahradit obrázek"
            onMouseDown={e => e.preventDefault()}
            onClick={() => fileRef.current?.click()}
            className="w-7 h-7 rounded-md hover:bg-white/15"
          >
            🖼
          </button>
          <button type="button" title="Odstranit obrázek" onMouseDown={e => e.preventDefault()} onClick={() => deleteNode()} className="w-7 h-7 rounded-md hover:bg-red-500/40">
            ✕
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={e => {
              const file = e.target.files?.[0]
              e.target.value = ''
              const pos = getPos()
              if (file && typeof pos === 'number') storage.onReplace(pos, file)
            }}
          />
        </div>
      )}
    </NodeViewWrapper>
  )
}

const isImageFile = (file: File) => file.type.startsWith('image/')

/** Markdown části dokumentu mezi pozicemi (přes @tiptap/markdown; obrázky jako `![alt](src)`) */
function rangeToMarkdown(ed: Editor, from: number, to: number): string {
  if (to <= from) return ''
  const content = ed.state.doc.slice(from, to).content.toJSON() as JSONContent[] | null
  return (ed.markdown?.serialize({ type: 'doc', content: content ?? [] }) ?? '').trim()
}

/**
 * Úsek k přepracování AI: výběr v editoru rozšířený na celé bloky nejvyšší úrovně (odstavce, seznamy, citace…),
 * aby šel po návratu nahradit markdownem bez rozbití struktury. Bez výběru = celý dokument. Null = dokument je prázdný.
 */
function captureAiSelection(ed: Editor): AiSelectionRange | null {
  const { doc, selection } = ed.state
  let from = 0
  let to = doc.content.size
  let whole = true
  if (!selection.empty) {
    const $from = doc.resolve(selection.from)
    const $to = doc.resolve(selection.to)
    from = $from.depth >= 1 ? $from.before(1) : selection.from
    // Výběr končící na začátku dalšího bloku (typicky tažením přes konec odstavce) ten blok nezahrnuje
    const endsAtBlockStart = $to.depth >= 1 && $to.parentOffset === 0 && $to.before(1) > from
    to = $to.depth >= 1 ? (endsAtBlockStart ? $to.before(1) : $to.after(1)) : selection.to
    whole = false
  }
  const text = rangeToMarkdown(ed, from, to)
  if (!text) return null
  return {
    from,
    to,
    whole,
    selection: text,
    before: whole ? '' : rangeToMarkdown(ed, 0, from),
    after: whole ? '' : rangeToMarkdown(ed, to, doc.content.size),
  }
}

/** Nahradí úsek markdownem od AI a obrázkům, které v něm zůstaly, vrátí původní rozložení (markdown ho nenese) */
function replaceRangeWithMarkdown(ed: Editor, range: AiSelectionRange, markdown: string): void {
  const layouts = new Map<string, ProseImageLayout>()
  ed.state.doc.nodesBetween(range.from, range.to, node => {
    if (node.type.name === 'image' && typeof node.attrs.src === 'string') layouts.set(node.attrs.src, node.attrs.layout as ProseImageLayout)
  })
  const sizeBefore = ed.state.doc.content.size
  ed.chain().focus().insertContentAt({ from: range.from, to: range.to }, markdown, { contentType: 'markdown' }).run()
  if (layouts.size === 0) return
  const newTo = range.to + (ed.state.doc.content.size - sizeBefore)
  const tr = ed.state.tr
  ed.state.doc.nodesBetween(range.from, Math.min(newTo, ed.state.doc.content.size), (node, pos) => {
    if (node.type.name !== 'image' || typeof node.attrs.src !== 'string') return
    const layout = layouts.get(node.attrs.src)
    if (layout && layout !== node.attrs.layout) tr.setNodeMarkup(pos, undefined, { ...node.attrs, layout })
  })
  if (tr.docChanged) ed.view.dispatch(tr)
}

/** Vytáhne URL obrázku z přetaženého obsahu z webu */
function imageUrlFromTransfer(data: DataTransfer): string | null {
  const html = data.getData('text/html')
  const srcMatch = html.match(/<img[^>]+src="([^"]+)"/i)
  const url = (srcMatch?.[1] || data.getData('text/uri-list') || '').trim()
  return /^https?:.*\.(png|jpe?g|gif|webp|avif)(\?.*)?$/i.test(url) || /^data:image\//i.test(url) ? url : null
}

export default function ProseEditor({ game, sceneId, doc, background, font, fontPresets, onSave, onUploadImage, onBackgroundChange, onFontChange, onFontPresetsChange, onLibraryChanged, aiPrompts, onGenerateAi, onDeleteAiPrompt }: ProseEditorProps) {
  const version = useAssetVersion()
  const [status, setStatus] = useState<'saved' | 'dirty' | 'saving' | 'error'>('saved')
  const [uploading, setUploading] = useState(0)
  // Dialogy vzhledu a knihovny; `library: 'insert'` = výběr obrázku k vložení do textu, `'browse'` = správa knihovny
  const [backgroundOpen, setBackgroundOpen] = useState(false)
  const [fontOpen, setFontOpen] = useState(false)
  const [library, setLibrary] = useState<'insert' | 'browse' | null>(null)
  // AI dialog: otevřený? + úsek zachycený při otevření (null = dokument je prázdný, úprava není možná)
  const [aiOpen, setAiOpen] = useState(false)
  const [aiRange, setAiRange] = useState<AiSelectionRange | null>(null)
  // Nepotvrzený návrh úpravy od AI – přežije zavření dialogu, dokud ho autor nepoužije nebo nezahodí
  const [aiDraft, setAiDraft] = useState<AiDraft | null>(null)
  const aiDraftRef = useRef<AiDraft | null>(null)
  // Obrázky z textu otevřené v plovoucích oknech (poslední v poli je nahoře) + obrázek na celou obrazovku
  const [floatingImages, setFloatingImages] = useState<ImageRef[]>([])
  const [fullscreenImage, setFullscreenImage] = useState<{ url: string; name: string } | null>(null)
  const timerRef = useRef<number | null>(null)
  const dirtyRef = useRef(false)
  // Aktuální hodnoty pro callbacky z TipTapu (ty se registrují jednou)
  const latest = useRef({ sceneId, onSave, onUploadImage })
  const editorRef = useRef<Editor | null>(null)

  const flush = useCallback(async (ed: Editor, id: string) => {
    if (timerRef.current) { window.clearTimeout(timerRef.current); timerRef.current = null }
    if (!dirtyRef.current) return
    dirtyRef.current = false
    setStatus('saving')
    try {
      await latest.current.onSave(id, ed.getJSON() as ProseDoc)
      setStatus(prev => (dirtyRef.current ? 'dirty' : prev === 'saving' ? 'saved' : prev))
    } catch (err) {
      console.error('Uložení prózy selhalo:', err)
      dirtyRef.current = true
      setStatus('error')
    }
  }, [])

  const insertImages = useCallback(async (ed: Editor, images: (File | string)[], pos?: number) => {
    setUploading(n => n + images.length)
    try {
      for (const image of images) {
        try {
          const ref = await latest.current.onUploadImage(image)
          const chain = ed.chain().focus()
          if (typeof pos === 'number') chain.insertContentAt(pos, { type: 'image', attrs: { src: ref, layout: 'full' } })
          else chain.insertContent({ type: 'image', attrs: { src: ref, layout: 'full' } })
          chain.run()
        } catch (err) {
          console.error('Nahrání obrázku selhalo:', err)
        }
      }
    } finally {
      setUploading(n => Math.max(0, n - images.length))
    }
  }, [])

  const editor = useEditor({
    extensions: [
      StarterKit.configure({ link: false }),
      ProseImage,
      Placeholder.configure({ placeholder: 'Začni psát… „# “ pro nadpis, „- “ pro seznam, „> “ pro citaci' }),
      // Parsování markdownu z AI při vkládání (insertContentAt s contentType: 'markdown')
      Markdown,
    ],
    content: doc ?? EMPTY_DOC,
    editable: doc !== undefined,
    editorProps: {
      attributes: { class: 'prose-content outline-none min-h-full' },
      // Vložení / přetažení obrázků → upload do vaultu a vložení uzlu
      handlePaste: (view, event) => {
        const files = Array.from(event.clipboardData?.files ?? []).filter(isImageFile)
        if (files.length === 0) return false
        event.preventDefault()
        const ed = editorRef.current
        if (ed) void insertImages(ed, files, view.state.selection.to)
        return true
      },
      handleDrop: (view, event, _slice, moved) => {
        if (moved) return false
        const data = event.dataTransfer
        if (!data) return false
        const files = Array.from(data.files).filter(isImageFile)
        const url = files.length === 0 ? imageUrlFromTransfer(data) : null
        if (files.length === 0 && !url) return false
        event.preventDefault()
        const coords = view.posAtCoords({ left: event.clientX, top: event.clientY })
        const ed = editorRef.current
        if (ed) void insertImages(ed, files.length ? files : [url!], coords?.pos ?? view.state.selection.to)
        return true
      },
    },
    onUpdate: ({ editor: ed, transaction }) => {
      dirtyRef.current = true
      setStatus('dirty')
      if (timerRef.current) window.clearTimeout(timerRef.current)
      timerRef.current = window.setTimeout(() => void flush(ed, latest.current.sceneId), SAVE_DELAY_MS)
      // Pozice čekajícího návrhu úpravy posunout podle změn v dokumentu, aby po potvrzení nahradil správný úsek
      const draft = aiDraftRef.current
      if (draft && transaction.docChanged) {
        const from = transaction.mapping.map(draft.range.from, -1)
        const to = Math.max(from, transaction.mapping.map(draft.range.to, 1))
        if (from !== draft.range.from || to !== draft.range.to) {
          const next = { ...draft, range: { ...draft.range, from, to } }
          aiDraftRef.current = next
          setAiDraft(next)
        }
      }
    },
  })
  useEffect(() => {
    latest.current = { sceneId, onSave, onUploadImage }
    editorRef.current = editor
    aiDraftRef.current = aiDraft
  })

  // Hra pro překlad odkazů v NodeView + náhrada obrázku z jeho lišty
  const imageContext = useMemo<ProseImageContextValue>(() => ({
    game,
    onReplace: (pos, image) => {
      const ed = editorRef.current
      if (!ed) return
      void (async () => {
        setUploading(n => n + 1)
        try {
          const ref = await latest.current.onUploadImage(image)
          const node = ed.state.doc.nodeAt(pos)
          if (node?.type.name === 'image') {
            ed.view.dispatch(ed.state.tr.setNodeMarkup(pos, undefined, { ...node.attrs, src: ref }))
          }
        } catch (err) {
          console.error('Nahrazení obrázku selhalo:', err)
        } finally {
          setUploading(n => Math.max(0, n - 1))
        }
      })()
    },
    onFloat: src => setFloatingImages(prev => [...prev.filter(s => s !== src), src]),
  }), [game])

  const floatingWindows = useMemo(
    () => floatingImages.flatMap((src, i) => {
      const url = assetUrl(game, src, version)
      return url ? [{ src, url, name: `Ilustrace ${i + 1}` }] : []
    }),
    [floatingImages, game, version]
  )

  // Přepnutí scény: uložit předchozí a načíst nový dokument (bez vyvolání onUpdate)
  const loadedFor = useRef<string | null>(null)
  useEffect(() => {
    if (!editor) return
    // Jiná scéna než naposledy načtená → nejdřív uložit rozpracovaný text té předchozí
    if (loadedFor.current !== null && loadedFor.current !== sceneId) {
      void flush(editor, loadedFor.current)
      loadedFor.current = null
      // Návrh úpravy patří k dokumentu předchozí scény
      aiDraftRef.current = null
      setAiDraft(null)
      setAiOpen(false)
      setFloatingImages([])
      setFullscreenImage(null)
    }
    if (doc === undefined) {
      editor.setEditable(false)
      return
    }
    if (loadedFor.current === sceneId) return
    loadedFor.current = sceneId
    editor.commands.setContent(doc ?? EMPTY_DOC, { emitUpdate: false })
    editor.setEditable(true)
    dirtyRef.current = false
    setStatus('saved')
  }, [editor, sceneId, doc, flush])

  // Uložit při odchodu ze stránky / odpojení komponenty (TipTap editor ničí odloženě, getJSON v cleanupu je bezpečný)
  useEffect(() => {
    if (!editor) return
    const save = () => { if (loadedFor.current) void flush(editor, loadedFor.current) }
    window.addEventListener('beforeunload', save)
    return () => {
      window.removeEventListener('beforeunload', save)
      save()
    }
  }, [editor, flush])

  const backgroundUrl = background.image ? assetUrl(game, background.image, version) : null

  /** Otevře AI dialog; výběr v editoru se zachytí teď (po otevření dialogu editor ztratí fokus). Čekající návrh má přednost. */
  const openAi = () => {
    const ed = editorRef.current
    if (!ed) return
    setAiRange(aiDraft ? aiDraft.range : captureAiSelection(ed))
    setAiOpen(true)
  }

  /** Dialog hlásí stav návrhu: text od AI k potvrzení, nebo null po použití / zahození */
  const handleDraftChange = (draft: ProseAiDraft | null) => {
    if (!draft || !aiRange) {
      aiDraftRef.current = null
      setAiDraft(null)
      return
    }
    const next = { ...draft, range: aiRange }
    aiDraftRef.current = next
    setAiDraft(next)
  }

  /** Pošle pokyn AI a vrácený markdown připíše na konec dokumentu (vyvolá onUpdate → autosave) */
  const continueAi = async (prompt: string) => {
    const ed = editorRef.current
    if (!ed) throw new Error('Editor není připraven.')
    // Dosavadní text si BE bere z úložiště – rozpracované změny napřed uložit
    await flush(ed, latest.current.sceneId)
    const text = (await onGenerateAi({ mode: 'continue', prompt })).trim()
    if (!text) throw new Error('AI vrátila prázdný text.')
    const end = ed.state.doc.content.size
    ed.chain().focus('end').insertContentAt(end, text, { contentType: 'markdown' }).run()
    window.setTimeout(() => ed.commands.scrollIntoView(), 0)
  }

  /** Nechá AI přepracovat zachycený úsek; vrátí nový markdown (dialog ho ukáže jako diff k potvrzení).
   *  Obrázky, které model z úseku vynechal, se do výsledku vrátí (viz restoreMissingImages). */
  const rewriteAi = async (prompt: string, previous?: string) => {
    if (!aiRange) throw new Error('Není co upravovat.')
    const text = (await onGenerateAi({ mode: 'rewrite', prompt, selection: aiRange.selection, before: aiRange.before, after: aiRange.after, previous })).trim()
    if (!text) throw new Error('AI vrátila prázdný text.')
    const fixed = restoreMissingImages(aiRange.selection, text)
    return { text: fixed.text, restoredImages: fixed.restored }
  }

  /** Potvrzený výsledek úpravy: nahradí původní úsek v editoru (pozice případně posunuté podle mezitím provedených změn) */
  const applyRewrite = (text: string) => {
    const ed = editorRef.current
    const range = aiDraft?.range ?? aiRange
    if (!ed || !range) return
    replaceRangeWithMarkdown(ed, range, text)
    window.setTimeout(() => ed.commands.scrollIntoView(), 0)
  }

  const pickImage = () => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = 'image/*'
    input.multiple = true
    input.onchange = () => {
      const files = Array.from(input.files ?? []).filter(isImageFile)
      if (files.length && editor) void insertImages(editor, files)
    }
    input.click()
  }

  /** Vloží do textu obrázek vybraný z knihovny (bez nahrávání – odkaz už existuje) */
  const insertFromLibrary = (path: ImageRef) => {
    setLibrary(null)
    if (editor && path) editor.chain().focus().insertContent({ type: 'image', attrs: { src: path, layout: 'full' } }).run()
  }

  /** Po změně knihovny: odkazy v dokumentu se mohly změnit na BE → rozpracované změny uložit a nechat rodiče znovu načíst */
  const handleLibraryChanged = async () => {
    const ed = editorRef.current
    if (ed && loadedFor.current) {
      await flush(ed, loadedFor.current)
      loadedFor.current = null
    }
    await onLibraryChanged()
  }

  const statusLabel = uploading > 0
    ? `Nahrávám obrázek${uploading > 1 ? ` (${uploading})` : ''}…`
    : doc === undefined ? 'Načítám…' : status === 'saving' ? 'Ukládám…' : status === 'dirty' ? 'Neuloženo' : status === 'error' ? '⚠️ Uložení selhalo' : 'Uloženo'

  const toolButton = 'px-2 h-7 min-w-7 rounded-md text-sm hover:bg-white/15 disabled:opacity-40 transition-colors'
  const active = (name: string, attrs?: Record<string, unknown>) => (editor?.isActive(name, attrs) ? 'bg-[var(--accent)]/40' : '')

  return (
    <div className="flex-1 min-h-0 flex flex-col m-4 mt-0 rounded-xl overflow-hidden border border-white/10 shadow-xl">
      {/* Lišta editoru */}
      <div className="flex-shrink-0 flex items-center gap-1 px-2 py-1.5 bg-black/85 text-white border-b border-white/10 flex-wrap">
        <button type="button" title="Nadpis 1 (Ctrl+Alt+1)" onClick={() => editor?.chain().focus().toggleHeading({ level: 1 }).run()} className={`${toolButton} font-bold ${active('heading', { level: 1 })}`}>H1</button>
        <button type="button" title="Nadpis 2 (Ctrl+Alt+2)" onClick={() => editor?.chain().focus().toggleHeading({ level: 2 }).run()} className={`${toolButton} font-bold ${active('heading', { level: 2 })}`}>H2</button>
        <button type="button" title="Nadpis 3 (Ctrl+Alt+3)" onClick={() => editor?.chain().focus().toggleHeading({ level: 3 }).run()} className={`${toolButton} font-bold ${active('heading', { level: 3 })}`}>H3</button>
        <span className="w-px h-5 bg-white/20 mx-1" />
        <button type="button" title="Tučně (Ctrl+B)" onClick={() => editor?.chain().focus().toggleBold().run()} className={`${toolButton} font-bold ${active('bold')}`}>B</button>
        <button type="button" title="Kurzíva (Ctrl+I)" onClick={() => editor?.chain().focus().toggleItalic().run()} className={`${toolButton} italic ${active('italic')}`}>I</button>
        <button type="button" title="Přeškrtnuté (Ctrl+Shift+S)" onClick={() => editor?.chain().focus().toggleStrike().run()} className={`${toolButton} line-through ${active('strike')}`}>S</button>
        <span className="w-px h-5 bg-white/20 mx-1" />
        <button type="button" title="Odrážky" onClick={() => editor?.chain().focus().toggleBulletList().run()} className={`${toolButton} ${active('bulletList')}`}>•≡</button>
        <button type="button" title="Číslovaný seznam" onClick={() => editor?.chain().focus().toggleOrderedList().run()} className={`${toolButton} ${active('orderedList')}`}>1≡</button>
        <button type="button" title="Citace" onClick={() => editor?.chain().focus().toggleBlockquote().run()} className={`${toolButton} ${active('blockquote')}`}>❝</button>
        <button type="button" title="Oddělovač (---)" onClick={() => editor?.chain().focus().setHorizontalRule().run()} className={toolButton}>―</button>
        <span className="w-px h-5 bg-white/20 mx-1" />
        <button type="button" title="Vložit nový obrázek (nebo přetáhni / vlož ze schránky)" onClick={pickImage} className={toolButton}>🖼 Obrázek</button>
        <button type="button" title="Vložit obrázek z knihovny kampaně" disabled={doc === undefined} onClick={() => setLibrary('insert')} className={toolButton}>📚 Z knihovny</button>
        <span className="w-px h-5 bg-white/20 mx-1" />
        <button
          type="button"
          title={aiDraft ? 'AI: čeká návrh úpravy k potvrzení – otevřít' : 'AI: pokračovat v příběhu, nebo přepracovat označený text'}
          disabled={doc === undefined}
          onClick={openAi}
          className={`${toolButton} text-cyan-300 ${aiDraft ? 'bg-cyan-500/25 ring-1 ring-cyan-400/60' : ''}`}
        >
          🤖 AI{aiDraft ? ' ●' : ''}
        </button>
        <span className="w-px h-5 bg-white/20 mx-1" />
        <button type="button" title="Pozadí stránky: obrázek, způsob vykreslení, barva podkladu" onClick={() => setBackgroundOpen(true)} className={toolButton}>
          🧻 Pozadí
        </button>
        <button type="button" title="Písmo scény: rodina, velikost, barva, stín; knihovna písem kampaně" onClick={() => setFontOpen(true)} className={toolButton}>
          🔤 Písmo
        </button>
        <button type="button" title="Knihovna obrázků kampaně: náhledy, nahrazení, mazání" onClick={() => setLibrary('browse')} className={toolButton}>
          🗂 Knihovna
        </button>
        <span className={`ml-auto text-xs ${status === 'error' ? 'text-red-300' : 'opacity-60'}`}>{statusLabel}</span>
      </div>

      {/* Stránka */}
      <div
        className="prose-page flex-1 min-h-0 overflow-y-auto"
        style={{ ...proseBackgroundStyle(background, backgroundUrl), ...proseFontStyle(font) }}
        onClick={e => { if (e.target === e.currentTarget) editor?.commands.focus('end') }}
      >
        <div className="max-w-3xl mx-auto px-10 py-10 min-h-full cursor-text" onClick={e => { if (e.target === e.currentTarget) editor?.commands.focus('end') }}>
          <ProseImageContext.Provider value={imageContext}>
            <EditorContent editor={editor} className="min-h-full" />
          </ProseImageContext.Provider>
        </div>
      </div>

      {aiOpen && (
        <ProseAiModal
          prompts={aiPrompts}
          rewriteTarget={aiRange}
          draft={aiDraft}
          onDraftChange={handleDraftChange}
          onContinue={continueAi}
          onRewrite={rewriteAi}
          onApplyRewrite={applyRewrite}
          onDeletePrompt={onDeleteAiPrompt}
          onClose={() => setAiOpen(false)}
        />
      )}
      {backgroundOpen && (
        <ProseBackgroundModal
          game={game}
          value={background}
          onSave={onBackgroundChange}
          onLibraryChanged={handleLibraryChanged}
          onClose={() => setBackgroundOpen(false)}
        />
      )}
      {fontOpen && (
        <ProseFontModal
          value={font}
          presets={fontPresets}
          onSave={onFontChange}
          onPresetsChange={onFontPresetsChange}
          onClose={() => setFontOpen(false)}
        />
      )}
      {library && (
        <ProseImageLibraryModal
          game={game}
          title={library === 'insert' ? 'Vlož obrázek z knihovny' : undefined}
          onSelect={library === 'insert' ? insertFromLibrary : undefined}
          onChanged={handleLibraryChanged}
          onClose={() => setLibrary(null)}
        />
      )}

      {floatingWindows.map((w, i) => (
        <FloatingPortrait
          key={w.src}
          image={w.url}
          name={w.name}
          index={i}
          active={i === floatingWindows.length - 1}
          onFocus={() => setFloatingImages(prev => [...prev.filter(s => s !== w.src), w.src])}
          onClose={() => setFloatingImages(prev => prev.filter(s => s !== w.src))}
          onFullscreen={() => setFullscreenImage({ url: w.url, name: w.name })}
        />
      ))}
      {fullscreenImage && (
        <PortraitModal image={fullscreenImage.url} character={fullscreenImage.name} onClose={() => setFullscreenImage(null)} />
      )}
    </div>
  )
}
