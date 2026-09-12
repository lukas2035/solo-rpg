import { useEffect, useRef, useState } from 'react'

interface Character {
  id: string
  name: string
  image: string | null
}

interface InputAreaProps {
  characters: Character[]
  /** Zobrazit u jmen pořadové číslo pro přepínání klávesnicí (drženo Ctrl/Alt) */
  showShortcutNumbers?: boolean
  onAddEntry: (text: string, characterId: string | null, markdown?: boolean) => void
  brightBackground?: boolean
  onBrightBackgroundChange?: (value: boolean) => void
  /** Vlastní jméno vypravěče (výchozí „DM") */
  dmName?: string
}

export default function InputArea({ characters, showShortcutNumbers, onAddEntry, brightBackground, onBrightBackgroundChange, dmName }: InputAreaProps) {
  const [text, setText] = useState('')
  const [selectedCharacterId, setSelectedCharacterId] = useState<string | null>(null)
  const [quoteMode, setQuoteMode] = useState(false)
  const [multilineMode, setMultilineMode] = useState(false)
  // Víceřádkový mód nejde vypnout, dokud je v textu znak nového řádku
  const multilineLocked = multilineMode && text.includes('\n')
  // Uživatel pro aktuální záznam uvozovky odmítl (mezera/smazání) – nepředvyplňovat znovu
  const quoteEscapedRef = useRef(false)
  const previousCharacterIdRef = useRef<string | null>(null)
  // AltGr+číslo vloží na české klávesnici znak – po zpracování zkratky ho zahodit
  const suppressNextInputRef = useRef(false)
  const textareaRef = useRef<HTMLTextAreaElement | null>(null)

  // Držet viditelný poslední (aktuálně psaný) řádek – starší zalomené řádky odjedou nahoru
  useEffect(() => {
    const el = textareaRef.current
    if (el) {
      el.scrollTop = el.scrollHeight
    }
  }, [text])

  const selectCharacter = (id: string | null) => {
    setSelectedCharacterId(current => {
      if (current !== id) {
        previousCharacterIdRef.current = current
      }
      return id
    })
  }

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ctrl+K přepne režim přímé řeči (uvozovky)
      if (e.ctrlKey && !e.altKey && !e.shiftKey && !e.metaKey && e.code === 'KeyK') {
        e.preventDefault()
        handleQuoteModeToggle(!quoteMode)
        return
      }
      // Alt+číslo, Ctrl+číslo nebo AltGr+číslo
      // AltGr se v prohlížečích hlásí buď jako Ctrl+Alt, nebo jen jako modifikátor 'AltGraph'
      const altGr = e.getModifierState('AltGraph')
      if ((!e.ctrlKey && !e.altKey && !altGr) || e.shiftKey || e.metaKey) return
      // e.code = fyzická klávesa, nezávislá na rozložení klávesnice (česká, …)
      const match = e.code.match(/^(?:Digit|Numpad)([0-9])$/)
      if (!match) return
      const digit = match[1]

      if (digit === '0') {
        e.preventDefault()
        suppressNextInputRef.current = true
        selectCharacter(null)
        return
      }

      const character = characters[parseInt(digit) - 1]
      if (character) {
        e.preventDefault()
        suppressNextInputRef.current = true
        selectCharacter(character.id)
      }
    }

    const clearSuppress = () => {
      suppressNextInputRef.current = false
    }

    window.addEventListener('keydown', handleKeyDown)
    window.addEventListener('keyup', clearSuppress)
    return () => {
      window.removeEventListener('keydown', handleKeyDown)
      window.removeEventListener('keyup', clearSuppress)
    }
  })

  const handleQuoteModeToggle = (checked: boolean) => {
    setQuoteMode(checked)
    quoteEscapedRef.current = false
    if (checked && text === '') {
      setText('"')
    } else if (!checked && text === '"') {
      setText('')
    }
  }

  const handleTextChange = (value: string) => {
    if (quoteMode && text === '"') {
      // Mezera jako první znak = nechci přímou řeč, uvozovky i mezera zmizí
      if (value === '" ') {
        quoteEscapedRef.current = true
        setText('')
        return
      }
      // Smazání předvyplněné uvozovky = taky nechci přímou řeč
      if (value === '') {
        quoteEscapedRef.current = true
        setText('')
        return
      }
    }
    setText(value)
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    let finalText = text
    if (quoteMode) {
      // Samotná předvyplněná uvozovka není záznam
      if (finalText.trim() === '"') return
      // Lichý počet uvozovek → automaticky uzavřít na konci
      const quoteCount = (finalText.match(/"/g) || []).length
      if (quoteCount % 2 === 1) {
        finalText += '"'
      }
    }
    if (finalText.trim()) {
      onAddEntry(finalText, selectedCharacterId, multilineMode)
      quoteEscapedRef.current = false
      setText(quoteMode ? '"' : '')
    }
  }

  const handleMultilineToggle = () => {
    if (multilineLocked) return
    setMultilineMode(m => !m)
  }

  const tabClass = (isSelected: boolean) =>
    `px-4 py-2 rounded-lg text-sm font-bold whitespace-nowrap cursor-pointer transition-all ${
      isSelected
        ? 'bg-[#aa3bff] text-white border-2 border-[#aa3bff] shadow-[0_0_20px_rgba(170,59,255,0.5)]'
        : 'bg-black/70 text-gray-400 border-2 border-[#aa3bff]/40 hover:border-[#aa3bff]/70'
    }`

  return (
    <div className="flex-shrink-0 border-t-2 border-[#aa3bff]/50 bg-black/90 p-4 flex flex-col gap-3">
      <div className="flex gap-2 overflow-x-auto pb-1">
        {characters.map((char, index) => (
          <button
            key={char.id}
            type="button"
            onClick={() => selectCharacter(char.id)}
            className={tabClass(selectedCharacterId === char.id)}
          >
            {showShortcutNumbers ? `${char.name} ${index + 1}` : char.name}
          </button>
        ))}
        <button
          type="button"
          onClick={() => selectCharacter(null)}
          className={`ml-6 ${tabClass(selectedCharacterId === null)}`}
        >
          {showShortcutNumbers ? `${dmName ?? 'DM'} 0` : dmName ?? 'DM'}
        </button>

        <div className="ml-auto flex items-center gap-3 flex-shrink-0">
          <label
            title="Zesvětlit obrázek na pozadí"
            className="flex items-center gap-1 cursor-pointer text-[#aa3bff]"
          >
            <span className="text-sm select-none">🔆</span>
            <input
              type="checkbox"
              checked={brightBackground ?? false}
              onChange={(e) => onBrightBackgroundChange?.(e.target.checked)}
              className="w-4 h-4 accent-[#aa3bff] cursor-pointer"
            />
          </label>
          <label
            title="Víceřádkový markdown mód (zapnutí: Ctrl+Enter, odeslání pak Ctrl+Enter)"
            className={`flex items-center gap-1 text-[#aa3bff] ${multilineLocked ? 'cursor-not-allowed opacity-50' : 'cursor-pointer'}`}
          >
            <span className="text-sm select-none">📝</span>
            <input
              type="checkbox"
              checked={multilineMode}
              disabled={multilineLocked}
              onChange={handleMultilineToggle}
              className={`w-4 h-4 accent-[#aa3bff] ${multilineLocked ? 'cursor-not-allowed' : 'cursor-pointer'}`}
            />
          </label>
          <label
            title="Režim přímé řeči – automatické uvozovky"
            className="flex items-center gap-1 cursor-pointer text-[#aa3bff]"
          >
            <span className="text-sm select-none">💬</span>
            <input
              type="checkbox"
              checked={quoteMode}
              onChange={(e) => handleQuoteModeToggle(e.target.checked)}
              className="w-4 h-4 accent-[#aa3bff] cursor-pointer"
            />
          </label>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="flex gap-3">
        <textarea
          ref={textareaRef}
          rows={multilineMode ? 5 : 1}
          value={text}
          onChange={(e) => handleTextChange(e.target.value)}
          onBeforeInput={(e) => {
            // Zahodit znak vložený kombinací AltGr+číslo (přepínání tabů)
            if (suppressNextInputRef.current) {
              e.preventDefault()
              suppressNextInputRef.current = false
            }
          }}
          onKeyDown={(e) => {
            // Ctrl+Enter: ve víceřádkovém módu s víc řádky odešle záznam,
            // jinak (jednořádkový text) přepne víceřádkový mód
            if (e.key === 'Enter' && e.ctrlKey && !e.shiftKey && !e.altKey && !e.metaKey) {
              e.preventDefault()
              if (multilineMode && text.includes('\n')) {
                handleSubmit(e)
              } else {
                handleMultilineToggle()
              }
              return
            }
            // Enter odešle záznam (textarea by jinak vložila nový řádek);
            // ve víceřádkovém módu Enter normálně vkládá nový řádek
            if (e.key === 'Enter' && !e.shiftKey && !e.ctrlKey && !multilineMode) {
              e.preventDefault()
              handleSubmit(e)
              return
            }
            // Tab přepne na předchozí vybraný charakter (střídání dvou mluvčích)
            if (e.key === 'Tab' && !e.ctrlKey && !e.altKey && !e.shiftKey && !e.metaKey) {
              e.preventDefault()
              selectCharacter(previousCharacterIdRef.current)
            }
          }}
          placeholder="Napíš další akci nebo dialog..."
          className={`flex-1 px-4 py-3 bg-black/70 border-2 border-[#aa3bff]/40 rounded-lg text-base text-gray-400 outline-none transition-all focus:border-[#aa3bff] focus:shadow-[0_0_20px_rgba(170,59,255,0.3)] resize-none whitespace-pre-wrap break-words leading-normal ${multilineMode ? 'overflow-y-auto' : 'overflow-hidden'}`}
        />
        <button
          type="submit"
          className="px-6 py-3 bg-[#aa3bff] text-white text-xl font-bold rounded-lg cursor-pointer shadow-[0_0_20px_rgba(170,59,255,0.5)] transition-opacity hover:opacity-80"
        >
          →
        </button>
      </form>
    </div>
  )
}
