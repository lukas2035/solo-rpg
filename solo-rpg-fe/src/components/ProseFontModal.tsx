import { useState } from 'react'
import type { ProseFont, ProseFontPreset, ProseFontShadow } from '@solo-rpg/shared'
import { PROSE_FONT_DARK, PROSE_FONT_LIGHT } from '@solo-rpg/shared'
import { inputClass } from '../utils/forms'
import { proseFontStyle } from '../utils/proseStyle'
import ColorField from './ColorField'

interface ProseFontModalProps {
  value: ProseFont
  /** Knihovna písem kampaně */
  presets: ProseFontPreset[]
  onSave: (font: ProseFont) => Promise<void>
  onPresetsChange: (presets: ProseFontPreset[]) => Promise<void>
  onClose: () => void
}

/** Písma, na která se lze spolehnout napříč prohlížeči a systémy (web-safe) + obecné rodiny */
const FONT_FAMILIES: { label: string; value: string; group: string }[] = [
  { group: 'Patkové', label: 'Georgia', value: "Georgia, 'Times New Roman', serif" },
  { group: 'Patkové', label: 'Times New Roman', value: "'Times New Roman', Times, serif" },
  { group: 'Patkové', label: 'Garamond', value: "Garamond, 'EB Garamond', 'Times New Roman', serif" },
  { group: 'Patkové', label: 'Book Antiqua / Palatino', value: "'Book Antiqua', Palatino, 'Palatino Linotype', serif" },
  { group: 'Patkové', label: 'Cambria', value: "Cambria, Georgia, serif" },
  { group: 'Patkové', label: 'Baskerville', value: "Baskerville, 'Libre Baskerville', Georgia, serif" },
  { group: 'Patkové', label: 'Obecné patkové (serif)', value: 'serif' },
  { group: 'Bezpatkové', label: 'Arial', value: 'Arial, Helvetica, sans-serif' },
  { group: 'Bezpatkové', label: 'Helvetica', value: "Helvetica, 'Helvetica Neue', Arial, sans-serif" },
  { group: 'Bezpatkové', label: 'Verdana', value: 'Verdana, Geneva, sans-serif' },
  { group: 'Bezpatkové', label: 'Tahoma', value: 'Tahoma, Geneva, sans-serif' },
  { group: 'Bezpatkové', label: 'Trebuchet MS', value: "'Trebuchet MS', Helvetica, sans-serif" },
  { group: 'Bezpatkové', label: 'Calibri', value: 'Calibri, Candara, Segoe, sans-serif' },
  { group: 'Bezpatkové', label: 'Segoe UI', value: "'Segoe UI', Tahoma, Geneva, sans-serif" },
  { group: 'Bezpatkové', label: 'Gill Sans', value: "'Gill Sans', 'Gill Sans MT', Calibri, sans-serif" },
  { group: 'Bezpatkové', label: 'Obecné bezpatkové (sans-serif)', value: 'sans-serif' },
  { group: 'Neproporcionální', label: 'Courier New', value: "'Courier New', Courier, monospace" },
  { group: 'Neproporcionální', label: 'Lucida Console', value: "'Lucida Console', Monaco, monospace" },
  { group: 'Neproporcionální', label: 'Consolas', value: "Consolas, 'Lucida Console', monospace" },
  { group: 'Neproporcionální', label: 'Obecné neproporcionální (monospace)', value: 'monospace' },
  { group: 'Ozdobné', label: 'Impact', value: "Impact, Haettenschweiler, 'Arial Narrow Bold', sans-serif" },
  { group: 'Ozdobné', label: 'Copperplate', value: "Copperplate, 'Copperplate Gothic Light', fantasy" },
  { group: 'Ozdobné', label: 'Papyrus', value: 'Papyrus, fantasy' },
  { group: 'Ozdobné', label: 'Brush Script MT', value: "'Brush Script MT', cursive" },
  { group: 'Ozdobné', label: 'Comic Sans MS', value: "'Comic Sans MS', 'Comic Sans', cursive" },
  { group: 'Ozdobné', label: 'Obecné psací (cursive)', value: 'cursive' },
  { group: 'Ozdobné', label: 'Obecné ozdobné (fantasy)', value: 'fantasy' },
  { group: 'Systémové', label: 'Systémové UI písmo', value: 'system-ui, sans-serif' },
]
const FONT_GROUPS = [...new Set(FONT_FAMILIES.map(f => f.group))]

const DEFAULT_SHADOW: ProseFontShadow = { color: '#000000', blur: 4, x: 1, y: 1 }

const SAMPLE_TEXT = 'Příliš žluťoučký kůň úpěl ďábelské ódy. Za řekou se zvedala mlha a ve světle luceren se leskly mokré dlaždice.'

const newPresetId = () => `font_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`

/**
 * Dialog písma prózy (jedno pro celou scénu): rodina (web-safe písma), základní velikost, barva a volitelný stín.
 * Předvolby „Světlé“ / „Tmavé“ nahrazují dřívější přepínač barvy. Nastavení lze uložit do knihovny písem kampaně
 * a odtud ho kdykoli načíst, přepsat aktuálním nastavením, přejmenovat nebo smazat.
 */
export default function ProseFontModal({ value, presets, onSave, onPresetsChange, onClose }: ProseFontModalProps) {
  const [font, setFont] = useState<ProseFont>(value)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [presetName, setPresetName] = useState('')
  const [renaming, setRenaming] = useState<{ id: string; name: string } | null>(null)

  const patch = (p: Partial<ProseFont>) => setFont(prev => ({ ...prev, ...p }))
  const patchShadow = (p: Partial<ProseFontShadow>) => setFont(prev => ({ ...prev, shadow: { ...(prev.shadow ?? DEFAULT_SHADOW), ...p } }))

  // Vlastní hodnota rodiny (ze starší verze / knihovny) se v selectu ukáže jako extra položka
  const knownFamily = FONT_FAMILIES.some(f => f.value === font.family)

  const run = async (work: () => Promise<void>, failMessage: string) => {
    setSaving(true)
    setError(null)
    try {
      await work()
    } catch (err) {
      setError(err instanceof Error ? err.message : failMessage)
    } finally {
      setSaving(false)
    }
  }

  const handleSave = () => run(async () => { await onSave(font); onClose() }, 'Uložení písma selhalo.')

  const addPreset = () => {
    const name = presetName.trim()
    if (!name) { setError('Zadej název písma pro knihovnu.'); return }
    if (presets.some(p => p.name.toLocaleLowerCase('cs') === name.toLocaleLowerCase('cs'))) { setError(`Písmo „${name}“ už v knihovně je – přepiš ho tlačítkem ⟳.`); return }
    void run(async () => {
      await onPresetsChange([...presets, { ...font, id: newPresetId(), name }])
      setPresetName('')
    }, 'Uložení do knihovny selhalo.')
  }
  const overwritePreset = (preset: ProseFontPreset) => {
    if (!window.confirm(`Přepsat písmo „${preset.name}“ v knihovně aktuálním nastavením?`)) return
    void run(() => onPresetsChange(presets.map(p => (p.id === preset.id ? { ...font, id: p.id, name: p.name } : p))), 'Přepsání písma selhalo.')
  }
  const deletePreset = (preset: ProseFontPreset) => {
    if (!window.confirm(`Smazat písmo „${preset.name}“ z knihovny? Scény, které ho používají, si své nastavení ponechají.`)) return
    void run(() => onPresetsChange(presets.filter(p => p.id !== preset.id)), 'Smazání písma selhalo.')
  }
  const commitRename = () => {
    if (!renaming) return
    const name = renaming.name.trim()
    const id = renaming.id
    setRenaming(null)
    if (!name || presets.some(p => p.id !== id && p.name.toLocaleLowerCase('cs') === name.toLocaleLowerCase('cs'))) return
    void run(() => onPresetsChange(presets.map(p => (p.id === id ? { ...p, name } : p))), 'Přejmenování selhalo.')
  }
  const applyPreset = (preset: ProseFontPreset) => {
    const { id: _id, name: _name, ...rest } = preset
    setFont(rest)
  }

  const button = 'px-3 h-8 rounded-md text-sm border border-white/15 hover:border-cyan-400/60 hover:bg-white/10 disabled:opacity-40 disabled:cursor-not-allowed'
  const smallButton = 'px-1.5 h-6 rounded text-xs border border-white/15 hover:border-cyan-400/60 hover:bg-white/10 disabled:opacity-40'
  const label = 'flex flex-col gap-1 text-sm text-[var(--text)]'

  return (
    <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4" onClick={() => { if (!saving) onClose() }}>
      <div
        className="bg-[#111] border-2 border-cyan-500/60 rounded-xl p-6 w-[900px] max-w-full max-h-full overflow-y-auto flex flex-col gap-4"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center gap-3 flex-wrap">
          <h2 className="text-xl font-bold text-cyan-300">🔤 Písmo scény</h2>
          <div className="flex gap-1 ml-auto">
            <button type="button" title="Světlé písmo na tmavý podklad" onClick={() => setFont(PROSE_FONT_LIGHT)} className={button}>☀️ Světlé</button>
            <button type="button" title="Tmavé písmo na světlý podklad" onClick={() => setFont(PROSE_FONT_DARK)} className={button}>🌙 Tmavé</button>
          </div>
        </div>

        {/* Náhled */}
        <div className="rounded-lg border border-white/15 px-6 py-5 leading-relaxed" style={{ ...proseFontStyle(font), backgroundColor: '#2a2a2a', backgroundImage: 'linear-gradient(135deg, #1a1a1a 50%, #e9e4d8 50%)' }}>
          <div style={{ fontSize: '1.6em', fontWeight: 700, marginBottom: '0.3em' }}>Nadpis kapitoly</div>
          {SAMPLE_TEXT}
        </div>

        <div className="grid sm:grid-cols-2 gap-4">
          <label className={label}>
            Rodina písma
            <select value={font.family} onChange={e => patch({ family: e.target.value })} className={inputClass}>
              {!knownFamily && <option value={font.family}>{font.family}</option>}
              {FONT_GROUPS.map(group => (
                <optgroup key={group} label={group}>
                  {FONT_FAMILIES.filter(f => f.group === group).map(f => (
                    <option key={f.value} value={f.value} style={{ fontFamily: f.value }}>{f.label}</option>
                  ))}
                </optgroup>
              ))}
            </select>
          </label>
          <label className={label}>
            Základní velikost: {font.size} px <span className="opacity-60">(nadpisy se odvozují)</span>
            <div className="flex items-center gap-2">
              <input type="range" min={10} max={72} step={1} value={font.size} onChange={e => patch({ size: Number(e.target.value) })} className="flex-1" />
              <input type="number" min={10} max={72} value={font.size} onChange={e => { const n = Number(e.target.value); if (n >= 10 && n <= 72) patch({ size: n }) }} className={`${inputClass} w-20`} />
            </div>
          </label>
          <div className={label}>
            Barva písma
            <ColorField value={font.color} onChange={color => patch({ color })} swatches={[[PROSE_FONT_LIGHT.color, 'Světlé (výchozí)'], [PROSE_FONT_DARK.color, 'Tmavé'], ['#ffffff', 'Bílá'], ['#000000', 'Černá'], ['#d4b483', 'Pergamen'], ['#b43c3c', 'Krvavě červená']]} />
          </div>
          <div className={label}>
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={font.shadow !== null} onChange={e => patch({ shadow: e.target.checked ? DEFAULT_SHADOW : null })} />
              Stín písma
            </label>
            {font.shadow && (
              <div className="flex flex-col gap-2 pl-5">
                <ColorField value={font.shadow.color} onChange={color => patchShadow({ color })} swatches={[['#000000', 'Černý'], ['#ffffff', 'Bílý'], ['#5a3b1a', 'Hnědý']]} />
                <div className="grid grid-cols-3 gap-2 text-xs">
                  <label className="flex flex-col gap-0.5">
                    Rozostření {font.shadow.blur}px
                    <input type="range" min={0} max={40} value={font.shadow.blur} onChange={e => patchShadow({ blur: Number(e.target.value) })} />
                  </label>
                  <label className="flex flex-col gap-0.5">
                    Posun X {font.shadow.x}px
                    <input type="range" min={-20} max={20} value={font.shadow.x} onChange={e => patchShadow({ x: Number(e.target.value) })} />
                  </label>
                  <label className="flex flex-col gap-0.5">
                    Posun Y {font.shadow.y}px
                    <input type="range" min={-20} max={20} value={font.shadow.y} onChange={e => patchShadow({ y: Number(e.target.value) })} />
                  </label>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Knihovna písem kampaně */}
        <div className="flex flex-col gap-2 border-t border-white/10 pt-3">
          <div className="text-sm font-semibold">Knihovna písem kampaně</div>
          <div className="flex gap-2">
            <input
              type="text"
              value={presetName}
              onChange={e => setPresetName(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addPreset() } }}
              placeholder="Název pro uložení aktuálního nastavení…"
              maxLength={60}
              className={`${inputClass} flex-1`}
            />
            <button type="button" disabled={saving || !presetName.trim()} onClick={addPreset} className={button}>💾 Uložit do knihovny</button>
          </div>
          {presets.length === 0 ? (
            <div className="text-xs opacity-60">Knihovna je prázdná.</div>
          ) : (
            <ul className="flex flex-col gap-1 max-h-48 overflow-y-auto">
              {presets.map(p => (
                <li key={p.id} className="flex items-center gap-2 px-2 py-1 rounded-md border border-white/10 bg-white/5 text-sm">
                  <span className="w-8 h-8 rounded flex-shrink-0 flex items-center justify-center border border-white/10" style={{ ...proseFontStyle(p), fontSize: '18px', backgroundColor: '#2a2a2a' }} title="Ukázka">Aa</span>
                  {renaming?.id === p.id ? (
                    <input
                      autoFocus
                      type="text"
                      value={renaming.name}
                      maxLength={60}
                      onChange={e => setRenaming({ id: p.id, name: e.target.value })}
                      onBlur={commitRename}
                      onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); commitRename() } if (e.key === 'Escape') setRenaming(null) }}
                      className={`${inputClass} flex-1 h-7`}
                    />
                  ) : (
                    <button type="button" onClick={() => setRenaming({ id: p.id, name: p.name })} title="Přejmenovat" className="flex-1 text-left truncate hover:underline">{p.name}</button>
                  )}
                  <span className="text-xs opacity-60 truncate max-w-40" title={p.family}>{FONT_FAMILIES.find(f => f.value === p.family)?.label ?? p.family} · {p.size}px</span>
                  <button type="button" disabled={saving} onClick={() => applyPreset(p)} className={`${smallButton} text-cyan-300`} title="Načíst do nastavení (uloží se až tlačítkem „Uložit písmo“)">Použít</button>
                  <button type="button" disabled={saving} onClick={() => overwritePreset(p)} className={smallButton} title="Přepsat aktuálním nastavením">⟳</button>
                  <button type="button" disabled={saving} onClick={() => deletePreset(p)} className={`${smallButton} hover:bg-red-500/30 hover:border-red-400/60`} title="Smazat z knihovny">🗑</button>
                </li>
              ))}
            </ul>
          )}
        </div>

        {error && <div className="text-sm text-red-300">{error}</div>}

        <div className="flex gap-2 justify-end">
          <button type="button" disabled={saving} onClick={onClose} className={button}>Zrušit</button>
          <button type="button" disabled={saving} onClick={() => void handleSave()} className={`${button} border-cyan-400 bg-cyan-700/50 text-cyan-50 font-semibold`}>
            {saving ? 'Ukládám…' : 'Uložit písmo'}
          </button>
        </div>
      </div>
    </div>
  )
}
