export type SidePanelTab = 'threads' | 'factions' | 'quests' | 'locations' | 'lore'

interface SidePanelProps {
  tab: SidePanelTab
  onTabChange: (tab: SidePanelTab) => void
  /** Odznaky na záložkách (otevřené nitě, aktivní frakce, aktivní questy, počet lokací / záznamů) */
  counts: Record<SidePanelTab, number>
  onClose: () => void
  children: React.ReactNode
}

const TABS: { id: SidePanelTab; icon: string; label: string }[] = [
  { id: 'threads', icon: '🧵', label: 'Dějové nitě' },
  { id: 'factions', icon: '🏴', label: 'Frakce' },
  { id: 'quests', icon: '📜', label: 'Questy' },
  { id: 'locations', icon: '📍', label: 'Lokace' },
  { id: 'lore', icon: '📖', label: 'Lore' },
]

/** Postranní panel kampaně vpravo od příběhu – záložky Dějové nitě | Frakce | Questy | Lokace | Lore (zalamují se do více řádků) */
export default function SidePanel({ tab, onTabChange, counts, onClose, children }: SidePanelProps) {
  return (
    <aside className="w-[440px] max-w-full flex-shrink-0 h-full flex flex-col bg-[#0c0c0c]/95 border-l-2 border-[var(--accent)]/40 text-[var(--text)]">
      <header className="relative flex flex-wrap items-end gap-1 px-2 pt-2 pr-12 border-b border-[var(--accent)]/30">
        {TABS.map(t => {
          const selected = t.id === tab
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => onTabChange(t.id)}
              className={`flex items-center gap-1.5 px-2.5 py-2 rounded-t-lg border border-b-0 text-sm font-semibold whitespace-nowrap transition-colors ${
                selected
                  ? 'border-[var(--accent)]/60 bg-[var(--accent)]/15 text-[var(--accent)]'
                  : 'border-transparent opacity-60 hover:opacity-100 hover:border-[var(--accent)]/30'
              }`}
            >
              <span>{t.icon}</span>
              {t.label}
              {counts[t.id] > 0 && (
                <span className={`min-w-[1.1rem] h-[1.1rem] px-1 rounded-full text-[10px] font-bold flex items-center justify-center leading-none ${selected ? 'bg-[var(--accent)] text-white' : 'bg-white/15'}`}>
                  {counts[t.id]}
                </span>
              )}
            </button>
          )
        })}
        <button type="button" onClick={onClose} title="Zavřít panel" className="absolute top-2 right-2 w-8 h-8 rounded-lg border border-[var(--accent)]/40 hover:border-[var(--accent)] transition-colors">✕</button>
      </header>
      {children}
    </aside>
  )
}
