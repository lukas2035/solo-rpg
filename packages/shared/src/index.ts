import { z } from 'zod'

/**
 * Odkaz na obrázek:
 *  - cesta relativní ke složce hry ve vaultu (např. `portraits/Aria.png`)
 *  - nebo vzdálená http(s) URL
 *  - null = žádný obrázek
 */
export const ImageRefSchema = z.string().min(1).nullable()
export type ImageRef = z.infer<typeof ImageRefSchema>

export const CharacterSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  image: ImageRefSchema,
})
export type Character = z.infer<typeof CharacterSchema>

export const DmSchema = z.object({
  name: z.string().min(1),
  image: ImageRefSchema,
})
export type Dm = z.infer<typeof DmSchema>

export const GameSetupSchema = z.object({
  characters: z.array(CharacterSchema),
  backgroundImage: ImageRefSchema,
  brightBackground: z.boolean(),
  dm: DmSchema,
})
export type GameSetup = z.infer<typeof GameSetupSchema>

export const GameMetaSchema = z.object({
  name: z.string().min(1),
  createdAt: z.number(),
  updatedAt: z.number(),
})
export type GameMeta = z.infer<typeof GameMetaSchema>

export const SceneMetaSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  order: z.number().int().nonnegative(),
  createdAt: z.number(),
  updatedAt: z.number(),
})
export type SceneMeta = z.infer<typeof SceneMetaSchema>

export const StoryEntrySchema = z.object({
  id: z.string().min(1),
  /** null = vypravěč (DM) */
  characterName: z.string().nullable(),
  text: z.string(),
  timestamp: z.number(),
  /** Text je víceřádkový markdown */
  markdown: z.boolean().optional(),
})
export type StoryEntry = z.infer<typeof StoryEntrySchema>

export const GameDetailSchema = z.object({
  meta: GameMetaSchema,
  setup: GameSetupSchema,
  scenes: z.array(SceneMetaSchema),
})
export type GameDetail = z.infer<typeof GameDetailSchema>

// --- API request DTO ---

export const CreateGameRequestSchema = z.object({ name: z.string().trim().min(1).max(100) })
export type CreateGameRequest = z.infer<typeof CreateGameRequestSchema>

export const RenameGameRequestSchema = z.object({ name: z.string().trim().min(1).max(100) })
export type RenameGameRequest = z.infer<typeof RenameGameRequestSchema>

export const CreateSceneRequestSchema = z.object({ title: z.string().trim().min(1).max(100) })
export type CreateSceneRequest = z.infer<typeof CreateSceneRequestSchema>

export const AssetKindSchema = z.enum(['portrait', 'background', 'dm'])
export type AssetKind = z.infer<typeof AssetKindSchema>

export const AssetFromUrlRequestSchema = z.object({
  kind: AssetKindSchema,
  url: z.url(),
  /** Jméno postavy – pouze pro kind = portrait */
  characterName: z.string().optional(),
})
export type AssetFromUrlRequest = z.infer<typeof AssetFromUrlRequestSchema>

export const AssetResponseSchema = z.object({ path: z.string().min(1) })
export type AssetResponse = z.infer<typeof AssetResponseSchema>

export const ApiErrorSchema = z.object({ error: z.string() })
export type ApiError = z.infer<typeof ApiErrorSchema>

/** Znaky, které nesmí být v názvu hry (název = složka ve vaultu). */
export const INVALID_GAME_NAME_CHARS = /[\\/:*?"<>|#^[\]]/

export function isValidGameName(name: string): boolean {
  const trimmed = name.trim()
  return trimmed.length > 0 && trimmed.length <= 100 && !INVALID_GAME_NAME_CHARS.test(trimmed) && !trimmed.startsWith('.')
}

/** Je odkaz na obrázek vzdálená URL (nikoli soubor ve vaultu)? */
export function isRemoteImage(ref: string): boolean {
  return /^(https?:|data:)/i.test(ref)
}
