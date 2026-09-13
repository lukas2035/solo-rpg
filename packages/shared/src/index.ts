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

/**
 * Vypravěč (narrator) – nezávislý na pravidlech (D&D, VtM, Fate…). Soubor ve vaultu: `narrators/<Jméno>.md`,
 * portrét `portraits/narrators/<Jméno>.<ext>`. Ve scénách se používá `**[[Jméno]]**:`.
 * Do budoucna může být napojený na AI (OpenRouter) a řídit hru.
 */
export const NarratorSchema = z.object({
  id: z.string().min(1),
  /** Jméno = identita vypravěče, název souboru */
  name: z.string().min(1),
  /** Volný markdown popis – tělo souboru vypravěče */
  description: z.string(),
  image: ImageRefSchema,
})
export type Narrator = z.infer<typeof NarratorSchema>

/** Vstup pro vytvoření/úpravu vypravěče */
export const NarratorInputSchema = z.object({
  name: z.string().trim().min(1).max(100),
  description: z.string().optional(),
  image: ImageRefSchema.optional(),
})
export type NarratorInput = z.infer<typeof NarratorInputSchema>

/** Nastavení hry bez postav a vypravěčů (ti mají vlastní CRUD endpointy) */
export const GameSettingsSchema = z.object({
  backgroundImage: ImageRefSchema,
  brightBackground: z.boolean(),
  /** Jméno aktuálního vypravěče; null = žádný (nová hra vypravěče nemá, uživatel ho musí vytvořit) */
  narrator: z.string().nullable(),
})
export type GameSettings = z.infer<typeof GameSettingsSchema>

export const GameSetupSchema = GameSettingsSchema.extend({
  characters: z.array(CharacterSchema),
  narrators: z.array(NarratorSchema),
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

/**
 * Thread = otevřená dějová nit kampaně (komplikace, hrozba, záhada, příležitost, závazek, vztah).
 * Soubor ve vaultu: `threads/<Název>.md` – frontmatter = strukturovaná pole, tělo = markdown popis.
 * Vazby na postavy a scénu vzniku jsou wikilinky (jako u scén); zpětné vazby se dopočítávají.
 * Hodnoty výčtů jsou stabilní klíče (v UI se překládají), nezávislé na pravidlech hry.
 */
export const ThreadTypeSchema = z.enum(['complication', 'threat', 'mystery', 'opportunity', 'obligation', 'relationship'])
export type ThreadType = z.infer<typeof ThreadTypeSchema>

export const ThreadStatusSchema = z.enum(['latent', 'active', 'escalated', 'resolved', 'expired'])
export type ThreadStatus = z.infer<typeof ThreadStatusSchema>
/** Stavy, ve kterých nit stále „visí nad kampaní“ */
export const OPEN_THREAD_STATUSES: readonly ThreadStatus[] = ['latent', 'active', 'escalated']

export const ThreadHorizonSchema = z.enum(['immediate', 'short-term', 'long-term'])
export type ThreadHorizon = z.infer<typeof ThreadHorizonSchema>

export const ThreadCertaintySchema = z.enum(['confirmed', 'unresolved'])
export type ThreadCertainty = z.infer<typeof ThreadCertaintySchema>

/** Ručně spravované hodiny postupu/eskalace; `current` v rozsahu 0..max */
export const ThreadClockSchema = z
  .object({
    current: z.number().int().nonnegative(),
    max: z.number().int().min(1).max(24),
  })
  .refine(c => c.current <= c.max, { message: 'Hodnota hodin nesmí přesáhnout maximum.' })
export type ThreadClock = z.infer<typeof ThreadClockSchema>

export const StoryThreadSchema = z.object({
  id: z.string().min(1),
  /** Název = identita nitě, název souboru */
  title: z.string().min(1),
  type: ThreadTypeSchema,
  status: ThreadStatusSchema,
  horizon: ThreadHorizonSchema,
  certainty: ThreadCertaintySchema,
  /** Situace, při které má smysl vyhodnotit nejistotu (jen popis, nic neautomatizuje) */
  revealCondition: z.string(),
  /** null = hodiny vypnuté */
  clock: ThreadClockSchema.nullable(),
  /** Celá jména propojených postav (frontmatter `characters` jako wikilinky) */
  characters: z.array(z.string()),
  /** Název scény, ve které nit vznikla (frontmatter `scene` jako wikilink); null = neuvedeno */
  scene: z.string().nullable(),
  /** Názvy frakcí, kterých se nit týká (frontmatter `factions` jako wikilinky) */
  factions: z.array(z.string()),
  /** Markdown popis – tělo souboru */
  description: z.string(),
  createdAt: z.number(),
  updatedAt: z.number(),
})
export type StoryThread = z.infer<typeof StoryThreadSchema>

/** Vstup pro vytvoření/úpravu nitě; nevyplněná pole při úpravě zůstávají beze změny */
export const ThreadInputSchema = z.object({
  title: z.string().trim().min(1).max(100),
  type: ThreadTypeSchema,
  status: ThreadStatusSchema.optional(),
  horizon: ThreadHorizonSchema.optional(),
  certainty: ThreadCertaintySchema.optional(),
  revealCondition: z.string().optional(),
  clock: ThreadClockSchema.nullable().optional(),
  characters: z.array(z.string().trim().min(1)).optional(),
  scene: z.string().trim().min(1).nullable().optional(),
  factions: z.array(z.string().trim().min(1)).optional(),
  description: z.string().optional(),
})
export type ThreadInput = z.infer<typeof ThreadInputSchema>

/**
 * Faction = organizovaná skupina ve světě kampaně (stát, cech, kult, gang…).
 * Soubor `factions/<Název>.md`; vazby jsou wikilinky podle názvu, podfrakce a související nitě se dopočítávají.
 */
export const FactionTypeSchema = z.enum(['political', 'military', 'religious', 'criminal', 'commercial', 'clan', 'secret', 'supernatural', 'other'])
export type FactionType = z.infer<typeof FactionTypeSchema>

export const FactionStatusSchema = z.enum(['active', 'dormant', 'disbanded', 'destroyed', 'unknown'])
export type FactionStatus = z.infer<typeof FactionStatusSchema>

/** Postoj – k družině (`stance`) i mezi frakcemi (`relations[].stance`), jeden společný výčet */
export const FactionStanceSchema = z.enum(['allied', 'friendly', 'neutral', 'tense', 'hostile', 'unknown'])
export type FactionStance = z.infer<typeof FactionStanceSchema>

/** Vztah k jiné frakci; uložený jen u frakce, kde vznikl (druhá strana ho vidí jako příchozí) */
export const FactionRelationSchema = z.object({
  /** Název cílové frakce (frontmatter jako wikilink) */
  faction: z.string().min(1),
  stance: FactionStanceSchema,
  note: z.string(),
})
export type FactionRelation = z.infer<typeof FactionRelationSchema>

export const FactionSchema = z.object({
  id: z.string().min(1),
  /** Název = identita frakce, název souboru */
  title: z.string().min(1),
  type: FactionTypeSchema,
  status: FactionStatusSchema,
  /** Postoj vůči protagonistům */
  stance: FactionStanceSchema,
  /** Celé jméno vůdce (wikilink), null = neznámý / kolektivní */
  leader: z.string().nullable(),
  /** Název nadřazené frakce (wikilink), null = žádná */
  parentFaction: z.string().nullable(),
  /** Obecné cíle organizace (prosté texty, v pořadí) */
  goals: z.array(z.string()),
  /** Celá jména důležitých postav (členové i jiné) */
  characters: z.array(z.string()),
  relations: z.array(FactionRelationSchema),
  emblem: ImageRefSchema,
  /** Markdown popis – tělo souboru před značkou `<!-- secrets -->` */
  description: z.string(),
  /** Tajemství (pravda kampaně, kterou protagonisté nemusí znát) – tělo za značkou */
  secrets: z.string(),
  createdAt: z.number(),
  updatedAt: z.number(),
})
export type Faction = z.infer<typeof FactionSchema>

export const FactionRelationInputSchema = z.object({
  faction: z.string().trim().min(1),
  stance: FactionStanceSchema,
  note: z.string().optional(),
})

/** Vstup pro vytvoření/úpravu frakce; nevyplněná pole při úpravě zůstávají beze změny (`emblem: null` = odebrat) */
export const FactionInputSchema = z.object({
  title: z.string().trim().min(1).max(100),
  type: FactionTypeSchema,
  status: FactionStatusSchema.optional(),
  stance: FactionStanceSchema.optional(),
  leader: z.string().trim().min(1).nullable().optional(),
  parentFaction: z.string().trim().min(1).nullable().optional(),
  goals: z.array(z.string().max(300)).max(50).optional(),
  characters: z.array(z.string().trim().min(1)).optional(),
  relations: z.array(FactionRelationInputSchema).max(50).optional(),
  emblem: ImageRefSchema.optional(),
  description: z.string().optional(),
  secrets: z.string().optional(),
})
export type FactionInput = z.infer<typeof FactionInputSchema>

export const StoryEntrySchema = z.object({
  id: z.string().min(1),
  /** null = vypravěč */
  characterName: z.string().nullable(),
  /** Jméno vypravěče (jen u záznamů vypravěče); null/undefined = neznámý vypravěč (starý zápis) */
  narratorName: z.string().nullable().optional(),
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
  threads: z.array(StoryThreadSchema),
  factions: z.array(FactionSchema),
})
export type GameDetail = z.infer<typeof GameDetailSchema>

// --- API request DTO ---

export const CreateGameRequestSchema = z.object({ name: z.string().trim().min(1).max(100) })
export type CreateGameRequest = z.infer<typeof CreateGameRequestSchema>

export const RenameGameRequestSchema = z.object({ name: z.string().trim().min(1).max(100) })
export type RenameGameRequest = z.infer<typeof RenameGameRequestSchema>

export const CreateSceneRequestSchema = SceneInputSchema
export type CreateSceneRequest = SceneInput

export const AssetKindSchema = z.enum(['portrait', 'background', 'narrator', 'scene', 'faction'])
export type AssetKind = z.infer<typeof AssetKindSchema>

export const AssetFromUrlRequestSchema = z.object({
  kind: AssetKindSchema,
  url: z.url(),
  /** Celé jméno postavy (portrait), jméno vypravěče (narrator) nebo název scény (scene) – určuje název souboru */
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
