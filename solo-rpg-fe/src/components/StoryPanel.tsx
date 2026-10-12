import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import remarkBreaks from 'remark-breaks'
import { promptPreview } from '@solo-rpg/shared'

interface Character {
  id: string
  name: string
  /** Zobrazované jméno */
  nickname: string
  image: string | null
}

interface Narrator {
  id: string
  name: string
  image: string | null
}

interface StoryEntry {
  id: string
  character: Character | null
  /** Vypravěč záznamu (jen když `character` je null); null = vypravěč bez souboru (starý zápis) */
  narrator: Narrator | null
  text: string
  timestamp: number
  /** Text je víceřádkový markdown */
  markdown?: boolean
  /** `prompt` = jednorázový pokyn hráče pro AI (není součást příběhu, bez mluvčího) */
  kind?: 'prompt'
  /** Text vygenerovala AI */
  ai?: boolean
  /** Id záznamu typu prompt, podle kterého AI text napsala */
  promptId?: string | null
}

interface StoryPanelProps {
  entries: StoryEntry[]
  /** Všechny záznamy scény včetně skrytých promptů – pro tooltip „podle jakého promptu AI psala“ */
  allEntries?: StoryEntry[]
  onPortraitClick: (image: string, characterName: string) => void
  onEntryDelete?: (entryId: string) => void
  onEntryEdit?: (entryId: string, newText: string) => void
  /** Mluvčí, na které lze záznam přepsat klikem na jméno (postavy aktuální scény + vypravěči hry) */
  speakerOptions?: { characters: Character[]; narrators: Narrator[] }
  /** Změna mluvčího záznamu: `{ characterId }` = postava, `{ narratorId }` = vypravěč */
  onEntrySpeakerChange?: (entryId: string, speaker: { characterId: string } | { narratorId: string }) => void
  /** Ztmavit podklad textů (při zesvětleném pozadí) */
  darkenEntries?: boolean
  /** Čekající návrh AI (schvalování „v textu“): vykreslí se jako běžný záznam na konci, pod ním `footer` s tlačítky */
  pending?: { entry: StoryEntry; footer: ReactNode } | null
}

const ENTRY_IMAGE_MAX_WIDTH = 140 // Zvětšená šířka pro obrázky
/** Popisek záznamu vypravěče bez souboru */
const NARRATOR_FALLBACK = 'Vypravěč'
/** Popisek záznamu typu prompt */
const PROMPT_LABEL = 'Prompt AI'

/** Tooltip ikonky 🤖 u textu vygenerovaného AI: zda měl prompt a jeho začátek */
function aiTooltip(entry: StoryEntry, all: StoryEntry[]): string {
  if (!entry.promptId) return 'Text vygenerovala AI (bez promptu hráče)'
  const prompt = all.find(e => e.id === entry.promptId && e.kind === 'prompt')
  return prompt ? `Text vygenerovala AI podle promptu: „${promptPreview(prompt.text)}“` : 'Text vygenerovala AI podle promptu, který už byl smazán'
}

export default function StoryPanel({ entries, allEntries = entries, onPortraitClick, onEntryDelete, onEntryEdit, speakerOptions, onEntrySpeakerChange, darkenEntries, pending }: StoryPanelProps) {
  const [aspectRatios, setAspectRatios] = useState<Record<string, number>>({})
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editText, setEditText] = useState('')
  /** Záznam, u kterého je otevřený výběr mluvčího */
  const [speakerEditId, setSpeakerEditId] = useState<string | null>(null)
  const scrollRef = useRef<HTMLDivElement | null>(null)
  const editRef = useRef<HTMLTextAreaElement | null>(null)
  const canChangeSpeaker = Boolean(onEntrySpeakerChange && speakerOptions && (speakerOptions.characters.length + speakerOptions.narrators.length > 0))

  useEffect(() => {
    const el = scrollRef.current
    if (el) {
      el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' })
    }
  }, [entries.length, pending?.entry.id])

  // Výška editační textarey podle skutečného (zalomeného) obsahu, ne jen podle počtu řádků
  useLayoutEffect(() => {
    const el = editRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${el.scrollHeight}px`
  }, [editingId, editText])

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

  /** Hodnota selectu mluvčího: `c:<id postavy>` / `n:<id vypravěče>`; vypravěč bez souboru = '' */
  const speakerValue = (entry: StoryEntry) => (entry.character ? `c:${entry.character.id}` : entry.narrator ? `n:${entry.narrator.id}` : '')

  const applySpeaker = (entry: StoryEntry, value: string) => {
    setSpeakerEditId(null)
    if (!value || value === speakerValue(entry)) return
    const [kind, id] = [value.slice(0, 1), value.slice(2)]
    onEntrySpeakerChange?.(entry.id, kind === 'c' ? { characterId: id } : { narratorId: id })
  }

  /** Jeden záznam scény; `readOnly` = čekající návrh AI (bez editace, mazání a změny mluvčího) */
  const renderEntry = (entry: StoryEntry, readOnly = false) => {
        const ratio = aspectRatios[entry.id] || 1
        const width = Math.min(ENTRY_IMAGE_HEIGHT * ratio, ENTRY_IMAGE_MAX_WIDTH)
        const isPrompt = entry.kind === 'prompt'
        // Mluvčí záznamu: postava, nebo vypravěč (portrét + jméno); prompt mluvčího nemá
        const speaker = isPrompt
          ? { name: PROMPT_LABEL, label: PROMPT_LABEL, image: null }
          : entry.character
            ? { name: entry.character.name, label: entry.character.nickname, image: entry.character.image }
            : { name: entry.narrator?.name ?? NARRATOR_FALLBACK, label: entry.narrator?.name ?? NARRATOR_FALLBACK, image: entry.narrator?.image ?? null }
        const speakerEditable = canChangeSpeaker && !isPrompt && !readOnly
        const editable = Boolean(onEntryEdit) && !readOnly

        return (
          <div key={entry.id} className={`flex animate-fadeIn gap-4 ${isPrompt ? 'opacity-80' : ''}`} style={{ alignItems: 'flex-start' }}>
            {/* Fixní šířka kontejner pro obrázek */}
            <div style={{ width: `${ENTRY_IMAGE_MAX_WIDTH}px`, flexShrink: 0 }}>
              {isPrompt ? (
                <div
                  title="Prompt zadaný AI vypravěči – není součást příběhu"
                  className="rounded-md bg-cyan-950/60 flex items-center justify-center flex-shrink-0 border border-dashed border-cyan-500/50 text-2xl"
                  style={{ height: `${ENTRY_IMAGE_HEIGHT}px`, width: `${ENTRY_IMAGE_MAX_WIDTH}px` }}
                >
                  💬
                </div>
              ) : speaker.image ? (
                <img
                  src={speaker.image}
                  alt={speaker.name}
                  className="rounded-md object-contain flex-shrink-0 border border-[var(--accent)] cursor-pointer hover:opacity-80 transition-opacity"
                  style={{
                    height: `${ENTRY_IMAGE_HEIGHT}px`,
                    width: `${width}px`,
                  }}
                  onLoad={(e) => handleImageLoad(entry.id, e.currentTarget)}
                  onClick={() => onPortraitClick(speaker.image!, speaker.name)}
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
                    {speaker.label.charAt(0)}
                  </span>
                </div>
              )}
            </div>

            {/* Text vlevo */}
            <div className="flex-1 text-left">
              {speakerEditId === entry.id && speakerOptions && !isPrompt ? (
                <select
                  autoFocus
                  defaultValue={speakerValue(entry)}
                  onChange={(e) => applySpeaker(entry, e.target.value)}
                  onBlur={() => setSpeakerEditId(null)}
                  onKeyDown={(e) => { if (e.key === 'Escape') { e.preventDefault(); setSpeakerEditId(null) } }}
                  className="mb-1 bg-black/70 border border-[var(--accent)] rounded-md px-2 py-0.5 text-sm font-semibold text-[var(--accent)] focus:outline-none"
                >
                  {!entry.character && !entry.narrator && <option value="">{NARRATOR_FALLBACK}</option>}
                  {/* Aktuální mluvčí může být mimo scénu (dočasná postava, jiný vypravěč) – nabídnout ho, aby select měl platnou hodnotu */}
                  {entry.character && !speakerOptions.characters.some(c => c.id === entry.character!.id) && (
                    <option value={`c:${entry.character.id}`}>{entry.character.nickname}</option>
                  )}
                  {entry.narrator && !speakerOptions.narrators.some(n => n.id === entry.narrator!.id) && (
                    <option value={`n:${entry.narrator.id}`}>🎭 {entry.narrator.name}</option>
                  )}
                  {speakerOptions.characters.map(c => (
                    <option key={c.id} value={`c:${c.id}`}>{c.nickname === c.name ? c.name : `${c.nickname} (${c.name})`}</option>
                  ))}
                  {speakerOptions.narrators.map(n => (
                    <option key={n.id} value={`n:${n.id}`}>🎭 {n.name}</option>
                  ))}
                </select>
              ) : (entry.character || entry.narrator || canChangeSpeaker || isPrompt) && (
                <div
                  className={`text-sm font-semibold mb-1 inline-block ${isPrompt ? 'text-cyan-300' : 'text-[var(--accent)]'} ${speakerEditable ? 'cursor-pointer hover:underline decoration-dotted' : ''}`}
                  title={speakerEditable ? `${speaker.name} – klikni pro změnu mluvčího` : speaker.name}
                  onClick={() => { if (speakerEditable) setSpeakerEditId(entry.id) }}
                >
                  {isPrompt ? '💬 ' : ''}{speaker.label}:
                </div>
              )}
              <div
                className={`relative text-[var(--text)] leading-relaxed rounded-lg p-3 ${darkenEntries ? 'bg-black/75' : 'bg-black/30'} ${isPrompt ? 'border border-dashed border-cyan-500/40 italic' : ''} ${readOnly ? 'border border-dashed border-cyan-400/60' : ''} ${editable && editingId !== entry.id ? 'cursor-pointer' : ''}`}
                onContextMenu={readOnly ? undefined : (e) => handleEntryContextMenu(e, entry)}
                onClick={() => editable && editingId !== entry.id && startEditing(entry)}
              >
                {editingId === entry.id && entry.ai && (
                  <span
                    title={aiTooltip(entry, allEntries)}
                    className="absolute -top-2.5 right-2 px-1.5 py-0.5 rounded-md border border-cyan-400/70 bg-cyan-950 text-cyan-200 text-xs cursor-help select-none shadow"
                  >
                    🤖 AI
                  </span>
                )}
                {editingId === entry.id ? (
                  <textarea
                    ref={editRef}
                    rows={entry.markdown || isPrompt ? 5 : 1}
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
                        if (entry.markdown || isPrompt ? e.ctrlKey : !e.ctrlKey) {
                          e.preventDefault()
                          saveEditing(entry)
                        }
                      }
                    }}
                    className="w-full bg-black/50 border-2 border-[#aa3bff]/60 rounded-lg px-3 py-2 text-[var(--text)] leading-relaxed outline-none focus:border-[#aa3bff] focus:shadow-[0_0_20px_rgba(170,59,255,0.3)] resize-none overflow-hidden whitespace-pre-wrap break-words"
                  />
                ) : entry.markdown || isPrompt ? (
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
  }

  return (
    <div ref={scrollRef} className="flex-1 overflow-y-auto p-2 pl-6 space-y-4">
      {entries.map((entry) => renderEntry(entry))}
      {pending && (
        <>
          {renderEntry(pending.entry, true)}
          {pending.footer}
        </>
      )}
    </div>
  )
}
