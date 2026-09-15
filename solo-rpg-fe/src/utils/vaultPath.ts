import { useSyncExternalStore } from 'react'

/**
 * Cesta ke složce s hrami (vault) uložená v prohlížeči. Posílá se s každým požadavkem na BE,
 * který podle ní přepíná otevřenou složku. Bez uložené cesty se při startu zobrazí výběr složky.
 */
const STORAGE_KEY = 'solo-rpg:vault-path'

let current: string | null = readStored()
const listeners = new Set<() => void>()

function readStored(): string | null {
  try {
    const value = window.localStorage.getItem(STORAGE_KEY)
    return value && value.trim() ? value.trim() : null
  } catch {
    return null
  }
}

export function getVaultPath(): string | null {
  return current
}

export function setStoredVaultPath(path: string | null): void {
  const value = path?.trim() || null
  current = value
  try {
    if (value) window.localStorage.setItem(STORAGE_KEY, value)
    else window.localStorage.removeItem(STORAGE_KEY)
  } catch {
    // localStorage nedostupný – cesta platí jen do obnovení stránky
  }
  listeners.forEach(listener => listener())
}

/** React hook – aktuálně uložená cesta ke složce s hrami (null = ještě nevybráno). */
export function useVaultPath(): string | null {
  return useSyncExternalStore(
    listener => {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    () => current
  )
}
