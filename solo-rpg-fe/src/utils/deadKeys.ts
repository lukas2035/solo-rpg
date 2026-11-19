/**
 * Mrtvé klávesy české klávesnice pod AltGr+číslo: samostatný (mezerový) znak a odpovídající kombinující diakritika.
 * Stav mrtvé klávesy drží Windows, prohlížeč ho zrušit neumí – proto se po zkratce AltGr+číslo
 * následující vložený znak zpětně očistí právě od této diakritiky.
 */
const ALTGR_DEAD_KEYS: Record<string, { spacing: string; combining: string }> = {
  '1': { spacing: '~', combining: '\u0303' },
  '2': { spacing: 'ˇ', combining: '\u030C' },
  '3': { spacing: '^', combining: '\u0302' },
  '4': { spacing: '˘', combining: '\u0306' },
  '5': { spacing: '°', combining: '\u030A' },
  '6': { spacing: '˛', combining: '\u0328' },
  '7': { spacing: '`', combining: '\u0300' },
  '8': { spacing: '˙', combining: '\u0307' },
  '9': { spacing: '´', combining: '\u0301' },
  '0': { spacing: '˝', combining: '\u030B' },
}

/** Jak dlouho po zkratce AltGr+číslo čekat na znak, který mrtvá klávesa „nakazí“ */
export const ALTGR_CLEANUP_WINDOW_MS = 5000

/** Odstraní z vloženého textu první výskyt diakritiky mrtvé klávesy (samostatný znak i kombinaci s písmenem) */
export function stripDeadKey(text: string, digit: string): string {
  const dead = ALTGR_DEAD_KEYS[digit]
  if (!dead) return text
  if (text.startsWith(dead.spacing)) return text.slice(dead.spacing.length)
  const nfd = text.normalize('NFD')
  const i = nfd.indexOf(dead.combining)
  if (i === -1) return text
  return (nfd.slice(0, i) + nfd.slice(i + 1)).normalize('NFC')
}
