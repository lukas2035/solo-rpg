import { useEffect, useRef, useState, type ReactNode } from 'react'

export interface FloatingBox {
  x: number
  y: number
  width: number
  height: number
}

interface FloatingWindowProps {
  title: string
  /** Výchozí poloha a velikost (viewport px); okno si ji pak drží samo */
  defaultBox: FloatingBox
  minWidth?: number
  minHeight?: number
  /** Okno je nahoře (naposledy použité) */
  active?: boolean
  onFocus?: () => void
  onClose: () => void
  /** Vlastní prvky v titulkovém pruhu (vpravo od názvu, před ✕) */
  titleExtra?: ReactNode
  children: ReactNode
}

const TITLE_HEIGHT = 30

type Edge = 'n' | 's' | 'e' | 'w' | 'nw' | 'ne' | 'sw' | 'se'

/**
 * Obecné plovoucí okno s libovolným obsahem (např. editor poznámek vedle scény na velkém monitoru):
 * přetažení za titulkový pruh, změna velikosti za hrany i rohy, drží se uvnitř okna prohlížeče.
 */
export default function FloatingWindow({ title, defaultBox, minWidth = 280, minHeight = 200, active = true, onFocus, onClose, titleExtra, children }: FloatingWindowProps) {
  const [box, setBox] = useState<FloatingBox>(() => clamp(defaultBox, minWidth, minHeight))
  const [interacting, setInteracting] = useState<'move' | 'resize' | null>(null)
  const boxRef = useRef(box)
  useEffect(() => { boxRef.current = box }, [box])

  useEffect(() => {
    const onResize = () => setBox(prev => clamp(prev, minWidth, minHeight))
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [minWidth, minHeight])

  const startDrag = (e: React.PointerEvent, mode: 'move' | Edge) => {
    if (e.button !== 0) return
    e.preventDefault()
    e.stopPropagation()
    onFocus?.()
    const startX = e.clientX
    const startY = e.clientY
    const start = boxRef.current
    setInteracting(mode === 'move' ? 'move' : 'resize')

    const onMove = (ev: PointerEvent) => {
      const dx = ev.clientX - startX
      const dy = ev.clientY - startY
      if (mode === 'move') {
        setBox(clamp({ ...start, x: start.x + dx, y: start.y + dy }, minWidth, minHeight))
        return
      }
      let { x, y, width, height } = start
      if (mode.includes('e')) width = Math.max(minWidth, start.width + dx)
      if (mode.includes('s')) height = Math.max(minHeight, start.height + dy)
      if (mode.includes('w')) {
        width = Math.max(minWidth, start.width - dx)
        x = start.x + start.width - width
      }
      if (mode.includes('n')) {
        height = Math.max(minHeight, start.height - dy)
        y = start.y + start.height - height
      }
      setBox(clamp({ x, y, width, height }, minWidth, minHeight))
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

  const handles: { edge: Edge; className: string; cursor: string }[] = [
    { edge: 'n', className: '-top-1 left-3 right-3 h-2', cursor: 'ns-resize' },
    { edge: 's', className: '-bottom-1 left-3 right-3 h-2', cursor: 'ns-resize' },
    { edge: 'w', className: '-left-1 top-3 bottom-3 w-2', cursor: 'ew-resize' },
    { edge: 'e', className: '-right-1 top-3 bottom-3 w-2', cursor: 'ew-resize' },
    { edge: 'nw', className: '-top-1 -left-1 w-4 h-4', cursor: 'nwse-resize' },
    { edge: 'ne', className: '-top-1 -right-1 w-4 h-4', cursor: 'nesw-resize' },
    { edge: 'sw', className: '-bottom-1 -left-1 w-4 h-4', cursor: 'nesw-resize' },
    { edge: 'se', className: '-bottom-1 -right-1 w-4 h-4', cursor: 'nwse-resize' },
  ]

  return (
    <div
      role="dialog"
      aria-label={title}
      onPointerDown={onFocus}
      className={`fixed flex flex-col rounded-lg border-2 bg-black shadow-2xl ${
        active ? 'border-[var(--accent)] shadow-[var(--accent)]/40' : 'border-[var(--accent)]/50'
      } ${interacting ? 'select-none' : 'transition-shadow'}`}
      style={{ left: box.x, top: box.y, width: box.width, height: box.height, zIndex: active ? 41 : 40 }}
    >
      <div
        onPointerDown={e => startDrag(e, 'move')}
        title="Přetáhni pro přesun"
        className={`flex-shrink-0 flex items-center gap-2 px-2 bg-gradient-to-b from-black to-gray-900 border-b border-[var(--accent)]/40 rounded-t-md select-none ${interacting === 'move' ? 'cursor-grabbing' : 'cursor-grab'}`}
        style={{ height: TITLE_HEIGHT }}
      >
        <span className="text-xs font-semibold text-[var(--accent)] truncate">{title}</span>
        <div className="flex-1 min-w-0 flex items-center gap-1" onPointerDown={e => e.stopPropagation()}>
          {titleExtra}
        </div>
        <button
          type="button"
          onPointerDown={e => e.stopPropagation()}
          onClick={onClose}
          title="Zavřít"
          className="w-5 h-5 rounded text-xs text-[var(--accent)] hover:bg-red-500/40 hover:text-white flex items-center justify-center"
        >
          ✕
        </button>
      </div>

      <div className="flex-1 min-h-0 flex flex-col rounded-b-md overflow-hidden">{children}</div>

      {handles.map(({ edge, className, cursor }) => (
        <div key={edge} onPointerDown={e => startDrag(e, edge)} className={`absolute z-10 ${className}`} style={{ cursor }} />
      ))}
    </div>
  )
}

function clamp(next: FloatingBox, minWidth: number, minHeight: number): FloatingBox {
  const width = Math.min(Math.max(next.width, minWidth), Math.max(minWidth, window.innerWidth - 16))
  const height = Math.min(Math.max(next.height, minHeight), Math.max(minHeight, window.innerHeight - 16))
  return {
    width,
    height,
    x: Math.min(Math.max(next.x, 0), Math.max(0, window.innerWidth - width)),
    y: Math.min(Math.max(next.y, 0), Math.max(0, window.innerHeight - height)),
  }
}
