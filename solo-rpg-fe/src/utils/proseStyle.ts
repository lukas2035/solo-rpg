import type { CSSProperties } from 'react'
import type { ProseBackground, ProseBackgroundMode, ProseFont } from '@solo-rpg/shared'

/** Popisky režimů pozadí prózy (dialog pozadí) */
export const PROSE_BACKGROUND_MODES: { value: ProseBackgroundMode; label: string; hint: string }[] = [
  { value: 'repeat', label: 'Dlaždice', hint: 'Původní velikost, opakuje se vodorovně i svisle (textura papíru apod.)' },
  { value: 'repeat-x', label: 'Opakovat vodorovně', hint: 'Původní velikost, opakuje se jen vodorovně' },
  { value: 'repeat-y', label: 'Opakovat svisle', hint: 'Původní velikost, opakuje se jen svisle' },
  { value: 'original', label: 'Originál', hint: 'Jednou, v původní velikosti, nahoře uprostřed' },
  { value: 'fit-width', label: 'Na šířku', hint: 'Roztažený na šířku stránky; poměr stran zůstane, přebývající výška se ořízne' },
  { value: 'fit-height', label: 'Na výšku', hint: 'Roztažený na výšku stránky; poměr stran zůstane, přebývající šířka se ořízne' },
]

/** CSS pro kontejner stránky podle pozadí; `imageUrl` = už přeložená URL obrázku (null = jen barva) */
export function proseBackgroundStyle(background: ProseBackground, imageUrl: string | null): CSSProperties {
  const style: CSSProperties = { backgroundColor: background.color }
  if (!imageUrl) return style
  style.backgroundImage = `url('${imageUrl}')`
  switch (background.mode) {
    case 'repeat':
    case 'repeat-x':
    case 'repeat-y':
      style.backgroundRepeat = background.mode
      style.backgroundSize = 'auto'
      style.backgroundPosition = 'left top'
      break
    case 'original':
      style.backgroundRepeat = 'no-repeat'
      style.backgroundSize = 'auto'
      style.backgroundPosition = 'center top'
      break
    case 'fit-width':
      style.backgroundRepeat = 'no-repeat'
      style.backgroundSize = '100% auto'
      style.backgroundPosition = 'center top'
      break
    case 'fit-height':
      style.backgroundRepeat = 'no-repeat'
      style.backgroundSize = 'auto 100%'
      style.backgroundPosition = 'center top'
      break
  }
  return style
}

/** CSS `text-shadow` z nastavení písma */
export function proseTextShadow(font: ProseFont): string | undefined {
  if (!font.shadow) return undefined
  return `${font.shadow.x}px ${font.shadow.y}px ${font.shadow.blur}px ${font.shadow.color}`
}

/** CSS proměnné a vlastnosti písma pro stránku prózy (`.prose-page` z nich odvozuje i tlumené barvy a linky) */
export function proseFontStyle(font: ProseFont): CSSProperties {
  return {
    ['--prose-fg' as string]: font.color,
    ['--prose-shadow' as string]: proseTextShadow(font) ?? 'none',
    color: font.color,
    fontFamily: font.family,
    fontSize: `${font.size}px`,
    textShadow: proseTextShadow(font),
  }
}
