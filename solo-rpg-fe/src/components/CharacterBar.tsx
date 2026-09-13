import { useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'

interface Character {
  id: string
  /** Celé jméno */
  name: string
  /** Zobrazované jméno */
  nickname: string
  image: string | null
}

interface CharacterBarProps {
  characters: Character[]
  /** Zobrazit u jmen pořadové číslo pro přepínání klávesnicí (drženo Ctrl/Alt) */
  showShortcutNumbers?: boolean
  onAddCharacter: () => void
  /** Klik na postavu → otevřít editaci */
  onCharacterClick: (characterId: string) => void
  onCharacterImageDrop: (characterId: string, file: File) => void
  onCharacterDelete?: (characterId: string) => void
  onBackgroundImageDrop?: (image: File | string) => void
  onExportMarkdown?: () => string
  onSaveSetup?: () => Promise<boolean>
  onLoadSetup?: () => Promise<boolean>
  onLoadStory?: () => Promise<boolean>
  onRenameGame?: () => Promise<boolean>
  onEditDm?: () => void
  onClearStory?: () => Promise<boolean>
  onClearBackground?: () => void
  onShowBackground?: () => void
}

export default function CharacterBar({
  characters,
  showShortcutNumbers,
  onAddCharacter,
  onCharacterClick,
  onCharacterImageDrop,
  onCharacterDelete,
  onBackgroundImageDrop,
  onExportMarkdown,
  onSaveSetup,
  onLoadSetup,
  onLoadStory,
  onRenameGame,
  onEditDm,
  onClearStory,
  onClearBackground,
  onShowBackground,
}: CharacterBarProps) {
  const navigate = useNavigate()
  const [aspectRatios, setAspectRatios] = useState<Record<string, number>>({})
  const [copied, setCopied] = useState(false)
  const [feedback, setFeedback] = useState<'saved' | 'save-failed' | 'loaded' | 'load-failed' | 'story-loaded' | 'story-load-failed' | 'story-cleared' | 'story-clear-failed' | 'renamed' | 'rename-failed' | null>(null)

  const showFeedback = (value: NonNullable<typeof feedback>) => {
    setFeedback(value)
    setTimeout(() => setFeedback(null), 1500)
  }

  const handleSaveSetup = async () => {
    if (!onSaveSetup) return
    showFeedback((await onSaveSetup()) ? 'saved' : 'save-failed')
  }

  const handleLoadSetup = async () => {
    if (!onLoadSetup) return
    showFeedback((await onLoadSetup()) ? 'loaded' : 'load-failed')
  }

  const handleLoadStory = async () => {
    if (!onLoadStory) return
    showFeedback((await onLoadStory()) ? 'story-loaded' : 'story-load-failed')
  }

  const handleRenameGame = async () => {
    if (!onRenameGame) return
    showFeedback((await onRenameGame()) ? 'renamed' : 'rename-failed')
  }

  const handleClearStory = async () => {
    if (!onClearStory) return
    if (!window.confirm('Opravdu vymazat všechny záznamy aktuální scény (i ve vaultu)?')) return
    showFeedback((await onClearStory()) ? 'story-cleared' : 'story-clear-failed')
  }
  const backgroundInputRef = useRef<HTMLInputElement | null>(null)

  const isImageFile = (f: File) =>
    f.type.startsWith('image/') ||
    (!f.type && /\.(png|jpe?g|jfif|gif|webp|avif|bmp|svg)$/i.test(f.name))

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault()
  }

  const handleDrop = (e: React.DragEvent, characterId: string) => {
    e.preventDefault()
    e.stopPropagation()
    const files = Array.from(e.dataTransfer.files)
    const imageFile = files.find(isImageFile)
    if (imageFile) {
      onCharacterImageDrop(characterId, imageFile)
    }
  }

  const handleCharacterContextMenu = (e: React.MouseEvent, character: Character) => {
    e.preventDefault()
    if (!onCharacterDelete) return
    if (window.confirm(`Opravdu chceš smazat postavu „${character.name}“?`)) {
      onCharacterDelete(character.id)
    }
  }

  const handleBackgroundDrop = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    if (!onBackgroundImageDrop) return

    // Soubor z disku (některé soubory z Průzkumníka mají prázdný MIME typ)
    const files = Array.from(e.dataTransfer?.files ?? [])
    const imageFile = files.find(isImageFile)
    if (imageFile) {
      onBackgroundImageDrop(imageFile)
      return
    }

    // Obrázek přetažený z webu (URL v dataTransfer)
    const html = e.dataTransfer.getData('text/html')
    const srcMatch = html.match(/<img[^>]+src="([^"]+)"/i)
    const url = srcMatch?.[1] || e.dataTransfer.getData('text/uri-list') || e.dataTransfer.getData('text/plain')
    if (url && /^(https?:|data:image\/)/i.test(url.trim())) {
      onBackgroundImageDrop(url.trim())
    }
  }

  const handleBackgroundPicker = (file: File | null | undefined) => {
    if (file && isImageFile(file) && onBackgroundImageDrop) {
      onBackgroundImageDrop(file)
    }
  }

  const handleCopyMarkdown = async () => {
    if (!onExportMarkdown) return
    try {
      await navigator.clipboard.writeText(onExportMarkdown())
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      // schránka není dostupná (např. bez HTTPS) – neděláme nic
    }
  }

  const handleImageLoad = (characterId: string, img: HTMLImageElement) => {
    const ratio = img.naturalWidth / img.naturalHeight
    setAspectRatios(prev => ({ ...prev, [characterId]: ratio }))
  }

  const CHARACTER_HEIGHT = 112 // h-28 = 7rem = 112px

  return (
    <div className="relative bg-gradient-to-b from-black/80 to-black/40 border-b-2 border-[var(--accent)] px-4 py-4">
      <input
        ref={backgroundInputRef}
        type="file"
        accept="image/*"
        hidden
        onChange={(e) => {
          const file = e.target.files?.[0]
          handleBackgroundPicker(file)
          e.target.value = ''
        }}
      />

      <div className="flex gap-3 overflow-x-auto items-center w-full">
        {characters.map((character, index) => {
          const ratio = aspectRatios[character.id] || 1
          const width = CHARACTER_HEIGHT * ratio

          return (
            <div
              key={character.id}
              className="flex-shrink-0 flex flex-col items-center gap-2 cursor-pointer"
              title={`${character.name} – klikni pro úpravu`}
              onDragOver={handleDragOver}
              onDrop={(e) => handleDrop(e, character.id)}
              onClick={() => onCharacterClick(character.id)}
              onContextMenu={(e) => handleCharacterContextMenu(e, character)}
            >
              <div
                className="rounded-lg border-2 border-[var(--accent)] overflow-hidden bg-gradient-to-b from-gray-700 to-gray-900 flex items-center justify-center hover:border-[var(--accent)] hover:shadow-lg hover:shadow-[var(--accent)]/50 transition-all"
                style={{
                  height: `${CHARACTER_HEIGHT}px`,
                  width: character.image ? `${width}px` : `${CHARACTER_HEIGHT}px`,
                }}
              >
                {character.image ? (
                  <img
                    src={character.image}
                    alt={character.name}
                    className="h-full w-full object-contain"
                    onLoad={(e) => handleImageLoad(character.id, e.currentTarget)}
                  />
                ) : (
                  <div className="text-xs text-[var(--text)] text-center px-2">
                    Přetáhni obrázek
                  </div>
                )}
              </div>
              <span className="text-xs text-[var(--accent)] font-semibold text-center max-w-[120px] truncate hover:opacity-80 transition-opacity">
                {showShortcutNumbers ? `${character.nickname} ${index + 1}` : character.nickname}
              </span>
            </div>
          )
        })}

        <button
          onClick={onAddCharacter}
          className="flex-shrink-0 rounded-lg border-2 border-dashed border-[var(--accent)] bg-black/50 flex items-center justify-center cursor-pointer hover:bg-black/80 hover:border-solid transition-all"
          style={{
            height: `${CHARACTER_HEIGHT}px`,
            width: `${CHARACTER_HEIGHT}px`,
          }}
          type="button"
        >
          <span className="text-3xl text-[var(--accent)]">+</span>
        </button>

        <div className="flex-shrink-0 ml-auto self-start grid grid-rows-3 grid-flow-col gap-1">
          <button
            type="button"
            onClick={() => navigate('/')}
            title="Zpět na úvodní obrazovku"
            className="w-8 h-8 rounded-md border border-[var(--accent)]/60 bg-black/50 flex items-center justify-center cursor-pointer text-sm text-[var(--accent)] hover:bg-black/80 hover:border-[var(--accent)] transition-all"
          >
            🏠
          </button>
          <button
            type="button"
            onClick={handleCopyMarkdown}
            title="Zkopírovat příběh jako Markdown"
            className="w-8 h-8 rounded-md border border-[var(--accent)]/60 bg-black/50 flex items-center justify-center cursor-pointer text-sm text-[var(--accent)] hover:bg-black/80 hover:border-[var(--accent)] transition-all"
          >
            {copied ? '✓' : '📋'}
          </button>
          <button
            type="button"
            onClick={handleSaveSetup}
            title="Uložit postavy a pozadí do vaultu"
            className="w-8 h-8 rounded-md border border-[var(--accent)]/60 bg-black/50 flex items-center justify-center cursor-pointer text-sm text-[var(--accent)] hover:bg-black/80 hover:border-[var(--accent)] transition-all"
          >
            {feedback === 'saved' ? '✓' : feedback === 'save-failed' ? '✗' : '💾'}
          </button>
          <button
            type="button"
            onClick={handleLoadSetup}
            title="Znovu načíst postavy a pozadí z vaultu (po úpravách v Obsidianu)"
            className="w-8 h-8 rounded-md border border-[var(--accent)]/60 bg-black/50 flex items-center justify-center cursor-pointer text-sm text-[var(--accent)] hover:bg-black/80 hover:border-[var(--accent)] transition-all"
          >
            {feedback === 'loaded' ? '✓' : feedback === 'load-failed' ? '✗' : '📂'}
          </button>
          <button
            type="button"
            onClick={handleLoadStory}
            title="Znovu načíst scénu z vaultu (po úpravách v Obsidianu)"
            className="w-8 h-8 rounded-md border border-[var(--accent)]/60 bg-black/50 flex items-center justify-center cursor-pointer text-sm text-[var(--accent)] hover:bg-black/80 hover:border-[var(--accent)] transition-all"
          >
            {feedback === 'story-loaded' ? '✓' : feedback === 'story-load-failed' ? '✗' : '💬'}
          </button>
          <button
            type="button"
            onClick={handleRenameGame}
            title="Přejmenovat aktuální hru"
            className="w-8 h-8 rounded-md border border-[var(--accent)]/60 bg-black/50 flex items-center justify-center cursor-pointer text-sm text-[var(--accent)] hover:bg-black/80 hover:border-[var(--accent)] transition-all"
          >
            {feedback === 'renamed' ? '✓' : feedback === 'rename-failed' ? '✗' : '✏️'}
          </button>
          <button
            type="button"
            onClick={() => onEditDm?.()}
            title="Nastavit jméno a portrét vypravěče (DM)"
            className="w-8 h-8 rounded-md border border-[var(--accent)]/60 bg-black/50 flex items-center justify-center cursor-pointer text-sm text-[var(--accent)] hover:bg-black/80 hover:border-[var(--accent)] transition-all"
          >
            🎭
          </button>
          <button
            type="button"
            onClick={handleClearStory}
            title="Vymazat všechny záznamy aktuální scény"
            className="w-8 h-8 rounded-md border border-[var(--accent)]/60 bg-black/50 flex items-center justify-center cursor-pointer text-sm text-[var(--accent)] hover:bg-black/80 hover:border-[var(--accent)] transition-all"
          >
            {feedback === 'story-cleared' ? '✓' : feedback === 'story-clear-failed' ? '✗' : '🗑️'}
          </button>
          <button
            type="button"
            onClick={() => onClearBackground?.()}
            title="Vymazat obrázek pozadí"
            className="w-8 h-8 rounded-md border border-[var(--accent)]/60 bg-black/50 flex items-center justify-center cursor-pointer text-sm text-[var(--accent)] hover:bg-black/80 hover:border-[var(--accent)] transition-all"
          >
            🚫
          </button>
          <button
            type="button"
            onClick={() => onShowBackground?.()}
            title="Zobrazit obrázek pozadí na celou stránku"
            className="w-8 h-8 rounded-md border border-[var(--accent)]/60 bg-black/50 flex items-center justify-center cursor-pointer text-sm text-[var(--accent)] hover:bg-black/80 hover:border-[var(--accent)] transition-all"
          >
            🖼️
          </button>
        </div>

        <div
          className="flex-shrink-0 w-[120px] h-[112px] border-2 border-dashed border-[var(--accent)]/80 bg-black/30 flex items-center justify-center cursor-pointer relative"
          onClick={() => backgroundInputRef.current?.click()}
          onDragOver={(e) => {
            e.preventDefault()
            e.stopPropagation()
            e.dataTransfer.dropEffect = 'copy'
          }}
          onDrop={handleBackgroundDrop}
        >
          <span className="text-2xl leading-none text-[var(--accent)] absolute left-2 top-2">+</span>
        </div>
      </div>
    </div>
  )
}
