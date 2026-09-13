import { useEffect, useRef, useState } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import remarkBreaks from 'remark-breaks'

interface Character {
  id: string
  name: string
  /** Zobrazované jméno */
  nickname: string
  image: string | null
}

interface StoryEntry {
  id: string
  character: Character | null
  text: string
  timestamp: number
  /** Text je víceřádkový markdown */
  markdown?: boolean
}

interface StoryPanelProps {
  entries: StoryEntry[]
  onPortraitClick: (image: string, characterName: string) => void
  onEntryDelete?: (entryId: string) => void
  onEntryEdit?: (entryId: string, newText: string) => void
  /** Ztmavit podklad textů (při zesvětleném pozadí) */
  darkenEntries?: boolean
  /** Vlastní jméno vypravěče (výchozí „DM") */
  dmName?: string
  /** Vlastní portrét vypravěče (null = výchozí /dm.png) */
  dmImage?: string | null
}

const ENTRY_IMAGE_MAX_WIDTH = 140 // Zvětšená šířka pro obrázky

export default function StoryPanel({ entries, onPortraitClick, onEntryDelete, onEntryEdit, darkenEntries, dmName, dmImage }: StoryPanelProps) {
  const [aspectRatios, setAspectRatios] = useState<Record<string, number>>({})
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editText, setEditText] = useState('')
  const scrollRef = useRef<HTMLDivElement | null>(null)
  const editRef = useRef<HTMLTextAreaElement | null>(null)

  useEffect(() => {
    const el = scrollRef.current
    if (el) {
      el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' })
    }
  }, [entries.length])

  const handleImageLoad = (entryId: string, img: HTMLImageElement) => {
    const ratio = img.naturalWidth / img.naturalHeight
    setAspectRatios(prev => ({ ...prev, [entryId]: ratio }))
  }

  const handleEntryContextMenu = (e: React.MouseEvent, entry: StoryEntry) => {
    e.preventDefault()
    if (!onEntryDelete) return
    if (window.confirm('Opravdu chceš smazat tento text?')) {
      onEntryDelete(entry.id)
    }
  }

  const startEditing = (entry: StoryEntry) => {
    if (!onEntryEdit) return
    setEditingId(entry.id)
    setEditText(entry.text)
    // Fokus a kurzor na konec textu až po vykreslení textarey
    requestAnimationFrame(() => {
      const el = editRef.current
      if (el) {
        el.focus()
        el.setSelectionRange(el.value.length, el.value.length)
      }
    })
  }

  const cancelEditing = () => {
    setEditingId(null)
    setEditText('')
  }

  const saveEditing = (entry: StoryEntry) => {
    const newText = editText.trim() === '' ? entry.text : editText
    if (newText !== entry.text) {
      onEntryEdit?.(entry.id, newText)
    }
    cancelEditing()
  }

  const ENTRY_IMAGE_HEIGHT = 100 // Zvětšená výška

  return (
    <div ref={scrollRef} className="flex-1 overflow-y-auto p-2 pl-6 space-y-4">
      {entries.map((entry) => {
        const ratio = aspectRatios[entry.id] || 1
        const width = Math.min(ENTRY_IMAGE_HEIGHT * ratio, ENTRY_IMAGE_MAX_WIDTH)

        return (
          <div key={entry.id} className="flex animate-fadeIn gap-4" style={{ alignItems: 'flex-start' }}>
            {/* Fixní šířka kontejner pro obrázek */}
            <div style={{ width: `${ENTRY_IMAGE_MAX_WIDTH}px`, flexShrink: 0 }}>
              {entry.character && entry.character.image ? (
                <img
                  src={entry.character.image}
                  alt={entry.character.name}
                  className="rounded-md object-contain flex-shrink-0 border border-[var(--accent)] cursor-pointer hover:opacity-80 transition-opacity"
                  style={{
                    height: `${ENTRY_IMAGE_HEIGHT}px`,
                    width: `${width}px`,
                  }}
                  onLoad={(e) => handleImageLoad(entry.id, e.currentTarget)}
                  onClick={() => onPortraitClick(entry.character!.image!, entry.character!.name)}
                />
              ) : !entry.character ? (
                <img
                  src={dmImage ?? '/dm.png'}
                  alt={dmName ?? 'DM'}
                  className="rounded-md object-contain flex-shrink-0 border border-[var(--accent)] cursor-pointer hover:opacity-80 transition-opacity"
                  style={{
                    height: `${ENTRY_IMAGE_HEIGHT}px`,
                    width: `${width}px`,
                  }}
                  onLoad={(e) => handleImageLoad(entry.id, e.currentTarget)}
                  onClick={() => onPortraitClick(dmImage ?? '/dm.png', dmName ?? 'DM')}
                />
              ) : (
                <div
                  className="rounded-md bg-gray-800 flex items-center justify-center flex-shrink-0 border border-[var(--accent)]/30"
                  style={{
                    height: `${ENTRY_IMAGE_HEIGHT}px`,
                    width: `${ENTRY_IMAGE_MAX_WIDTH}px`,
                  }}
                >
                  <span className="text-xs text-[var(--text)]">
                    {entry.character.nickname.charAt(0)}
                  </span>
                </div>
              )}
            </div>

            {/* Text vlevo */}
            <div className="flex-1 text-left">
              {entry.character && (
                <div className="text-sm font-semibold text-[var(--accent)] mb-1" title={entry.character.name}>
                  {entry.character.nickname}:
                </div>
              )}
              <div
                className={`text-[var(--text)] leading-relaxed rounded-lg p-3 ${darkenEntries ? 'bg-black/75' : 'bg-black/30'} ${onEntryEdit && editingId !== entry.id ? 'cursor-pointer' : ''}`}
                onContextMenu={(e) => handleEntryContextMenu(e, entry)}
                onClick={() => editingId !== entry.id && startEditing(entry)}
              >
                {editingId === entry.id ? (
                  <textarea
                    ref={editRef}
                    rows={entry.markdown ? Math.max(5, editText.split('\n').length + 1) : Math.max(1, editText.split('\n').length)}
                    value={editText}
                    onChange={(e) => setEditText(e.target.value)}
                    onBlur={() => saveEditing(entry)}
                    onKeyDown={(e) => {
                      if (e.key === 'Escape') {
                        e.preventDefault()
                        cancelEditing()
                        return
                      }
                      // Víceřádkový markdown: Enter vkládá řádek, Ctrl+Enter uloží;
                      // jednoduchý text: Enter uloží
                      if (e.key === 'Enter' && !e.shiftKey && !e.altKey && !e.metaKey) {
                        if (entry.markdown ? e.ctrlKey : !e.ctrlKey) {
                          e.preventDefault()
                          saveEditing(entry)
                        }
                      }
                    }}
                    className="w-full bg-black/50 border-2 border-[#aa3bff]/60 rounded-lg px-3 py-2 text-[var(--text)] leading-relaxed outline-none focus:border-[#aa3bff] focus:shadow-[0_0_20px_rgba(170,59,255,0.3)] resize-none whitespace-pre-wrap break-words"
                  />
                ) : entry.markdown ? (
                  <div className="markdown-body">
                    <ReactMarkdown remarkPlugins={[remarkGfm, remarkBreaks]}>{entry.text}</ReactMarkdown>
                  </div>
                ) : (
                  entry.text
                )}
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )
}
