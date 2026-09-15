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
  /** Volný markdown popis – tělo souboru vypravěče před značkou `<!-- ai-prompt -->` */
  description: z.string(),
  /** Doplňkový prompt pro AI (styl, pravidla tohoto vypravěče) – tělo za značkou `<!-- ai-prompt -->`; připojí se na konec požadavku */
  aiPrompt: z.string(),
  image: ImageRefSchema,
})
export type Narrator = z.infer<typeof NarratorSchema>

/** Vstup pro vytvoření/úpravu vypravěče */
export const NarratorInputSchema = z.object({
  name: z.string().trim().min(1).max(100),
  description: z.string().optional(),
  aiPrompt: z.string().optional(),
  image: ImageRefSchema.optional(),
})
export type NarratorInput = z.infer<typeof NarratorInputSchema>

/** Nastavení hry bez postav a vypravěčů (ti mají vlastní CRUD endpointy) */
export const GameSettingsSchema = z.object({
  backgroundImage: ImageRefSchema,
  brightBackground: z.boolean(),
  /** Jméno aktuálního vypravěče; null = žádný (nová hra vypravěče nemá, uživatel ho musí vytvořit) */
  narrator: z.string().nullable(),
  /** Popis herních pravidel běžících pod příběhem (VtM 5e, D&D 5e, Fate…; markdown, tělo `game.md` za `<!-- rules -->`); prázdné = bez pravidel */
  rules: z.string().max(20000),
  /** Posílat popis pravidel AI (vypravěč i shrnutí scény); frontmatter `rulesInAi` */
  rulesInAi: z.boolean(),
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
  /** Název lokace, kde se scéna odehrává (frontmatter `location` jako wikilink); null = neuvedeno */
  location: z.string().nullable(),
  /** AI vypravěč zapnutý pro tuto scénu (frontmatter `ai`) – po každém záznamu hráče odpoví aktuální vypravěč přes OpenRouter */
  ai: z.boolean(),
  /** Celá jména postav scény hraných AI (frontmatter `aiCharacters` jako wikilinky); ostatní postavy scény hraje hráč */
  aiCharacters: z.array(z.string()),
  /** Volitelný doplňující/shrnující popis situace jen pro AI (frontmatter `aiPrompt`); vloží se za popis scény */
  aiPrompt: z.string(),
  /** Celkové zhodnocení / shrnutí děje scény (markdown; tělo souboru za značkou `<!-- summary -->`) – rychlý kontext pro hráče i AI */
  summary: z.string(),
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
  location: z.string().trim().min(1).nullable().optional(),
  ai: z.boolean().optional(),
  aiCharacters: z.array(z.string().trim().min(1)).optional(),
  aiPrompt: z.string().max(5000).optional(),
  summary: z.string().max(20000).optional(),
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
  /** Názvy lokací, kterých se nit týká (frontmatter `locations` jako wikilinky) */
  locations: z.array(z.string()),
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
  locations: z.array(z.string().trim().min(1)).optional(),
  description: z.string().optional(),
})
export type ThreadInput = z.infer<typeof ThreadInputSchema>

/**
 * Faction = organizovaná skupina ve světě kampaně (stát, cech, kult, gang…).
 * Soubor `factions/<Název>.md`; vazby jsou wikilinky podle názvu, podfrakce a související nitě se dopočítávají.
 * Typ `group` = volná parta bez organizační struktury (kamarádi, sousedé); UI u ní skrývá vůdce, hierarchii, cíle a vztahy.
 */
export const FactionTypeSchema = z.enum(['political', 'military', 'religious', 'criminal', 'commercial', 'clan', 'secret', 'supernatural', 'group', 'other'])
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
  /** Názvy lokací – sídlo, území, působiště (wikilinky) */
  locations: z.array(z.string()),
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
  locations: z.array(z.string().trim().min(1)).optional(),
  relations: z.array(FactionRelationInputSchema).max(50).optional(),
  emblem: ImageRefSchema.optional(),
  description: z.string().optional(),
  secrets: z.string().optional(),
})
export type FactionInput = z.infer<typeof FactionInputSchema>

/**
 * Quest = konkrétní úkol / cíl, který postavy plní („co se snažíme udělat“); nit říká „co visí nad kampaní“.
 * Soubor `quests/<Název>.md`; vazby jsou wikilinky podle názvu, podřízené questy a zpětné vazby se dopočítávají.
 * Tělo = popis, za značkou `<!-- outcome -->` výsledek, za `<!-- notes -->` poznámky.
 */
export const QuestTypeSchema = z.enum(['main', 'side', 'personal', 'investigation', 'faction', 'exploration', 'survival'])
export type QuestType = z.infer<typeof QuestTypeSchema>

export const QuestStatusSchema = z.enum(['available', 'active', 'paused', 'completed', 'failed', 'abandoned'])
export type QuestStatus = z.infer<typeof QuestStatusSchema>
/** Stavy, ve kterých quest ještě „běží“ (není ukončený) */
export const OPEN_QUEST_STATUSES: readonly QuestStatus[] = ['available', 'active', 'paused']
/** Výchozí pořadí questů v přehledu */
export const QUEST_STATUS_ORDER: readonly QuestStatus[] = ['active', 'available', 'paused', 'completed', 'failed', 'abandoned']

export const ObjectiveStatusSchema = z.enum(['pending', 'active', 'completed', 'failed', 'skipped'])
export type ObjectiveStatus = z.infer<typeof ObjectiveStatusSchema>

/** Dílčí cíl questu; pořadí = pořadí v poli (nemusí se plnit postupně) */
export const QuestObjectiveSchema = z.object({
  /** Stabilní interní id (pro budoucí strukturované AI operace); generuje BE */
  id: z.string().min(1),
  title: z.string().min(1),
  status: ObjectiveStatusSchema,
  /** Volitelný cíl se nepočítá do progressu a nebrání dokončení */
  optional: z.boolean(),
})
export type QuestObjective = z.infer<typeof QuestObjectiveSchema>

export const QuestSchema = z.object({
  id: z.string().min(1),
  /** Název = identita questu, název souboru */
  title: z.string().min(1),
  type: QuestTypeSchema,
  status: QuestStatusSchema,
  objectives: z.array(QuestObjectiveSchema),
  /** Celé jméno zadavatele (wikilink), null = quest vznikl ze situace */
  questGiver: z.string().nullable(),
  /** Název nadřazeného questu (wikilink), null = samostatný */
  parentQuest: z.string().nullable(),
  /** Odměny – prosté texty nezávislé na pravidlech, v pořadí */
  rewards: z.array(z.string()),
  /** Celá jména souvisejících postav (wikilinky) */
  characters: z.array(z.string()),
  /** Názvy souvisejících dějových nití (wikilinky); nit může existovat i bez questu */
  threads: z.array(z.string()),
  /** Názvy souvisejících frakcí (wikilinky) */
  factions: z.array(z.string()),
  /** Názvy lokací, kde se quest odehrává (wikilinky) */
  locations: z.array(z.string()),
  /** Markdown popis – cíl questu, proč vznikl, co o něm postavy vědí */
  description: z.string(),
  /** Jak quest skutečně dopadl (hlavně u ukončených) */
  outcome: z.string(),
  /** Volné poznámky hráče */
  notes: z.string(),
  createdAt: z.number(),
  updatedAt: z.number(),
})
export type Quest = z.infer<typeof QuestSchema>

/** Vstup pro dílčí cíl; bez `id` = nový cíl (id přidělí BE) */
export const QuestObjectiveInputSchema = z.object({
  id: z.string().min(1).optional(),
  title: z.string().trim().min(1).max(300),
  status: ObjectiveStatusSchema.optional(),
  optional: z.boolean().optional(),
})
export type QuestObjectiveInput = z.infer<typeof QuestObjectiveInputSchema>

/** Vstup pro vytvoření/úpravu questu; nevyplněná pole při úpravě zůstávají beze změny */
export const QuestInputSchema = z.object({
  title: z.string().trim().min(1).max(100),
  type: QuestTypeSchema,
  status: QuestStatusSchema.optional(),
  objectives: z.array(QuestObjectiveInputSchema).max(100).optional(),
  questGiver: z.string().trim().min(1).nullable().optional(),
  parentQuest: z.string().trim().min(1).nullable().optional(),
  rewards: z.array(z.string().max(300)).max(50).optional(),
  characters: z.array(z.string().trim().min(1)).optional(),
  threads: z.array(z.string().trim().min(1)).optional(),
  factions: z.array(z.string().trim().min(1)).optional(),
  locations: z.array(z.string().trim().min(1)).optional(),
  description: z.string().optional(),
  outcome: z.string().optional(),
  notes: z.string().optional(),
})
export type QuestInput = z.infer<typeof QuestInputSchema>

/** Postup questu odvozený z povinných cílů (nikam se neukládá) */
export function questProgress(objectives: readonly QuestObjective[]): { done: number; total: number } {
  const required = objectives.filter(o => !o.optional)
  return { done: required.filter(o => o.status === 'completed').length, total: required.length }
}

/**
 * StoryLocation = fyzické místo ve světě kampaně (kontinent, město, budova, dungeon…), hierarchické přes `parentLocation`.
 * Soubor `locations/<Název>.md`; vazby na lokaci vlastní ostatní entity (nit, quest, frakce, scéna) jako wikilinky,
 * lokace sama drží jen rodiče. Podřízené lokace a zpětné vazby se dopočítávají.
 * Tělo = popis, za značkou `<!-- secrets -->` tajemství místa (pravda, kterou postavy nemusí znát).
 * Název `StoryLocation` (ne `Location`) kvůli kolizi s DOM typem `Location`.
 */
export const LocationTypeSchema = z.enum(['continent', 'region', 'island', 'city', 'town', 'village', 'district', 'building', 'dungeon', 'wilderness', 'landmark', 'other'])
export type LocationType = z.infer<typeof LocationTypeSchema>

/** Vztah postav k místu i jeho stav; `unknown` = lokace existuje, ale postavy ji ještě neobjevily */
export const LocationStatusSchema = z.enum(['unknown', 'known', 'visited', 'abandoned', 'destroyed'])
export type LocationStatus = z.infer<typeof LocationStatusSchema>

export const StoryLocationSchema = z.object({
  id: z.string().min(1),
  /** Název = identita lokace, název souboru */
  title: z.string().min(1),
  type: LocationTypeSchema,
  status: LocationStatusSchema,
  /** Název nadřazené lokace (wikilink), null = nejvyšší úroveň */
  parentLocation: z.string().nullable(),
  /** Obrázek místa (`portraits/locations/<Název>.<ext>`) */
  image: ImageRefSchema,
  /** Markdown popis – tělo souboru před značkou `<!-- secrets -->` */
  description: z.string(),
  /** Tajemství místa – tělo za značkou */
  secrets: z.string(),
  createdAt: z.number(),
  updatedAt: z.number(),
})
export type StoryLocation = z.infer<typeof StoryLocationSchema>

/** Vstup pro vytvoření/úpravu lokace; nevyplněná pole při úpravě zůstávají beze změny (`image: null` = odebrat) */
export const LocationInputSchema = z.object({
  title: z.string().trim().min(1).max(100),
  type: LocationTypeSchema,
  status: LocationStatusSchema.optional(),
  parentLocation: z.string().trim().min(1).nullable().optional(),
  image: ImageRefSchema.optional(),
  description: z.string().optional(),
  secrets: z.string().optional(),
})
export type LocationInput = z.infer<typeof LocationInputSchema>

/**
 * LoreEntry = záznam encyklopedie světa (historie, legenda, náboženství, magie…) – informace, ne úkol ani hrozba.
 * Soubor `lore/<Název>.md`; vazby na ostatní entity vlastní záznam (wikilinky), zpětné vazby se dopočítávají.
 * Dvě nezávislé osy: `truth` (je to skutečně pravda?) a `knowledge` (jak dobře to postavy znají?).
 * Tělo = obsah, jak je znám ve světě; za značkou `<!-- secrets -->` skutečná pravda (co se opravdu stalo).
 */
export const LoreTypeSchema = z.enum(['history', 'legend', 'religion', 'culture', 'magic', 'cosmology', 'politics', 'event', 'prophecy', 'other'])
export type LoreType = z.infer<typeof LoreTypeSchema>

/** Pravdivost – hodnoty záměrně nejsou `true`/`false`, aby je YAML nečetl jako boolean */
export const LoreTruthSchema = z.enum(['unknown', 'confirmed', 'partial', 'debunked'])
export type LoreTruth = z.infer<typeof LoreTruthSchema>

export const LoreKnowledgeSchema = z.enum(['unknown', 'rumored', 'known'])
export type LoreKnowledge = z.infer<typeof LoreKnowledgeSchema>

export const LoreEntrySchema = z.object({
  id: z.string().min(1),
  /** Název = identita záznamu, název souboru */
  title: z.string().min(1),
  type: LoreTypeSchema,
  truth: LoreTruthSchema,
  knowledge: LoreKnowledgeSchema,
  /** Celá jména souvisejících postav (wikilinky) */
  characters: z.array(z.string()),
  /** Názvy souvisejících lokací, frakcí, questů a nití (wikilinky) */
  locations: z.array(z.string()),
  factions: z.array(z.string()),
  quests: z.array(z.string()),
  threads: z.array(z.string()),
  /** Markdown – obsah záznamu tak, jak je znám ve světě */
  content: z.string(),
  /** Skutečná pravda (tělo za značkou `<!-- secrets -->`) */
  secrets: z.string(),
  createdAt: z.number(),
  updatedAt: z.number(),
})
export type LoreEntry = z.infer<typeof LoreEntrySchema>

/** Vstup pro vytvoření/úpravu záznamu; nevyplněná pole při úpravě zůstávají beze změny */
export const LoreInputSchema = z.object({
  title: z.string().trim().min(1).max(100),
  type: LoreTypeSchema,
  truth: LoreTruthSchema.optional(),
  knowledge: LoreKnowledgeSchema.optional(),
  characters: z.array(z.string().trim().min(1)).optional(),
  locations: z.array(z.string().trim().min(1)).optional(),
  factions: z.array(z.string().trim().min(1)).optional(),
  quests: z.array(z.string().trim().min(1)).optional(),
  threads: z.array(z.string().trim().min(1)).optional(),
  content: z.string().optional(),
  secrets: z.string().optional(),
})
export type LoreInput = z.infer<typeof LoreInputSchema>

/**
 * GameSession = jedno reálné herní sezení (měřené stopkami), nezávislé na scénách.
 * Slouží k přehledu, kolik času hra zabrala a jak jednotlivá sezení bavila.
 */
export const FunRatingSchema = z
  .number()
  .min(0)
  .max(10)
  .refine(v => Number.isInteger(v * 2), { message: 'Zábavnost musí být v krocích po 0,5.' })

export const GameSessionSchema = z.object({
  id: z.string().min(1),
  /** Začátek sezení (ms) – datum, kdy bylo odehráno */
  startedAt: z.number(),
  /** Uložení záznamu (ms) */
  endedAt: z.number(),
  /** Čistý herní čas bez pauz (s) */
  durationSeconds: z.number().int().min(0),
  /** Zábavnost 0–10 po půl stupních */
  fun: FunRatingSchema,
  description: z.string(),
})
export type GameSession = z.infer<typeof GameSessionSchema>

export const GameSessionInputSchema = z.object({
  startedAt: z.number().int().positive(),
  durationSeconds: z.number().int().min(0),
  fun: FunRatingSchema,
  description: z.string().max(10000).optional(),
})
export type GameSessionInput = z.infer<typeof GameSessionInputSchema>

/** Řetězec rodičů lokace od kořene k lokaci samotné (breadcrumb); cyklus/chybějící rodič řetězec ukončí */
export function locationPath(location: StoryLocation, all: readonly StoryLocation[]): StoryLocation[] {
  const chain: StoryLocation[] = [location]
  const seen = new Set<string>([location.id])
  let cursor: StoryLocation | undefined = location
  while (cursor?.parentLocation) {
    const parentTitle: string = cursor.parentLocation
    const parent = all.find(l => l.title === parentTitle)
    if (!parent || seen.has(parent.id)) break
    seen.add(parent.id)
    chain.unshift(parent)
    cursor = parent
  }
  return chain
}

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
  quests: z.array(QuestSchema),
  locations: z.array(StoryLocationSchema),
  lore: z.array(LoreEntrySchema),
})
export type GameDetail = z.infer<typeof GameDetailSchema>

// --- API request DTO ---

export const CreateGameRequestSchema = z.object({ name: z.string().trim().min(1).max(100) })
export type CreateGameRequest = z.infer<typeof CreateGameRequestSchema>

export const RenameGameRequestSchema = z.object({ name: z.string().trim().min(1).max(100) })
export type RenameGameRequest = z.infer<typeof RenameGameRequestSchema>

export const CreateSceneRequestSchema = SceneInputSchema
export type CreateSceneRequest = SceneInput

export const AssetKindSchema = z.enum(['portrait', 'background', 'narrator', 'scene', 'faction', 'location'])
export type AssetKind = z.infer<typeof AssetKindSchema>

export const AssetFromUrlRequestSchema = z.object({
  kind: AssetKindSchema,
  url: z.url(),
  /** Celé jméno postavy (portrait), jméno vypravěče (narrator), název scény (scene), frakce (faction) či lokace (location) – určuje název souboru */
  ownerName: z.string().optional(),
})
export type AssetFromUrlRequest = z.infer<typeof AssetFromUrlRequestSchema>

export const AssetResponseSchema = z.object({ path: z.string().min(1) })
export type AssetResponse = z.infer<typeof AssetResponseSchema>

export const ApiErrorSchema = z.object({ error: z.string() })
export type ApiError = z.infer<typeof ApiErrorSchema>

/** Odpověď `POST /api/games/:game/scenes/:scene/ai` – záznamy, které AI připsala na konec scény (už uložené ve vaultu) */
export const AiGenerateResponseSchema = z.object({
  entries: z.array(StoryEntrySchema),
  /** Surová odpověď modelu (pro ladění promptu) */
  raw: z.string(),
})
export type AiGenerateResponse = z.infer<typeof AiGenerateResponseSchema>

/** Odpověď `POST /api/games/:game/scenes/:scene/summary` – AI shrnutí děje scény (neukládá se, FE ho vloží do dialogu scény) */
export const SceneSummaryResponseSchema = z.object({
  summary: z.string(),
  /** Surová odpověď modelu (pro ladění promptu) */
  raw: z.string(),
})
export type SceneSummaryResponse = z.infer<typeof SceneSummaryResponseSchema>

// ---------- složka s hrami (vault) ----------

/** Odpověď `GET /api/vault` a `PUT /api/vault` – aktuálně otevřená složka s hrami */
export const VaultInfoSchema = z.object({
  /** Absolutní cesta ke složce s hrami, kterou BE právě používá */
  path: z.string().min(1),
  /** Výchozí cesta z konfigurace BE (VAULT_PATH) */
  defaultPath: z.string().min(1),
  /** Umí BE otevřít nativní dialog pro výběr složky / souboru? (jen Windows) */
  nativeDialogs: z.boolean(),
})
export type VaultInfo = z.infer<typeof VaultInfoSchema>

export const SetVaultRequestSchema = z.object({
  path: z.string().trim().min(1),
  /** Vytvořit složku, pokud neexistuje */
  create: z.boolean().optional(),
})
export type SetVaultRequest = z.infer<typeof SetVaultRequestSchema>

// ---------- nativní dialogy ----------

export const PickFolderRequestSchema = z.object({
  title: z.string().trim().min(1).max(200).optional(),
  initialPath: z.string().trim().min(1).optional(),
})
export type PickFolderRequest = z.infer<typeof PickFolderRequestSchema>

export const PickSaveFileRequestSchema = z.object({
  title: z.string().trim().min(1).max(200).optional(),
  fileName: z.string().trim().min(1).max(255),
  initialDir: z.string().trim().min(1).optional(),
  extension: z.string().trim().regex(/^[a-z0-9]+$/i).optional(),
})
export type PickSaveFileRequest = z.infer<typeof PickSaveFileRequestSchema>

/** Vybraná cesta; null = uživatel dialog zrušil */
export const PickResponseSchema = z.object({ path: z.string().nullable() })
export type PickResponse = z.infer<typeof PickResponseSchema>

// ---------- záloha hry ----------

export const BackupGameRequestSchema = z.object({
  /** Absolutní cesta k cílovému .zip souboru */
  targetPath: z.string().trim().min(1),
})
export type BackupGameRequest = z.infer<typeof BackupGameRequestSchema>

export const BackupGameResponseSchema = z.object({ path: z.string().min(1), bytes: z.number().int().nonnegative() })
export type BackupGameResponse = z.infer<typeof BackupGameResponseSchema>

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
