import { useEffect, useRef, useState } from 'react'
import type { ImageRef, ProseBackground, ProseBackgroundMode } from '@solo-rpg/shared'
import { PROSE_BACKGROUND_DARK_COLOR, PROSE_BACKGROUND_LIGHT_COLOR } from '@solo-rpg/shared'
import { assetUrl, useAssetVersion } from '../utils/api'
import { inputClass } from '../utils/forms'
import { PROSE_BACKGROUND_MODES, proseBackgroundStyle } from '../utils/proseStyle'
import ColorField from './ColorField'
import ProseImageLibraryModal from './ProseImageLibraryModal'

/** Nové pozadí k uložení: obrázek buď odkaz z knihovny / beze změny (string), nový soubor či URL k nahrání, nebo null = bez obrázku */
export interface ProseBackgroundDraft {
  image: ImageRef | File
  mode: ProseBackgroundMode
  color: string
}

interface ProseBackgroundModalProps {
  game: string
  value: ProseBackground
  onSave: (draft: ProseBackgroundDraft) => Promise<void>
  /** Po změně knihovny (nahrazení / smazání obrázku) – rodič znovu načte scény a text */
  onLibraryChanged?: () => void | Promise<void>
  onClose: () => void
}

/**
 * Dialog pozadí stránky prózy: obrázek (soubor, URL, nebo z knihovny kampaně), způsob vykreslení
 * (dlaždice v původní velikosti / originál / roztažení na šířku či výšku se zachováním poměru stran)
 * a barva podkladu. Náhled ukazuje výsledek v poměru stránky.
 */
export default function ProseBackgroundModal({ game, value, onSave, onLibraryChanged, onClose }: ProseBackgroundModalProps) {
  const version = useAssetVersion()
  const [image, setImage] = useState<ImageRef | File>(value.image)
  const [mode, setMode] = useState<ProseBackgroundMode>(value.mode)
  const [color, setColor] = useState(value.color)
  const [url, setUrl] = useState('')
  const [libraryOpen, setLibraryOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement | null>(null)

  // Náhled nového souboru přes object URL (uvolnit při změně)
  const [filePreview, setFilePreview] = useState<string | null>(null)
  useEffect(() => {
    if (!(image instanceof File)) { setFilePreview(null); return }
    const objectUrl = URL.createObjectURL(image)
    setFilePreview(objectUrl)
    return () => URL.revokeObjectURL(objectUrl)
  }, [image])

  const previewUrl = image instanceof File ? filePreview : image ? assetUrl(game, image, version) : null

  const applyUrl = () => {
    const trimmed = url.trim()
    if (!/^https?:\/\//i.test(trimmed)) { setError('Zadej URL obrázku začínající http(s)://'); return }
    setImage(trimmed)
    setUrl('')
    setError(null)
  }

  const handleSave = async () => {
    setSaving(true)
    setError(null)
    try {
      await onSave({ image, mode, color })
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Uložení pozadí selhalo.')
    } finally {
      setSaving(false)
    }
  }

  const button = 'px-3 h-8 rounded-md text-sm border border-white/15 hover:border-cyan-400/60 hover:bg-white/10 disabled:opacity-40 disabled:cursor-not-allowed'

  return (
    <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4" onClick={() => { if (!saving) onClose() }}>
      <div
        className="bg-[#111] border-2 border-cyan-500/60 rounded-xl p-6 w-[860px] max-w-full max-h-full overflow-y-auto flex flex-col gap-4"
        onClick={e => e.stopPropagation()}
      >
        <h2 className="text-xl font-bold text-cyan-300">🖼 Pozadí stránky</h2>
        <p className="text-sm text-[var(--text)] opacity-80">
          Pozadí je buď opakující se textura v původní velikosti, nebo velký obrázek roztažený na šířku či výšku stránky
          (poměr stran se vždy zachová, přesah se ořízne). Pod obrázkem – a bez obrázku – se zobrazí barva podkladu.
        </p>

        <div className="flex flex-col sm:flex-row gap-5">
          {/* Náhled v poměru stránky */}
          <div className="sm:w-80 flex-shrink-0 flex flex-col gap-2">
            <div className="text-sm">Náhled</div>
            <div className="w-full aspect-[3/4] rounded-lg border border-white/15 overflow-hidden" style={proseBackgroundStyle({ image: previewUrl ? 'x' : null, mode, color }, previewUrl)}>
              <div className="h-full flex items-end justify-center p-3">
                <span className="text-xs px-2 py-1 rounded bg-black/60 text-white/80">{image ? (image instanceof File ? image.name : image.split('/').pop()) : 'bez obrázku'}</span>
              </div>
            </div>
          </div>

          <div className="flex-1 flex flex-col gap-4">
            {/* Obrázek */}
            <div className="flex flex-col gap-2">
              <div className="text-sm">Obrázek</div>
              <div className="flex flex-wrap gap-2">
                <button type="button" onClick={() => fileRef.current?.click()} className={button}>📁 Ze souboru</button>
                <button type="button" onClick={() => setLibraryOpen(true)} className={button}>🗂 Z knihovny</button>
                {image && <button type="button" onClick={() => setImage(null)} className={`${button} hover:border-red-400/60 hover:bg-red-500/20`}>✕ Bez obrázku</button>}
              </div>
              <div className="flex gap-2">
                <input
                  type="url"
                  value={url}
                  onChange={e => setUrl(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); applyUrl() } }}
                  placeholder="…nebo URL obrázku"
                  className={`${inputClass} flex-1`}
                />
                <button type="button" disabled={!url.trim()} onClick={applyUrl} className={button}>Použít</button>
              </div>
              <input
                ref={fileRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={e => {
                  const file = e.target.files?.[0]
                  e.target.value = ''
                  if (file) { setImage(file); setError(null) }
                }}
              />
            </div>

            {/* Režim */}
            <div className="flex flex-col gap-2">
              <div className="text-sm">Způsob vykreslení</div>
              <div className="grid grid-cols-2 gap-1.5">
                {PROSE_BACKGROUND_MODES.map(m => (
                  <label
                    key={m.value}
                    title={m.hint}
                    className={`flex items-start gap-2 px-2.5 py-1.5 rounded-md border cursor-pointer text-sm ${
                      mode === m.value ? 'border-cyan-400 bg-cyan-700/30' : 'border-white/15 hover:border-white/30'
                    }`}
                  >
                    <input type="radio" name="prose-bg-mode" value={m.value} checked={mode === m.value} onChange={() => setMode(m.value)} className="mt-1" />
                    <span className="flex flex-col">
                      <span>{m.label}</span>
                      <span className="text-xs opacity-60 leading-tight">{m.hint}</span>
                    </span>
                  </label>
                ))}
              </div>
            </div>

            {/* Barva podkladu */}
            <div className="flex flex-col gap-2">
              <div className="text-sm">Barva podkladu</div>
              <ColorField
                value={color}
                onChange={setColor}
                swatches={[
                  [PROSE_BACKGROUND_DARK_COLOR, 'Tmavý podklad (výchozí)'],
                  [PROSE_BACKGROUND_LIGHT_COLOR, 'Světlý podklad (papír)'],
                  ['#000000', 'Černá'],
                  ['#ffffff', 'Bílá'],
                ]}
              />
            </div>
          </div>
        </div>

        {error && <div className="text-sm text-red-300">{error}</div>}

        <div className="flex gap-2 justify-end">
          <button type="button" disabled={saving} onClick={onClose} className={button}>Zrušit</button>
          <button type="button" disabled={saving} onClick={() => void handleSave()} className={`${button} border-cyan-400 bg-cyan-700/50 text-cyan-50 font-semibold`}>
            {saving ? 'Ukládám…' : 'Uložit pozadí'}
          </button>
        </div>
      </div>

      {libraryOpen && (
        <ProseImageLibraryModal
          game={game}
          title="Vyber obrázek pozadí"
          onSelect={path => { setImage(path); setLibraryOpen(false); setError(null) }}
          onChanged={onLibraryChanged}
          onClose={() => setLibraryOpen(false)}
        />
      )}
    </div>
  )
}
