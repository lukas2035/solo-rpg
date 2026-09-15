import { useState } from 'react'
import { useNavigate } from 'react-router-dom'

interface Character {
  id: string
  /** Celé jméno */
  name: string
  /** Zobrazované jméno */
  nickname: string
  image: string | null
  /** Postavu v aktuální scéně hraje AI */
  ai?: boolean
  /** Postava je v seznamu postav scény (lze ji ze scény odebrat); dočasní mluvčí ne */
  inScene?: boolean
}

interface CharacterBarProps {
  characters: Character[]
  /** Zobrazit u jmen pořadové číslo pro přepínání klávesnicí (drženo Ctrl/Alt) */
  showShortcutNumbers?: boolean
  onAddCharacter: () => void
  /** Ikona ✏️ u postavy (nebo klik na postavu bez portrétu) → otevřít editaci */
  onCharacterClick: (characterId: string) => void
  /** Klik na portrét → zobrazit na celou obrazovku */
  onPortraitClick?: (image: string, characterName: string) => void
  /** Ikona 🗗 u postavy → otevřít portrét v plovoucím okně */
  onPortraitFloat?: (characterId: string) => void
  onCharacterImageDrop: (characterId: string, file: File) => void
  /** Ikona ✕ u postavy → odebrat jen z aktuální scény (postava ve hře zůstává) */
  onCharacterRemoveFromScene?: (characterId: string) => void
  /** Pravý klik → smazat postavu z celé hry */
  onCharacterDelete?: (characterId: string) => void
  onExportMarkdown?: () => string
  /** Stáhne celou hru (postavy, svět, všechny scény) jako jeden textový Markdown soubor */
  onExportGame?: () => Promise<boolean>
  onRenameGame?: () => Promise<boolean>
  /** Otevře výběr aktuálního vypravěče */
  onSelectNarrator?: () => void
  /** Otevře nastavení AI vypravěče pro aktuální scénu */
  onOpenAi?: () => void
  /** Otevře dialog pravidel pod příběhem (popis systému + zda ho posílat AI) */
  onOpenRules?: () => void
  /** Hra posílá AI informace o kostkách a pravidlech (zvýraznění tlačítka 🎲) */
  rulesInAi?: boolean
  /** AI je pro aktuální scénu zapnutá (zvýraznění tlačítka) */
  aiEnabled?: boolean
  /** AI právě generuje odpověď */
  aiBusy?: boolean
  /** Otevře dialog herního sezení (stopky, hodnocení) */
  onOpenSession?: () => void
  /** Stopky sezení běží (zvýraznění tlačítka) */
  sessionRunning?: boolean
  /** Stopky stojí, ale je naměřený čas (pauza) */
  sessionPaused?: boolean
  onToggleThreads?: () => void
  onToggleFactions?: () => void
  onToggleQuests?: () => void
  onToggleLocations?: () => void
  onToggleLore?: () => void
  threadsOpen?: boolean
  factionsOpen?: boolean
  questsOpen?: boolean
  locationsOpen?: boolean
  loreOpen?: boolean
  /** Počet otevřených dějových nití (odznak na tlačítku) */
  openThreadCount?: number
  /** Počet aktivních frakcí (odznak na tlačítku) */
  activeFactionCount?: number
  /** Počet aktivních questů (odznak na tlačítku) */
  activeQuestCount?: number
  /** Počet lokací a záznamů lore (odznak na tlačítku) */
  locationCount?: number
  loreCount?: number
  onClearStory?: () => Promise<boolean>
  onShowBackground?: () => void
}

export default function CharacterBar({
  characters,
  showShortcutNumbers,
  onAddCharacter,
  onCharacterClick,
  onPortraitClick,
  onPortraitFloat,
  onCharacterImageDrop,
  onCharacterRemoveFromScene,
  onCharacterDelete,
  onExportMarkdown,
  onExportGame,
  onRenameGame,
  onSelectNarrator,
  onOpenAi,
  onOpenRules,
  rulesInAi = false,
  aiEnabled = false,
  aiBusy = false,
  onOpenSession,
  sessionRunning = false,
  sessionPaused = false,
  onToggleThreads,
  onToggleFactions,
  onToggleQuests,
  onToggleLocations,
  onToggleLore,
  threadsOpen = false,
  factionsOpen = false,
  questsOpen = false,
  locationsOpen = false,
  loreOpen = false,
  openThreadCount = 0,
  activeFactionCount = 0,
  activeQuestCount = 0,
  locationCount = 0,
  loreCount = 0,
  onClearStory,
  onShowBackground,
}: CharacterBarProps) {
  const navigate = useNavigate()
  const [aspectRatios, setAspectRatios] = useState<Record<string, number>>({})
  const [copied, setCopied] = useState(false)
  const [feedback, setFeedback] = useState<'story-cleared' | 'story-clear-failed' | 'renamed' | 'rename-failed' | 'exported' | 'export-failed' | null>(null)
  const [exporting, setExporting] = useState(false)

  const showFeedback = (value: NonNullable<typeof feedback>) => {
    setFeedback(value)
    setTimeout(() => setFeedback(null), 1500)
  }

  const handleExportGame = async () => {
    if (!onExportGame || exporting) return
    setExporting(true)
    try {
      showFeedback((await onExportGame()) ? 'exported' : 'export-failed')
    } finally {
      setExporting(false)
    }
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
      <div className="flex gap-3 overflow-x-auto items-center w-full">
        {characters.map((character, index) => {
          const ratio = aspectRatios[character.id] || 1
          const width = CHARACTER_HEIGHT * ratio

          return (
            <div
              key={character.id}
              className="group relative flex-shrink-0 flex flex-col items-center gap-2 cursor-pointer"
              title={`${character.name}${character.ai ? ' (hraje AI)' : ''}${character.image ? ' – klikni pro zvětšení' : ' – klikni pro úpravu'}`}
              onDragOver={handleDragOver}
              onDrop={(e) => handleDrop(e, character.id)}
              onClick={() => {
                if (character.image && onPortraitClick) onPortraitClick(character.image, character.name)
                else onCharacterClick(character.id)
              }}
              onContextMenu={(e) => handleCharacterContextMenu(e, character)}
            >
              <div
                className={`rounded-lg border-2 overflow-hidden bg-gradient-to-b from-gray-700 to-gray-900 flex items-center justify-center hover:border-[var(--accent)] hover:shadow-lg hover:shadow-[var(--accent)]/50 transition-all ${
                  character.ai ? 'border-cyan-400 shadow-[0_0_14px_rgba(34,211,238,0.45)]' : 'border-[var(--accent)]'
                }`}
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
              {character.ai && (
                <span
                  title="Tuto postavu hraje AI"
                  className="absolute top-1 right-1 px-1.5 py-0.5 rounded-md bg-cyan-500 text-black text-[10px] font-bold leading-none shadow pointer-events-none group-hover:opacity-0 transition-opacity"
                >
                  🤖 AI
                </span>
              )}
              {/* Akce zobrazené při najetí myší: upravit / plovoucí portrét / odebrat ze scény */}
              <div className="absolute top-1 right-1 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                <button
                  type="button"
                  title="Upravit postavu"
                  onClick={(e) => { e.stopPropagation(); onCharacterClick(character.id) }}
                  className="w-7 h-7 rounded-md border border-[var(--accent)]/70 bg-black/80 text-sm flex items-center justify-center hover:bg-black hover:border-[var(--accent)] transition-colors"
                >
                  ✏️
                </button>
                {character.image && onPortraitFloat && (
                  <button
                    type="button"
                    title="Otevřít portrét v plovoucím okně"
                    onClick={(e) => { e.stopPropagation(); onPortraitFloat(character.id) }}
                    className="w-7 h-7 rounded-md border border-[var(--accent)]/70 bg-black/80 text-sm text-[var(--accent)] flex items-center justify-center hover:bg-black hover:border-[var(--accent)] transition-colors"
                  >
                    🗗
                  </button>
                )}
                {character.inScene && onCharacterRemoveFromScene && (
                  <button
                    type="button"
                    title="Odebrat ze scény (postava ve hře zůstává, její repliky také)"
                    onClick={(e) => { e.stopPropagation(); onCharacterRemoveFromScene(character.id) }}
                    className="w-7 h-7 rounded-md border border-red-400/70 bg-black/80 text-sm text-red-300 font-bold flex items-center justify-center hover:bg-black hover:border-red-400 transition-colors"
                  >
                    ✕
                  </button>
                )}
              </div>
              <span className={`text-xs font-semibold text-center max-w-[120px] truncate hover:opacity-80 transition-opacity ${character.ai ? 'text-cyan-300' : 'text-[var(--accent)]'}`}>
                {showShortcutNumbers ? `${character.nickname} ${index + 1}` : character.nickname}
              </span>
            </div>
          )
        })}

        <button
          onClick={onAddCharacter}
          title="Nová postava (přidá se do aktuální scény)"
          className="flex-shrink-0 self-center w-10 h-10 rounded-lg border-2 border-dashed border-[var(--accent)] bg-black/50 flex items-center justify-center cursor-pointer hover:bg-black/80 hover:border-solid transition-all"
          type="button"
        >
          <span className="text-2xl leading-none text-[var(--accent)]">+</span>
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
          {onExportGame && (
            <button
              type="button"
              onClick={handleExportGame}
              disabled={exporting}
              title="Exportovat celou hru do jednoho Markdown souboru (jen text – kontext pro AI chat)"
              className={`w-8 h-8 rounded-md border border-[var(--accent)]/60 bg-black/50 flex items-center justify-center cursor-pointer text-sm text-[var(--accent)] hover:bg-black/80 hover:border-[var(--accent)] transition-all ${exporting ? 'opacity-60 cursor-wait' : ''}`}
            >
              {feedback === 'exported' ? '✓' : feedback === 'export-failed' ? '✗' : exporting ? '⏳' : '📄'}
            </button>
          )}
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
            onClick={() => onSelectNarrator?.()}
            title="Vybrat vypravěče (nebo vytvořit nového)"
            className="w-8 h-8 rounded-md border border-[var(--accent)]/60 bg-black/50 flex items-center justify-center cursor-pointer text-sm text-[var(--accent)] hover:bg-black/80 hover:border-[var(--accent)] transition-all"
          >
            🎭
          </button>
          <button
            type="button"
            onClick={() => onOpenAi?.()}
            title={aiEnabled ? 'AI vypravěč je pro tuto scénu zapnutý – nastavení' : 'AI vypravěč pro tuto scénu (vypnuto) – nastavení'}
            className={`relative w-8 h-8 rounded-md border bg-black/50 flex items-center justify-center cursor-pointer text-sm hover:bg-black/80 transition-all ${
              aiEnabled ? 'border-cyan-400 bg-cyan-500/20 text-cyan-300 hover:border-cyan-300' : 'border-[var(--accent)]/60 text-[var(--accent)] hover:border-[var(--accent)]'
            } ${aiBusy ? 'animate-pulse' : ''}`}
          >
            🤖
            {aiEnabled && (
              <span className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-cyan-400 shadow-[0_0_6px_rgba(34,211,238,0.9)] pointer-events-none" />
            )}
          </button>
          {onOpenRules && (
            <button
              type="button"
              onClick={onOpenRules}
              title={rulesInAi ? 'Kostky a pravidla pod příběhem (posílají se AI)' : 'Kostky a pravidla pod příběhem (AI se neposílají)'}
              className={`relative w-8 h-8 rounded-md border bg-black/50 flex items-center justify-center cursor-pointer text-sm hover:bg-black/80 transition-all ${
                rulesInAi ? 'border-cyan-400 bg-cyan-500/20 text-cyan-300 hover:border-cyan-300' : 'border-[var(--accent)]/60 text-[var(--accent)] hover:border-[var(--accent)]'
              }`}
            >
              🎲
              {rulesInAi && (
                <span className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-cyan-400 shadow-[0_0_6px_rgba(34,211,238,0.9)] pointer-events-none" />
              )}
            </button>
          )}
          <button
            type="button"
            onClick={() => onOpenSession?.()}
            title={sessionRunning ? 'Herní sezení běží – stopky a hodnocení' : sessionPaused ? 'Herní sezení pozastaveno – stopky a hodnocení' : 'Herní sezení – stopky a hodnocení'}
            className={`relative w-8 h-8 rounded-md border bg-black/50 flex items-center justify-center cursor-pointer text-sm hover:bg-black/80 transition-all ${
              sessionRunning
                ? 'border-emerald-400 bg-emerald-500/20 text-emerald-300 hover:border-emerald-300'
                : sessionPaused
                  ? 'border-amber-400 bg-amber-500/20 text-amber-300 hover:border-amber-300'
                  : 'border-[var(--accent)]/60 text-[var(--accent)] hover:border-[var(--accent)]'
            }`}
          >
            ⏱️
            {sessionRunning && (
              <span className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-emerald-400 shadow-[0_0_6px_rgba(52,211,153,0.9)] animate-pulse pointer-events-none" />
            )}
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
            onClick={() => onShowBackground?.()}
            title="Zobrazit obrázek pozadí na celou stránku"
            className="w-8 h-8 rounded-md border border-[var(--accent)]/60 bg-black/50 flex items-center justify-center cursor-pointer text-sm text-[var(--accent)] hover:bg-black/80 hover:border-[var(--accent)] transition-all"
          >
            🖼️
          </button>
          <button
            type="button"
            onClick={() => onToggleThreads?.()}
            title={threadsOpen ? 'Skrýt dějové nitě' : 'Zobrazit dějové nitě'}
            className={`relative w-8 h-8 rounded-md border bg-black/50 flex items-center justify-center cursor-pointer text-sm text-[var(--accent)] hover:bg-black/80 hover:border-[var(--accent)] transition-all ${
              threadsOpen ? 'border-[var(--accent)] bg-[var(--accent)]/20' : 'border-[var(--accent)]/60'
            }`}
          >
            🧵
            {openThreadCount > 0 && (
              <span className="absolute top-0 right-0 min-w-[1rem] h-4 px-1 rounded-full bg-[var(--accent)] text-white text-[10px] font-bold flex items-center justify-center leading-none pointer-events-none">
                {openThreadCount}
              </span>
            )}
          </button>
          <button
            type="button"
            onClick={() => onToggleFactions?.()}
            title={factionsOpen ? 'Skrýt frakce' : 'Zobrazit frakce'}
            className={`relative w-8 h-8 rounded-md border bg-black/50 flex items-center justify-center cursor-pointer text-sm text-[var(--accent)] hover:bg-black/80 hover:border-[var(--accent)] transition-all ${
              factionsOpen ? 'border-[var(--accent)] bg-[var(--accent)]/20' : 'border-[var(--accent)]/60'
            }`}
          >
            🏴
            {activeFactionCount > 0 && (
              <span className="absolute top-0 right-0 min-w-[1rem] h-4 px-1 rounded-full bg-[var(--accent)] text-white text-[10px] font-bold flex items-center justify-center leading-none pointer-events-none">
                {activeFactionCount}
              </span>
            )}
          </button>
          <button
            type="button"
            onClick={() => onToggleQuests?.()}
            title={questsOpen ? 'Skrýt questy' : 'Zobrazit questy'}
            className={`relative w-8 h-8 rounded-md border bg-black/50 flex items-center justify-center cursor-pointer text-sm text-[var(--accent)] hover:bg-black/80 hover:border-[var(--accent)] transition-all ${
              questsOpen ? 'border-[var(--accent)] bg-[var(--accent)]/20' : 'border-[var(--accent)]/60'
            }`}
          >
            📜
            {activeQuestCount > 0 && (
              <span className="absolute top-0 right-0 min-w-[1rem] h-4 px-1 rounded-full bg-[var(--accent)] text-white text-[10px] font-bold flex items-center justify-center leading-none pointer-events-none">
                {activeQuestCount}
              </span>
            )}
          </button>
          <button
            type="button"
            onClick={() => onToggleLocations?.()}
            title={locationsOpen ? 'Skrýt lokace' : 'Zobrazit lokace'}
            className={`relative w-8 h-8 rounded-md border bg-black/50 flex items-center justify-center cursor-pointer text-sm text-[var(--accent)] hover:bg-black/80 hover:border-[var(--accent)] transition-all ${
              locationsOpen ? 'border-[var(--accent)] bg-[var(--accent)]/20' : 'border-[var(--accent)]/60'
            }`}
          >
            📍
            {locationCount > 0 && (
              <span className="absolute top-0 right-0 min-w-[1rem] h-4 px-1 rounded-full bg-[var(--accent)] text-white text-[10px] font-bold flex items-center justify-center leading-none pointer-events-none">
                {locationCount}
              </span>
            )}
          </button>
          <button
            type="button"
            onClick={() => onToggleLore?.()}
            title={loreOpen ? 'Skrýt lore' : 'Zobrazit lore'}
            className={`relative w-8 h-8 rounded-md border bg-black/50 flex items-center justify-center cursor-pointer text-sm text-[var(--accent)] hover:bg-black/80 hover:border-[var(--accent)] transition-all ${
              loreOpen ? 'border-[var(--accent)] bg-[var(--accent)]/20' : 'border-[var(--accent)]/60'
            }`}
          >
            📖
            {loreCount > 0 && (
              <span className="absolute top-0 right-0 min-w-[1rem] h-4 px-1 rounded-full bg-[var(--accent)] text-white text-[10px] font-bold flex items-center justify-center leading-none pointer-events-none">
                {loreCount}
              </span>
            )}
          </button>
        </div>
      </div>
    </div>
  )
}
