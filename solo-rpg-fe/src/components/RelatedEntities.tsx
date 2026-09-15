/** Položka dopočítaného seznamu souvisejících entit v dialogu (vazba se edituje jinde) */
export interface RelatedItem {
  key: string
  icon: string
  label: string
  /** Doplněk za názvem (stav, typ…) */
  suffix?: string
  /** Tooltip položky */
  title?: string
  onOpen?: () => void
}

interface RelatedEntitiesProps {
  heading: React.ReactNode
  items: RelatedItem[]
  className?: string
}

/** Sekce „Související …“ v dialozích – seznam odkazů na jiné entity (otevře jejich detail) */
export default function RelatedEntities({ heading, items, className = '' }: RelatedEntitiesProps) {
  if (items.length === 0) return null
  return (
    <div className={`flex flex-col gap-1 text-left text-sm text-[var(--text)] ${className}`}>
      <span className="opacity-70 text-xs uppercase tracking-wide">{heading}</span>
      {items.map(item => (
        <span key={item.key} title={item.title}>
          {item.icon}{' '}
          <button
            type="button"
            onClick={item.onOpen}
            disabled={!item.onOpen}
            className="text-[var(--accent)] hover:underline disabled:no-underline disabled:opacity-70 text-left"
          >
            {item.label}
          </button>
          {item.suffix && <span className="opacity-50 text-xs"> · {item.suffix}</span>}
        </span>
      ))}
    </div>
  )
}
