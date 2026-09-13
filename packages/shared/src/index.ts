import { z } from 'zod'

/**
 * Odkaz na obrázek:
 *  - cesta relativní ke složce hry ve vaultu (např. `portraits/Aria.png`)
 *  - nebo vzdálená http(s) URL
 *  - null = žádný obrázek
 */
export const ImageRefSchema = z.string().min(1).nullable()
export type ImageRef = z.infer<typeof ImageRefSchema>

/**
 * Postava (PC i NPC – zatím nerozlišujeme). Soubor ve vaultu: `characters/<Celé jméno>.md`,
 * portrét `portraits/<Celé jméno>.<ext>`. Ve scénách se používá `**[[Celé jméno|nickname]]**:`.
 */
export const CharacterSchema = z.object({
  id: z.string().min(1),
  /** Celé jméno = `firstName lastName` (identita postavy, název souboru) */
  name: z.string().min(1),
  firstName: z.string().min(1),
  lastName: z.string(),
  /** Zobrazované jméno (v pásu postav, u replik) */
  nickname: z.string().min(1),
  image: ImageRefSchema,
  /** Volný markdown – tělo souboru postavy */
  notes: z.string(),
})
export type Character = z.infer<typeof CharacterSchema>

/** Vstup pro vytvoření/úpravu postavy */
export const CharacterInputSchema = z.object({
  firstName: z.string().trim().min(1).max(100),
  lastName: z.string().trim().max(100),
  nickname: z.string().trim().min(1).max(100),
  image: ImageRefSchema.optional(),
  notes: z.string().optional(),
})
export type CharacterInput = z.infer<typeof CharacterInputSchema>

/** Celé jméno postavy z křestního jména a příjmení */
export function fullName(firstName: string, lastName: string): string {
  return `${firstName.trim()} ${lastName.trim()}`.trim()
}

export const DmSchema = z.object({
  name: z.string().min(1),
  image: ImageRefSchema,
})
export type Dm = z.infer<typeof DmSchema>

/** Nastavení hry bez postav (postavy mají vlastní CRUD endpointy) */
export const GameSettingsSchema = z.object({
  backgroundImage: ImageRefSchema,
  brightBackground: z.boolean(),
  dm: DmSchema,
})
export type GameSettings = z.infer<typeof GameSettingsSchema>

export const GameSetupSchema = GameSettingsSchema.extend({
  characters: z.array(CharacterSchema),
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
  /** Markdown popis scény (tělo souboru před značkou `<!-- entries -->`) */
  description: z.string(),
  /** Obrázek scény – pozadí při jejím přehrávání (`backgrounds/<Název scény>.<ext>`) */
  image: ImageRefSchema,
  /** Celá jména postav přítomných ve scéně (frontmatter `characters` jako wikilinky) */
  characters: z.array(z.string()),
  createdAt: z.number(),
  updatedAt: z.number(),
})
export type SceneMeta = z.infer<typeof SceneMetaSchema>

/** Vstup pro vytvoření/úpravu scény; `characters` undefined při vytvoření = převzít z poslední scény */
export const SceneInputSchema = z.object({
  title: z.string().trim().min(1).max(100),
  description: z.string().optional(),
  image: ImageRefSchema.optional(),
  characters: z.array(z.string().trim().min(1)).optional(),
})
export type SceneInput = z.infer<typeof SceneInputSchema>

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

export const CreateSceneRequestSchema = SceneInputSchema
export type CreateSceneRequest = SceneInput

export const AssetKindSchema = z.enum(['portrait', 'background', 'dm', 'scene'])
export type AssetKind = z.infer<typeof AssetKindSchema>

export const AssetFromUrlRequestSchema = z.object({
  kind: AssetKindSchema,
  url: z.url(),
  /** Celé jméno postavy (kind = portrait) nebo název scény (kind = scene) – určuje název souboru */
  ownerName: z.string().optional(),
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
