import { isValidGameName, INVALID_GAME_NAME_CHARS } from '@solo-rpg/shared'
import type { ImageRef } from '@solo-rpg/shared'
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
      await api.createGame(target)

      // Staré postavy měly jen jedno jméno → křestní jméno = nickname, příjmení prázdné
      const created = new Set<string>()
      const createCharacter = async (name: string, image: Blob | string | null) => {
        const trimmed = name.trim()
        if (!trimmed || created.has(trimmed)) return
        created.add(trimmed)
        const character = await api.createCharacter(target, { firstName: trimmed, lastName: '', nickname: trimmed, notes: '' })
        const ref = await storeLegacyImage(target, 'portrait', image, character.name)
        if (ref) await api.updateCharacter(target, character.id, { firstName: trimmed, lastName: '', nickname: trimmed, notes: '', image: ref })
      }
      for (const c of setup?.characters ?? []) {
        await createCharacter(c.name, c.image)
      }
      // Postavy zmíněné v příběhu, které v nastavení chybí
      for (const entry of story ?? []) {
        if (entry.characterName !== null) await createCharacter(entry.characterName, null)
      }

      await api.saveSetup(target, {
        backgroundImage: await storeLegacyImage(target, 'background', setup?.backgroundImage ?? null),
        brightBackground: setup?.brightBackground ?? false,
        dm: {
          name: setup?.dm?.name ?? 'DM',
          image: await storeLegacyImage(target, 'dm', setup?.dm?.image ?? null),
        },
      })

      if (story && story.length > 0) {
        const scene = await api.createScene(target, { title: 'Scéna 1', characters: [...created] })
        await api.saveSceneEntries(target, scene.id, story)
      }

      await legacy.deleteGame(meta.name)
      result.imported.push({ from: meta.name, to: target })
    } catch (error) {
      result.failed.push({ name: meta.name, error: error instanceof Error ? error.message : String(error) })
    }
  }
  return result
}
