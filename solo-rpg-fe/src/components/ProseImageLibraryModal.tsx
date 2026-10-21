import { useCallback, useEffect, useRef, useState } from 'react'
import type { ImageRef, ProseImage } from '@solo-rpg/shared'
import { assetUrl, deleteProseImage, listProseImages, replaceProseImage, useAssetVersion } from '../utils/api'

interface ProseImageLibraryModalProps {
  game: string
  /** Volitelný nadpis (např. „Vyber obrázek pozadí“) */
  title?: string
  /** Výběr obrázku: dialog nabídne tlačítko „Vybrat“ a po výběru se zavře */
  onSelect?: (path: ImageRef) => void
  /** Volá se po nahrazení / smazání obrázku – rodič si znovu načte scény a text (odkazy se mohly změnit) */
  onChanged?: () => void | Promise<void>
  onClose: () => void
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} kB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

/**
 * Knihovna obrázků prózy (per kampaň): zmenšeniny všech obrázků z textů a pozadí prózových scén.
 * Umožňuje obrázek vybrat (vložení do textu / pozadí), nahradit jiným souborem (odkazy v kampani se přepíší)
 * nebo smazat – s varováním, kolikrát na něj kampaň odkazuje (odkazy se smažou spolu s ním).
 */
export default function ProseImageLibraryModal({ game, title, onSelect, onChanged, onClose }: ProseImageLibraryModalProps) {
  const version = useAssetVersion()
  const [images, setImages] = useState<ProseImage[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [selected, setSelected] = useState<string | null>(null)
  const replaceRef = useRef<HTMLInputElement | null>(null)
  const replacingRef = useRef<string | null>(null)

  const reload = useCallback(async () => {
    try {
      setImages(await listProseImages(game))
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Načtení knihovny selhalo.')
    }
  }, [game])

  useEffect(() => { void reload() }, [reload])

  const handleReplaceFile = async (file: File) => {
    const path = replacingRef.current
    replacingRef.current = null
    if (!path) return
    setBusy(path)
    try {
      await replaceProseImage(game, path, file)
      await reload()
      await onChanged?.()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Nahrazení obrázku selhalo.')
    } finally {
      setBusy(null)
    }
  }

  const handleDelete = async (image: ProseImage) => {
    const warning = image.usage > 0
      ? `Na obrázek „${image.name}“ odkazuje text kampaně ${image.usage}× (obrázky v textu a pozadí scén). Smazáním se všechny tyto odkazy odstraní.\n\nOpravdu smazat?`
      : `Opravdu smazat obrázek „${image.name}“ z knihovny?`
    if (!window.confirm(warning)) return
    setBusy(image.path)
    try {
      await deleteProseImage(game, image.path)
      if (selected === image.path) setSelected(null)
      await reload()
      await onChanged?.()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Smazání obrázku selhalo.')
    } finally {
      setBusy(null)
    }
  }

  const smallButton = 'px-2 h-7 rounded-md text-xs border border-white/15 hover:border-cyan-400/60 hover:bg-white/10 disabled:opacity-40 disabled:cursor-not-allowed'

  return (
    <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4" onClick={e => { e.stopPropagation(); if (!busy) onClose() }}>
      <div
        className="bg-[#111] border-2 border-cyan-500/60 rounded-xl p-6 w-[900px] max-w-full max-h-full overflow-hidden flex flex-col gap-4"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center gap-3">
          <h2 className="text-xl font-bold text-cyan-300">🗂 {title ?? 'Knihovna obrázků'}</h2>
          <span className="text-xs opacity-60">{images ? `${images.length} obrázků` : ''}</span>
          <button type="button" onClick={onClose} className="ml-auto px-3 h-8 rounded-md border border-white/15 hover:bg-white/10 text-sm">Zavřít</button>
        </div>
        <p className="text-sm text-[var(--text)] opacity-80">
          Všechny obrázky prózy v této kampani – ilustrace v textech i pozadí scén. Nahrazení přepíše obrázek všude, kde se používá;
          smazání odstraní i odkazy na něj z textů.
        </p>
        {error && <div className="text-sm text-red-300">{error}</div>}

        <div className="flex-1 min-h-0 overflow-y-auto">
          {images === null ? (
            <div className="text-sm opacity-60 py-8 text-center">Načítám…</div>
          ) : images.length === 0 ? (
            <div className="text-sm opacity-60 py-8 text-center">Knihovna je prázdná – obrázky se do ní přidávají vložením do textu nebo nastavením pozadí scény.</div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
              {images.map(img => {
                const url = assetUrl(game, img.path, version)
                const isSelected = selected === img.path
                const isBusy = busy === img.path
                return (
                  <div
                    key={img.path}
                    className={`flex flex-col rounded-lg border overflow-hidden bg-white/5 cursor-pointer transition-colors ${
                      isSelected ? 'border-cyan-400 ring-1 ring-cyan-400/60' : 'border-white/10 hover:border-white/30'
                    }`}
                    onClick={() => setSelected(img.path)}
                    onDoubleClick={() => onSelect?.(img.path)}
                    title={onSelect ? 'Dvojklik = vybrat' : undefined}
                  >
                    <div className="aspect-square bg-black/40 flex items-center justify-center overflow-hidden">
                      {url ? <img src={url} alt={img.name} className="w-full h-full object-contain" draggable={false} /> : <span className="text-xs opacity-60">?</span>}
                    </div>
                    <div className="p-2 flex flex-col gap-1 text-xs">
                      <div className="truncate" title={img.name}>{img.name}</div>
                      <div className="flex items-center gap-2 opacity-60">
                        <span>{formatSize(img.size)}</span>
                        <span className={img.usage === 0 ? 'text-amber-300' : ''} title="Kolikrát na obrázek odkazuje text nebo pozadí scény">
                          {img.usage === 0 ? 'nepoužitý' : `${img.usage}× v textu`}
                        </span>
                      </div>
                      <div className="flex gap-1 mt-1">
                        {onSelect && (
                          <button type="button" disabled={isBusy} onClick={e => { e.stopPropagation(); onSelect(img.path) }} className={`${smallButton} text-cyan-300 flex-1`}>
                            Vybrat
                          </button>
                        )}
                        <button
                          type="button"
                          title="Nahradit jiným souborem (všude v kampani)"
                          disabled={isBusy}
                          onClick={e => { e.stopPropagation(); replacingRef.current = img.path; replaceRef.current?.click() }}
                          className={smallButton}
                        >
                          🔁
                        </button>
                        <button
                          type="button"
                          title="Smazat z knihovny i z textů"
                          disabled={isBusy}
                          onClick={e => { e.stopPropagation(); void handleDelete(img) }}
                          className={`${smallButton} hover:bg-red-500/30 hover:border-red-400/60`}
                        >
                          🗑
                        </button>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        <input
          ref={replaceRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={e => {
            const file = e.target.files?.[0]
            e.target.value = ''
            if (file) void handleReplaceFile(file)
          }}
        />
      </div>
    </div>
  )
}
