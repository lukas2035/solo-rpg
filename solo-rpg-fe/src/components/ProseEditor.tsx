import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { EditorContent, NodeViewWrapper, ReactNodeViewRenderer, useEditor, type Editor, type NodeViewProps } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Image from '@tiptap/extension-image'
import { Placeholder } from '@tiptap/extensions'
import type { ImageRef, ProseDoc, ProseImageLayout, ProseTextColor } from '@solo-rpg/shared'
import { assetUrl, useAssetVersion } from '../utils/api'

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
  texture: ImageRef
  textColor: ProseTextColor
  onSave: (sceneId: string, doc: ProseDoc) => Promise<void>
  /** Uloží obrázek (soubor nebo URL) do vaultu a vrátí odkaz pro `src` */
  onUploadImage: (image: File | string) => Promise<ImageRef>
  onTextureChange: (image: File | string | null) => Promise<void>
  onTextColorChange: (color: ProseTextColor) => Promise<void>
}

const SAVE_DELAY_MS = 1000

/** Prázdný dokument TipTapu (jeden prázdný odstavec) */
const EMPTY_DOC: ProseDoc = { type: 'doc', content: [{ type: 'paragraph' }] }

// Kontext pro NodeView obrázku (TipTap 3 vykresluje React NodeView uvnitř stromu editoru, takže context projde)
interface ProseImageContextValue {
  game: string
  onReplace: (pos: number, image: File | string) => void
}
const ProseImageContext = createContext<ProseImageContextValue>({ game: '', onReplace: () => {} })

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
        <img src={url} alt={typeof node.attrs.alt === 'string' ? node.attrs.alt : ''} className="block w-full h-auto rounded-lg select-none" draggable={false} />
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

/** Vytáhne URL obrázku z přetaženého obsahu z webu */
function imageUrlFromTransfer(data: DataTransfer): string | null {
  const html = data.getData('text/html')
  const srcMatch = html.match(/<img[^>]+src="([^"]+)"/i)
  const url = (srcMatch?.[1] || data.getData('text/uri-list') || '').trim()
  return /^https?:.*\.(png|jpe?g|gif|webp|avif)(\?.*)?$/i.test(url) || /^data:image\//i.test(url) ? url : null
}

export default function ProseEditor({ game, sceneId, doc, texture, textColor, onSave, onUploadImage, onTextureChange, onTextColorChange }: ProseEditorProps) {
  const version = useAssetVersion()
  const [status, setStatus] = useState<'saved' | 'dirty' | 'saving' | 'error'>('saved')
  const [uploading, setUploading] = useState(0)
  const timerRef = useRef<number | null>(null)
  const dirtyRef = useRef(false)
  const textureInputRef = useRef<HTMLInputElement | null>(null)
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
    onUpdate: ({ editor: ed }) => {
      dirtyRef.current = true
      setStatus('dirty')
      if (timerRef.current) window.clearTimeout(timerRef.current)
      timerRef.current = window.setTimeout(() => void flush(ed, latest.current.sceneId), SAVE_DELAY_MS)
    },
  })
  useEffect(() => {
    latest.current = { sceneId, onSave, onUploadImage }
    editorRef.current = editor
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
  }), [game])

  // Přepnutí scény: uložit předchozí a načíst nový dokument (bez vyvolání onUpdate)
  const loadedFor = useRef<string | null>(null)
  useEffect(() => {
    if (!editor) return
    // Jiná scéna než naposledy načtená → nejdřív uložit rozpracovaný text té předchozí
    if (loadedFor.current !== null && loadedFor.current !== sceneId) {
      void flush(editor, loadedFor.current)
      loadedFor.current = null
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

  const textureUrl = texture ? assetUrl(game, texture, version) : null
  const dark = textColor === 'dark'

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
        <button type="button" title="Vložit obrázek (nebo přetáhni / vlož ze schránky)" onClick={pickImage} className={toolButton}>🖼 Obrázek</button>
        <span className="w-px h-5 bg-white/20 mx-1" />
        <button type="button" title={texture ? 'Změnit texturu pozadí' : 'Přidat texturu pozadí (např. papír)'} onClick={() => textureInputRef.current?.click()} className={toolButton}>
          {texture ? '🧻 Textura' : '🧻 Přidat texturu'}
        </button>
        {texture && (
          <button type="button" title="Odebrat texturu" onClick={() => void onTextureChange(null)} className={toolButton}>✕</button>
        )}
        <input
          ref={textureInputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={e => {
            const file = e.target.files?.[0]
            e.target.value = ''
            if (file) void onTextureChange(file)
          }}
        />
        <button
          type="button"
          title={dark ? 'Přepnout na světlé písmo' : 'Přepnout na tmavé písmo'}
          onClick={() => void onTextColorChange(dark ? 'light' : 'dark')}
          className={toolButton}
        >
          {dark ? '🌙 Světlé písmo' : '☀️ Tmavé písmo'}
        </button>
        <span className={`ml-auto text-xs ${status === 'error' ? 'text-red-300' : 'opacity-60'}`}>{statusLabel}</span>
      </div>

      {/* Stránka */}
      <div
        className={`prose-page flex-1 min-h-0 overflow-y-auto ${dark ? 'prose-page-dark' : 'prose-page-light'}`}
        style={{
          backgroundColor: dark ? '#e9e4d8' : '#1a1a1a',
          backgroundImage: textureUrl ? `url('${textureUrl}')` : undefined,
          backgroundRepeat: 'repeat',
        }}
        onClick={e => { if (e.target === e.currentTarget) editor?.commands.focus('end') }}
      >
        <div className="max-w-3xl mx-auto px-10 py-10 min-h-full cursor-text" onClick={e => { if (e.target === e.currentTarget) editor?.commands.focus('end') }}>
          <ProseImageContext.Provider value={imageContext}>
            <EditorContent editor={editor} className="min-h-full" />
          </ProseImageContext.Provider>
        </div>
      </div>
    </div>
  )
}
