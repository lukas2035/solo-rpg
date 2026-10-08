/**
 * Deterministický generátor (mulberry32) – stejný seed dá stejnou posloupnost, takže brief jde reprodukovat
 * a testovat. Director nikdy nepoužívá `Math.random` přímo; seed se losuje jen při „přehodit“.
 */
export interface Rng {
  /** Rovnoměrně z [0, 1) */
  next(): number
  /** Celé číslo z [0, maxExclusive) */
  int(maxExclusive: number): number
  pick<T>(items: readonly T[]): T
}

export function createRng(seed: number): Rng {
  let a = seed >>> 0
  const next = (): number => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
  return {
    next,
    int: max => Math.floor(next() * max),
    pick: items => {
      if (items.length === 0) throw new Error('Nelze losovat z prázdného seznamu.')
      return items[Math.floor(next() * items.length)]!
    },
  }
}

/** Náhodný seed pro „přehodit“ (32bit, aby šel uložit do JSON bez ztráty) */
export function randomSeed(): number {
  return Math.floor(Math.random() * 0x7fffffff)
}

/** Vážený los: klíč s váhou 0 nemůže padnout; všechny nulové → první klíč */
export function weightedPick<K extends string>(rng: Rng, weights: Readonly<Record<K, number>>): K {
  const entries = (Object.entries(weights) as [K, number][]).filter(([, w]) => w > 0)
  const total = entries.reduce((sum, [, w]) => sum + w, 0)
  if (total <= 0) return Object.keys(weights)[0] as K
  let roll = rng.next() * total
  for (const [key, w] of entries) {
    roll -= w
    if (roll < 0) return key
  }
  return entries[entries.length - 1]![0]
}
