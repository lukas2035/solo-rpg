import { isValidGameName, INVALID_GAME_NAME_CHARS } from '@solo-rpg/shared'
import type { Character, ImageRef } from '@solo-rpg/shared'
import * as legacy from './legacyBrowserStorage'
import * as api from './api'

export interface LegacyImportResult {
  imported: { from: string; to: string }[]
  failed: { name: string; error: string }[]
}

/** Jsou v prohlížeči hry ze starší verze aplikace? */
export async function hasLegacyGames(): Promise<boolean> {
  try {
    return (await legacy.listGames()).length > 0
  } catch {
    return false
  }
}

async function storeLegacyImage(game: string, kind: 'portrait' | 'background' | 'dm', image: Blob | string | null, characterName?: string): Promise<ImageRef> {
  if (image === null) return null
  if (typeof image === 'string') return api.storeImage(game, kind, image, characterName)
  const ext = image.type.split('/')[1]?.replace('jpeg', 'jpg') || 'png'
  return api.uploadAsset(game, kind, image, `${characterName ?? kind}.${ext}`, characterName)
}

/** Najde volné jméno hry na serveru (přidává „(2)“, „(3)“…). */
async function freeGameName(name: string, existing: Set<string>): Promise<string> {
  let candidate = name.replace(INVALID_GAME_NAME_CHARS, '-').trim() || 'Importovaná hra'
  if (!isValidGameName(candidate)) candidate = 'Importovaná hra'
  const base = candidate
  let counter = 2
  while (existing.has(candidate)) {
    candidate = `${base} (${counter++})`
  }
  existing.add(candidate)
  return candidate
}

/**
 * Přenese všechny hry z IndexedDB do vaultu (přes API) a po úspěchu je
 * z prohlížeče smaže.
 */
export async function importLegacyGames(): Promise<LegacyImportResult> {
  const result: LegacyImportResult = { imported: [], failed: [] }
  const legacyGames = await legacy.listGames()
  const existing = new Set((await api.listGames()).map(g => g.name))

  for (const meta of legacyGames) {
    try {
      const [setup, story] = await Promise.all([legacy.loadSetup(meta.name), legacy.loadStory(meta.name)])
      const target = await freeGameName(meta.name, existing)
      const detail = await api.createGame(target)

      const characters: Character[] = []
      for (const c of setup?.characters ?? []) {
        characters.push({ id: c.id, name: c.name, image: await storeLegacyImage(target, 'portrait', c.image, c.name) })
      }
      // Postavy zmíněné v příběhu, které v nastavení chybí
      let nextId = Math.max(0, ...characters.map(c => parseInt(c.id) || 0)) + 1
      for (const entry of story ?? []) {
        if (entry.characterName !== null && !characters.some(c => c.name === entry.characterName)) {
          characters.push({ id: (nextId++).toString(), name: entry.characterName, image: null })
        }
      }

      await api.saveSetup(target, {
        characters,
        backgroundImage: await storeLegacyImage(target, 'background', setup?.backgroundImage ?? null),
        brightBackground: setup?.brightBackground ?? false,
        dm: {
          name: setup?.dm?.name ?? 'DM',
          image: await storeLegacyImage(target, 'dm', setup?.dm?.image ?? null),
        },
      })

      if (story && story.length > 0 && detail.scenes[0]) {
        await api.saveSceneEntries(target, detail.scenes[0].id, story)
      }

      await legacy.deleteGame(meta.name)
      result.imported.push({ from: meta.name, to: target })
    } catch (error) {
      result.failed.push({ name: meta.name, error: error instanceof Error ? error.message : String(error) })
    }
  }
  return result
}
