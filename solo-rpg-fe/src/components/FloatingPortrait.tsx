import { useEffect, useRef, useState } from 'react'

interface FloatingPortraitProps {
  image: string
  name: string
  /** Pořadí okna pro kaskádové umístění nových oken */
  index: number
  /** Okno je nahoře (naposledy použité) */
  active: boolean
  onFocus: () => void
  onClose: () => void
  /** Otevřít portrét na celou obrazovku */
  onFullscreen?: () => void
}

/** Výška titulkového pruhu okna (px) – do poměru stran se nepočítá, ten drží jen obrázek */
const TITLE_HEIGHT = 28
const MIN_WIDTH = 120
const DEFAULT_WIDTH = 320
const CASCADE_STEP = 32

type Corner = 'nw' | 'ne' | 'sw' | 'se'

interface Box {
  x: number
  y: number
  width: number
}

/**
 * Plovoucí okno s portrétem postavy: lze ho přetáhnout kamkoli v okně prohlížeče a rohy zvětšit/zmenšit.
 * Při změně velikosti drží poměr stran obrázku – výška okna se vždy dopočítá z šířky.
 */
export default function FloatingPortrait({ image, name, index, active, onFocus, onClose, onFullscreen }: FloatingPortraitProps) {
  const [ratio, setRatio] = useState(1)
  const [box, setBox] = useState<Box>(() => ({
    x: Math.max(8, window.innerWidth - DEFAULT_WIDTH - 24 - (index % 6) * CASCADE_STEP),
    y: 140 + (index % 6) * CASCADE_STEP,
    width: DEFAULT_WIDTH,
  }))
  const [interacting, setInteracting] = useState<'move' | 'resize' | null>(null)
  const boxRef = useRef(box)
  boxRef.current = box

  const heightFor = (width: number, r: number) => width / r + TITLE_HEIGHT

  const clamp = (next: Box, r: number): Box => {
    const maxWidth = Math.max(MIN_WIDTH, Math.min(window.innerWidth - 16, (window.innerHeight - 16 - TITLE_HEIGHT) * r))
    const width = Math.min(Math.max(next.width, MIN_WIDTH), maxWidth)
    const height = heightFor(width, r)
    return {
      width,
      x: Math.min(Math.max(next.x, 0), Math.max(0, window.innerWidth - width)),
      y: Math.min(Math.max(next.y, 0), Math.max(0, window.innerHeight - height)),
    }
  }

  // Po načtení obrázku přepočítat výšku podle skutečného poměru stran
  const handleImageLoad = (img: HTMLImageElement) => {
    if (!img.naturalWidth || !img.naturalHeight) return
    const r = img.naturalWidth / img.naturalHeight
    setRatio(r)
    setBox(prev => clamp(prev, r))
  }

  useEffect(() => {
    const onResize = () => setBox(prev => clamp(prev, ratio))
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ratio])

  const startDrag = (e: React.PointerEvent, mode: 'move' | Corner) => {
    if (e.button !== 0) return
    e.preventDefault()
    e.stopPropagation()
    onFocus()
    const startX = e.clientX
    const startY = e.clientY
    const start = boxRef.current
    const startHeight = heightFor(start.width, ratio)
    setInteracting(mode === 'move' ? 'move' : 'resize')

    const onMove = (ev: PointerEvent) => {
      const dx = ev.clientX - startX
      const dy = ev.clientY - startY
      if (mode === 'move') {
        setBox(clamp({ ...start, x: start.x + dx, y: start.y + dy }, ratio))
        return
      }
      // Změna velikosti z rohu: šířku určuje větší z posunů (vodorovný, nebo svislý převedený přes poměr stran)
      const signX = mode === 'ne' || mode === 'se' ? 1 : -1
      const signY = mode === 'sw' || mode === 'se' ? 1 : -1
      const fromX = start.width + signX * dx
      const fromY = (startHeight + signY * dy - TITLE_HEIGHT) * ratio
      let width = Math.abs(fromX - start.width) >= Math.abs(fromY - start.width) ? fromX : fromY
      width = Math.max(MIN_WIDTH, width)
      const maxWidth = Math.min(window.innerWidth - 16, (window.innerHeight - 16 - TITLE_HEIGHT) * ratio)
      width = Math.min(width, maxWidth)
      const height = heightFor(width, ratio)
      // Protilehlý roh zůstává na místě
      const x = signX === 1 ? start.x : start.x + start.width - width
      const y = signY === 1 ? start.y : start.y + startHeight - height
      setBox(clamp({ x, y, width }, ratio))
    }
    const onUp = () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      window.removeEventListener('pointercancel', onUp)
      setInteracting(null)
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    window.addEventListener('pointercancel', onUp)
  }

  const height = heightFor(box.width, ratio)
  const cornerClass = 'absolute w-4 h-4 z-10'
  const corners: { corner: Corner; className: string; cursor: string }[] = [
    { corner: 'nw', className: '-top-1 -left-1', cursor: 'nwse-resize' },
    { corner: 'ne', className: '-top-1 -right-1', cursor: 'nesw-resize' },
    { corner: 'sw', className: '-bottom-1 -left-1', cursor: 'nesw-resize' },
    { corner: 'se', className: '-bottom-1 -right-1', cursor: 'nwse-resize' },
  ]

  return (
    <div
      role="dialog"
      aria-label={`Portrét ${name}`}
      onPointerDown={onFocus}
      className={`fixed flex flex-col rounded-lg overflow-visible border-2 bg-black shadow-2xl select-none ${
        active ? 'border-[var(--accent)] shadow-[var(--accent)]/40' : 'border-[var(--accent)]/50'
      } ${interacting ? '' : 'transition-shadow'}`}
      style={{ left: box.x, top: box.y, width: box.width, height, zIndex: active ? 41 : 40 }}
    >
      {/* Titulkový pruh = úchyt pro přetažení */}
      <div
        onPointerDown={(e) => startDrag(e, 'move')}
        onDoubleClick={() => onFullscreen?.()}
        title="Přetáhni pro přesun, dvojklik = celá obrazovka"
        className={`flex items-center gap-2 px-2 bg-gradient-to-b from-black to-gray-900 border-b border-[var(--accent)]/40 rounded-t-md ${interacting === 'move' ? 'cursor-grabbing' : 'cursor-grab'}`}
        style={{ height: TITLE_HEIGHT }}
      >
        <span className="flex-1 text-xs font-semibold text-[var(--accent)] truncate">{name}</span>
        {onFullscreen && (
          <button
            type="button"
            onPointerDown={(e) => e.stopPropagation()}
            onClick={onFullscreen}
            title="Zobrazit na celou obrazovku"
            className="w-5 h-5 rounded text-xs text-[var(--accent)] hover:bg-white/10 flex items-center justify-center"
          >
            ⛶
          </button>
        )}
        <button
          type="button"
          onPointerDown={(e) => e.stopPropagation()}
          onClick={onClose}
          title="Zavřít"
          className="w-5 h-5 rounded text-xs text-[var(--accent)] hover:bg-red-500/40 hover:text-white flex items-center justify-center"
        >
          ✕
        </button>
      </div>

      <div className="flex-1 min-h-0 overflow-hidden rounded-b-md bg-gray-900">
        <img
          src={image}
          alt={name}
          draggable={false}
          onLoad={(e) => handleImageLoad(e.currentTarget)}
          className="w-full h-full object-contain pointer-events-none"
        />
      </div>

      {/* Rohové úchyty pro změnu velikosti (poměr stran se drží) */}
      {corners.map(({ corner, className, cursor }) => (
        <div
          key={corner}
          onPointerDown={(e) => startDrag(e, corner)}
          title="Změnit velikost (poměr stran zůstane)"
          className={`${cornerClass} ${className}`}
          style={{ cursor }}
        >
          <span
            className={`absolute inset-1 rounded-sm border border-[var(--accent)] bg-black/80 transition-opacity ${
              active || interacting ? 'opacity-70 hover:opacity-100' : 'opacity-0 hover:opacity-100'
            }`}
          />
        </div>
      ))}
    </div>
  )
}
