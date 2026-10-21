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

/**
 * Systém pravidel pro rules adapter Directoru: abstraktní obtížnost 1–5 se překládá na konkrétní hodnotu systému
 * (D&D 5e DC, VtM 5e Difficulty, Fate žebřík). `none` = v briefu zůstane jen 1–5.
 */
export const RulesSystemSchema = z.enum(['none', 'dnd5e', 'vtm5e', 'fate'])
export type RulesSystem = z.infer<typeof RulesSystemSchema>

/** Fáze pacingu kampaně (odvozená z napětí, nebo ručně přepsaná) */
export const PacingPhaseSchema = z.enum(['calm', 'rising', 'peak', 'aftermath'])
export type PacingPhase = z.infer<typeof PacingPhaseSchema>

/** Ruční korekce pulsu kampaně hráčem; null = nechat dopočítat */
export const PulseOverrideSchema = z.object({
  tension: z.number().int().min(0).max(10).nullable(),
  phase: PacingPhaseSchema.nullable(),
})
export type PulseOverride = z.infer<typeof PulseOverrideSchema>

/** Barva písma prózy ve starém tvaru (do v9 fields / starý frontmatter `proseTextColor`); dnes nahrazena `ProseFont` */
export const ProseTextColorSchema = z.enum(['light', 'dark'])
export type ProseTextColor = z.infer<typeof ProseTextColorSchema>

/** CSS barva `#rrggbb` */
export const HexColorSchema = z.string().regex(/^#[0-9a-fA-F]{6}$/, 'Barva musí být ve tvaru #rrggbb')

/**
 * Způsob vykreslení obrázku pozadí prózy:
 * - `repeat` / `repeat-x` / `repeat-y` – dlaždice v původní velikosti (textura papíru apod.)
 * - `original` – jednou, v původní velikosti, nahoře uprostřed
 * - `fit-width` / `fit-height` – roztažený na šířku / výšku stránky se zachováním poměru stran (přesah se ořízne)
 */
export const ProseBackgroundModeSchema = z.enum(['repeat', 'repeat-x', 'repeat-y', 'original', 'fit-width', 'fit-height'])
export type ProseBackgroundMode = z.infer<typeof ProseBackgroundModeSchema>

/** Pozadí stránky prózy: obrázek (null = jen barva), způsob vykreslení a barva podkladu pod ním */
export const ProseBackgroundSchema = z.object({
  image: ImageRefSchema,
  mode: ProseBackgroundModeSchema,
  color: HexColorSchema,
})
export type ProseBackground = z.infer<typeof ProseBackgroundSchema>

/** Barvy podkladu odpovídající dřívějšímu přepínači světlé / tmavé písmo */
export const PROSE_BACKGROUND_DARK_COLOR = '#1a1a1a'
export const PROSE_BACKGROUND_LIGHT_COLOR = '#e9e4d8'
export const DEFAULT_PROSE_BACKGROUND: ProseBackground = { image: null, mode: 'repeat', color: PROSE_BACKGROUND_DARK_COLOR }

/** Stín písma (CSS `text-shadow`); null = bez stínu */
export const ProseFontShadowSchema = z.object({
  color: HexColorSchema,
  /** Rozostření v px */
  blur: z.number().min(0).max(40),
  /** Posun v px */
  x: z.number().min(-20).max(20),
  y: z.number().min(-20).max(20),
})
export type ProseFontShadow = z.infer<typeof ProseFontShadowSchema>

/** Písmo prózy – jedno pro celou scénu: rodina (CSS `font-family`), základní velikost v px, barva a volitelný stín */
export const ProseFontSchema = z.object({
  family: z.string().trim().min(1).max(200),
  size: z.number().min(10).max(72),
  color: HexColorSchema,
  shadow: ProseFontShadowSchema.nullable(),
})
export type ProseFont = z.infer<typeof ProseFontSchema>

export const PROSE_FONT_DEFAULT_FAMILY = "Georgia, 'Times New Roman', serif"
/** Výchozí světlé písmo (na tmavém podkladu) – odpovídá dřívějšímu `proseTextColor: 'light'` */
export const PROSE_FONT_LIGHT: ProseFont = { family: PROSE_FONT_DEFAULT_FAMILY, size: 19, color: '#ece6d9', shadow: null }
/** Výchozí tmavé písmo (na světlém podkladu) – odpovídá dřívějšímu `proseTextColor: 'dark'` */
export const PROSE_FONT_DARK: ProseFont = { family: PROSE_FONT_DEFAULT_FAMILY, size: 19, color: '#1f1a14', shadow: null }

/** Převod starého přepínače barvy písma na vzhled prózy (migrace fields, starý frontmatter) */
export function proseAppearanceFromLegacy(texture: ImageRef, textColor: ProseTextColor): { proseBackground: ProseBackground; proseFont: ProseFont } {
  const dark = textColor === 'dark'
  return {
    proseBackground: { image: texture, mode: 'repeat', color: dark ? PROSE_BACKGROUND_LIGHT_COLOR : PROSE_BACKGROUND_DARK_COLOR },
    proseFont: dark ? PROSE_FONT_DARK : PROSE_FONT_LIGHT,
  }
}

/** Písmo uložené v knihovně kampaně (GameSettings.proseFonts) – pojmenované, znovu použitelné v libovolné scéně */
export const ProseFontPresetSchema = ProseFontSchema.extend({
  id: z.string().min(1),
  name: z.string().trim().min(1).max(60),
})
export type ProseFontPreset = z.infer<typeof ProseFontPresetSchema>

/**
 * Položka knihovny obrázků prózy (`GET …/prose-images`) – lokální asset druhu `illustration` nebo `texture`.
 * `usage` = kolikrát na něj kampaň odkazuje (obrázky v textech všech scén + pozadí scén).
 */
export const ProseImageSchema = z.object({
  /** ImageRef (`assets/<id><ext>`) – stejný řetězec jako `src` obrázku v textu / `proseBackground.image` */
  path: z.string().min(1),
  /** Původní název souboru (informativně) */
  name: z.string(),
  size: z.number().int().nonnegative(),
  createdAt: z.number(),
  usage: z.number().int().nonnegative(),
})
export type ProseImage = z.infer<typeof ProseImageSchema>

/** Odpověď `DELETE …/prose-images/:asset` – kolik odkazů v textech a pozadích scén bylo odstraněno */
export const ProseImageDeleteResponseSchema = z.object({ removedReferences: z.number().int().nonnegative() })
export type ProseImageDeleteResponse = z.infer<typeof ProseImageDeleteResponseSchema>

/** Nastavení hry bez postav a vypravěčů (ti mají vlastní CRUD endpointy) */
export const GameSettingsSchema = z.object({
  backgroundImage: ImageRefSchema,
  /** Popis herních pravidel běžících pod příběhem (VtM 5e, D&D 5e, Fate…; markdown, tělo `game.md` za `<!-- rules -->`); prázdné = bez pravidel */
  rules: z.string().max(20000),
  /** Systém pravidel pro překlad obtížnosti v briefu Directoru; frontmatter `rulesSystem` */
  rulesSystem: RulesSystemSchema,
  /** Ruční korekce pulsu kampaně (napětí / fáze); frontmatter `pulseTension`, `pulsePhase` */
  pulseOverride: PulseOverrideSchema,
  /** Knihovna písem prózy kampaně (frontmatter `proseFonts`) – pojmenovaná nastavení k použití v libovolné scéně */
  proseFonts: z.array(ProseFontPresetSchema).max(100),
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

/**
 * Režim AI vypravěče scény (frontmatter `aiMode`):
 * - `basic` – prompt jen z vypravěče, postav, popisu scény a jejího průběhu; bez kontextu kampaně a bez Režie (Director)
 * - `advanced` – navíc kontext kampaně (shrnutí jiných scén, lokace, questy, nitě, frakce, lore) a Režie (puls, brief, události)
 */
export const AiModeSchema = z.enum(['basic', 'advanced'])
export type AiMode = z.infer<typeof AiModeSchema>

/**
 * Způsob schvalování textů od AI ve scéně (frontmatter `aiReview`):
 * - `panel` – návrh v samostatném panelu pod příběhem (úprava textu/mluvčího před přijetím)
 * - `inline` – návrh se ukáže rovnou jako běžný text ve scéně, tlačítka pod ním; fokus na Přijmout (Enter)
 * - `auto` – vše se přijme automaticky, texty se rovnou zapíší do scény
 */
export const AiReviewSchema = z.enum(['panel', 'inline', 'auto'])
export type AiReview = z.infer<typeof AiReviewSchema>

/**
 * Režim scény:
 * - `play` – hraná scéna: repliky postav a vypravěče, AI vypravěč, kostky
 * - `prose` – próza: scéna je souvislý text (WYSIWYG markdown editor s obrázky), bez postav a AI
 */
export const SceneModeSchema = z.enum(['play', 'prose'])
export type SceneMode = z.infer<typeof SceneModeSchema>


/** Rozložení obrázku v próze: přes celou šířku stránky, nebo půlka stránky s textem obtékajícím zprava/zleva */
export const ProseImageLayoutSchema = z.enum(['full', 'left', 'right'])
export type ProseImageLayout = z.infer<typeof ProseImageLayoutSchema>

/**
 * Dokument prózy = strom bloků ve formátu ProseMirror/TipTap JSON (kořen `type: 'doc'`).
 * Uzly: paragraph, heading (attrs.level), bulletList/orderedList/listItem, blockquote, horizontalRule, codeBlock,
 * image (attrs.src = ImageRef, attrs.layout = ProseImageLayout, attrs.alt). Značky: bold, italic, strike, code.
 * Ukládá se celý najednou (JSONB v tabulce `scene_documents`), do Obsidianu se exportuje jako markdown.
 */
export interface ProseNode {
  type: string
  attrs?: Record<string, unknown>
  content?: ProseNode[]
  marks?: { type: string; attrs?: Record<string, unknown> }[]
  text?: string
}
export const ProseNodeSchema: z.ZodType<ProseNode> = z.lazy(() =>
  z.object({
    type: z.string().min(1),
    attrs: z.record(z.string(), z.unknown()).optional(),
    content: z.array(ProseNodeSchema).optional(),
    marks: z.array(z.object({ type: z.string().min(1), attrs: z.record(z.string(), z.unknown()).optional() })).optional(),
    text: z.string().optional(),
  }),
)
export const ProseDocSchema = z.object({
  type: z.literal('doc'),
  attrs: z.record(z.string(), z.unknown()).optional(),
  content: z.array(ProseNodeSchema).optional(),
})
export type ProseDoc = z.infer<typeof ProseDocSchema>

/** Odpověď `GET …/scenes/:scene/prose` a tělo `PUT` – dokument prózy; null = scéna zatím nemá žádný text */
export const SceneProseSchema = z.object({ doc: ProseDocSchema.nullable() })
export type SceneProse = z.infer<typeof SceneProseSchema>

/** Odkazy (`attrs.src`) všech obrázků v dokumentu prózy v pořadí výskytu, včetně duplicit */
export function proseImageRefs(doc: ProseDoc): string[] {
  const out: string[] = []
  const walk = (node: ProseNode) => {
    if (node.type === 'image' && typeof node.attrs?.src === 'string') out.push(node.attrs.src)
    node.content?.forEach(walk)
  }
  doc.content?.forEach(walk)
  return out
}

/**
 * Přepíše odkazy obrázků v dokumentu podle `map` (starý src → nový src; null = obrázek z textu odstranit).
 * Vrací nový dokument a počet zasažených obrázků; dokument beze změny vrací jako tentýž objekt.
 */
export function remapProseImages(doc: ProseDoc, map: ReadonlyMap<string, string | null>): { doc: ProseDoc; changed: number } {
  let changed = 0
  const walk = (node: ProseNode): ProseNode | null => {
    if (node.type === 'image') {
      const src = typeof node.attrs?.src === 'string' ? node.attrs.src : null
      if (src === null || !map.has(src)) return node
      changed++
      const next = map.get(src)
      return next === null || next === undefined ? null : { ...node, attrs: { ...node.attrs, src: next } }
    }
    if (!node.content) return node
    const content = node.content.map(walk).filter((n): n is ProseNode => n !== null)
    return { ...node, content }
  }
  const content = (doc.content ?? []).map(walk).filter((n): n is ProseNode => n !== null)
  return changed === 0 ? { doc, changed: 0 } : { doc: { ...doc, content }, changed }
}

/** Režim AI v editoru prózy: `continue` = napsat pokračování na konec, `rewrite` = přepracovat označený úsek (nebo celý text) */
export const ProseAiModeSchema = z.enum(['continue', 'rewrite'])
export type ProseAiMode = z.infer<typeof ProseAiModeSchema>

/** Položka historie AI v editoru prózy – pokyn autora spolu s odpovědí modelu (markdown), aby šly obojí znovu použít / zkopírovat */
export const ProsePromptEntrySchema = z.object({
  mode: ProseAiModeSchema,
  prompt: z.string(),
  /** Text vrácený modelem (u `rewrite` nový úsek); prázdný u položek z doby, kdy se odpovědi neukládaly */
  response: z.string(),
  /** Čas odeslání (ms); 0 = neznámý (starší položky) */
  createdAt: z.number(),
})
export type ProsePromptEntry = z.infer<typeof ProsePromptEntrySchema>

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
  /** Jméno vypravěče scény (frontmatter `narrator` jako wikilink; dědí se do nové scény); null = scéna vypravěče nemá */
  narrator: z.string().nullable(),
  /** AI vypravěč zapnutý pro tuto scénu (frontmatter `ai`) – na tlačítko „🤖 AI pokračuje“ napíše vypravěč scény další text přes OpenRouter */
  ai: z.boolean(),
  /** Celá jména postav scény hraných AI (frontmatter `aiCharacters` jako wikilinky); ostatní postavy scény hraje hráč */
  aiCharacters: z.array(z.string()),
  /** Volitelný doplňující/shrnující popis situace jen pro AI (frontmatter `aiPrompt`); vloží se za popis scény */
  aiPrompt: z.string(),
  /** Režim AI vypravěče – základní / pokročilá (dědí se do nové scény; první scéna hry `basic`) */
  aiMode: AiModeSchema,
  /** Posílat AI vypravěči sekci o kostkách a pravidlech hry při generování textů této scény (frontmatter `rulesInAi`; dědí se do nové scény) */
  rulesInAi: z.boolean(),
  /** Způsob schvalování textů od AI (frontmatter `aiReview`; dědí se do nové scény; výchozí `panel`) */
  aiReview: AiReviewSchema,
  /** Ztmavený obrázek na pozadí při přehrávání scény (frontmatter `darkBackground`; dědí se do nové scény). Výchozí false = původní jas */
  darkBackground: z.boolean(),
  /** Režim scény (frontmatter `mode`); výchozí `play`. Prózu (`prose`) tvoří dokument editoru místo replik */
  mode: SceneModeSchema,
  /** Pozadí stránky prózy – obrázek, způsob vykreslení, barva podkladu (frontmatter `proseBackground`; dědí se do nové scény) */
  proseBackground: ProseBackgroundSchema,
  /** Písmo prózy – stejné pro celou scénu (frontmatter `proseFont`; dědí se do nové scény) */
  proseFont: ProseFontSchema,
  /** Historie AI v editoru prózy – pokyny i odpovědi (nejnovější první; frontmatter `prosePrompts`) – k opětovnému použití */
  prosePrompts: z.array(ProsePromptEntrySchema),
  /** Celkové zhodnocení / shrnutí děje scény (markdown; tělo souboru za značkou `<!-- summary -->`) – rychlý kontext pro hráče i AI */
  summary: z.string(),
  /** Shrnutí je zastaralé – od jeho posledního uložení se změnily záznamy nebo popis scény (frontmatter `summaryStale`) */
  summaryStale: z.boolean(),
  /** Počet záznamů (replik) ve scéně – FE podle něj pozná, že scéna má co shrnout */
  entryCount: z.number().int().nonnegative(),
  /**
   * Názvy jiných scén, jejichž shrnutí dostane AI vypravěč jako kontext (frontmatter `contextScenes` jako wikilinky).
   * Prázdné = výchozí chování (všechny předchozí scény se shrnutím, od nejnovější, do rozpočtu).
   */
  contextScenes: z.array(z.string()),
  createdAt: z.number(),
  updatedAt: z.number(),
})
export type SceneMeta = z.infer<typeof SceneMetaSchema>

/**
 * Vstup pro vytvoření/úpravu scény; `characters` undefined při vytvoření = převzít z poslední scény.
 * `order` = požadovaná pozice (1 = první); při vytvoření undefined = na konec, při úpravě undefined = beze změny.
 * Ostatní scény se podle toho přečíslují (frontmatter `order` i prefix názvu souboru).
 */
export const SceneInputSchema = z.object({
  title: z.string().trim().min(1).max(100),
  order: z.number().int().positive().optional(),
  description: z.string().optional(),
  image: ImageRefSchema.optional(),
  characters: z.array(z.string().trim().min(1)).optional(),
  location: z.string().trim().min(1).nullable().optional(),
  /** Jméno vypravěče scény; null = bez vypravěče; undefined při vytvoření = převzít ze sousední scény */
  narrator: z.string().trim().min(1).nullable().optional(),
  ai: z.boolean().optional(),
  aiCharacters: z.array(z.string().trim().min(1)).optional(),
  aiPrompt: z.string().max(5000).optional(),
  aiMode: AiModeSchema.optional(),
  rulesInAi: z.boolean().optional(),
  aiReview: AiReviewSchema.optional(),
  darkBackground: z.boolean().optional(),
  /** Režim scény; při vytvoření undefined = `play` */
  mode: SceneModeSchema.optional(),
  /** Pozadí prózy; undefined při vytvoření = převzít ze sousední scény */
  proseBackground: ProseBackgroundSchema.optional(),
  /** Písmo prózy; undefined při vytvoření = převzít ze sousední scény */
  proseFont: ProseFontSchema.optional(),
  prosePrompts: z.array(ProsePromptEntrySchema).max(100).optional(),
  summary: z.string().max(20000).optional(),
  contextScenes: z.array(z.string().trim().min(1)).max(50).optional(),
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

/** Vstup pro vytvoření/úpravu questu; povinný je jen název, nevyplněná pole při úpravě zůstávají beze změny (typ při vytvoření = `side`) */
export const QuestInputSchema = z.object({
  title: z.string().trim().min(1).max(100),
  type: QuestTypeSchema.optional(),
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
  /**
   * Druh záznamu; chybí = replika příběhu. `prompt` = jednorázový pokyn hráče pro AI („Zadat prompt“): není součástí
   * příběhu (AI ho v přepisu nedostává, do exportu nejde), `characterName` i `narratorName` jsou null.
   */
  kind: z.literal('prompt').optional(),
  /** Text vygenerovala AI (nastavuje se při přijetí návrhu) */
  ai: z.boolean().optional(),
  /** Id záznamu typu `prompt`, podle kterého AI text napsala; chybí/null = bez promptu */
  promptId: z.string().nullable().optional(),
})
export type StoryEntry = z.infer<typeof StoryEntrySchema>

/** Prvních pár slov promptu pro tooltip / popisek (ne celý text) */
export function promptPreview(text: string, words = 8): string {
  const parts = text.replace(/\s+/g, ' ').trim().split(' ')
  return parts.length > words ? `${parts.slice(0, words).join(' ')}…` : parts.join(' ')
}

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

/** Druh obrázku; `illustration` = obrázek v textu prózy, `texture` = textura pod textem prózy */
export const AssetKindSchema = z.enum(['portrait', 'background', 'narrator', 'scene', 'faction', 'location', 'illustration', 'texture'])
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

/**
 * Návrh AI vypravěče (`POST /api/games/:game/scenes/:scene/ai`). Nic se neukládá – záznamy se stanou kánonem až
 * po `accept` (hráč je může před přijetím upravit), `reject` s důvodem je pošle do dalšího pokusu.
 */
export const AiSuggestionSchema = z.object({
  id: z.string().min(1),
  sceneId: z.string().min(1),
  entries: z.array(StoryEntrySchema),
  /** Surová odpověď modelu (pro ladění promptu) */
  raw: z.string(),
  /** Důvody odmítnutí předchozích návrhů ve scéně, které model při tomto pokusu dostal */
  rejectedReasons: z.array(z.string()),
  /** Stručně co z kampaně šlo do kontextu (pro ladění: `Nit: Zrada v cechu (thr_…)`) */
  contextIncluded: z.array(z.string()),
  /** Brief Directoru, podle kterého návrh vznikl; null = psáno bez režie */
  briefId: z.string().nullable(),
  /**
   * Jednorázový prompt hráče pro toto volání jako záznam `kind: 'prompt'` (zapíše se do scény až s přijetím první repliky);
   * null = bez promptu. Repliky návrhu mají `ai: true` a `promptId` = jeho id.
   */
  promptEntry: StoryEntrySchema.nullable(),
  createdAt: z.number(),
})
export type AiSuggestion = z.infer<typeof AiSuggestionSchema>

/** Tělo `POST …/ai` – volitelný jednorázový prompt hráče (markdown), platí jen pro toto volání */
export const AiGenerateRequestSchema = z.object({
  prompt: z.string().trim().max(10_000).optional(),
})
export type AiGenerateRequest = z.infer<typeof AiGenerateRequestSchema>

/** Odpověď `GET …/ai/suggestion` – rozpracovaný (nepřijatý) návrh pro scénu, pokud existuje */
export const AiSuggestionStateSchema = z.object({
  suggestion: AiSuggestionSchema.nullable(),
  rejectedReasons: z.array(z.string()),
})
export type AiSuggestionState = z.infer<typeof AiSuggestionStateSchema>

/**
 * Tělo `POST …/ai/suggestions/:id/accept` – záznamy k uložení (hráčem případně upravené; prázdné pole = nic nepřidat).
 * `partial: true` = přijetí jen části návrhu (hodnocení po replikách): zbylé repliky zůstanou jako návrh k dalšímu hodnocení.
 */
export const AiSuggestionAcceptRequestSchema = z.object({
  entries: z.array(StoryEntrySchema),
  partial: z.boolean().optional(),
})
export type AiSuggestionAcceptRequest = z.infer<typeof AiSuggestionAcceptRequestSchema>

/** Odpověď `accept` – záznamy připsané na konec scény (už uložené) + zbylý návrh (null = návrh vyřízen celý) */
export const AiSuggestionAcceptResponseSchema = z.object({
  entries: z.array(StoryEntrySchema),
  suggestion: AiSuggestionSchema.nullable(),
})
export type AiSuggestionAcceptResponse = z.infer<typeof AiSuggestionAcceptResponseSchema>

/** Tělo `POST …/ai/suggestions/:id/reject` – důvod odmítnutí (prázdný = jen zahodit) */
export const AiSuggestionRejectRequestSchema = z.object({
  reason: z.string().trim().max(2000),
})
export type AiSuggestionRejectRequest = z.infer<typeof AiSuggestionRejectRequestSchema>

// ---------- Director (docs/ARCHITECTURE_V2.md §4.1) ----------

/**
 * Puls kampaně – stav, podle kterého Director mění váhy tabulek. Dopočítává se z nití (stav, hodiny), questů a
 * historie přijatých beatů v `events`; hráč může napětí a fázi přepsat (`GameSettings.pulseOverride`).
 */
export const CampaignPulseSchema = z.object({
  /** Napětí 0–10 */
  tension: z.number().int().min(0).max(10),
  phase: PacingPhaseSchema,
  /** Kolik následků „dluží“ příběh hráči (neúspěchy bez odezvy); > 0 → Director vynutí beat typu consequence */
  consequenceDebt: z.number().int().nonnegative(),
  /** Počet přijatých beatů od posledního zvratu */
  beatsSinceTwist: z.number().int().nonnegative(),
  openThreads: z.number().int().nonnegative(),
  escalatedThreads: z.number().int().nonnegative(),
  openQuests: z.number().int().nonnegative(),
  /** Které hodnoty jsou ručně přepsané */
  overridden: z.object({ tension: z.boolean(), phase: z.boolean() }),
  /** Čitelné vysvětlení, z čeho se napětí skládá (pro UI „proč“) */
  signals: z.array(z.string()),
})
export type CampaignPulse = z.infer<typeof CampaignPulseSchema>

/** `continue` = jen rozvíjet rozehranou situaci; `event` = Director vnese nový prvek */
export const BriefModeSchema = z.enum(['continue', 'event'])
export type BriefMode = z.infer<typeof BriefModeSchema>

export const EventTypeSchema = z.enum(['obstacle', 'neutral', 'opportunity', 'reward'])
export type EventType = z.infer<typeof EventTypeSchema>

/**
 * Podoba překážky (jen při `eventType = obstacle`): `check` zkouška dovednosti / jeden hod, `social` střet vůlí
 * (přesvědčování, výslech, vyjednávání), `encounter` fyzický střet / boj s protivníkem – řeší se podle pravidel hráče,
 * ne jedním hodem, `hazard` nebezpečí prostředí (past, požár, pronásledování), `dilemma` volba bez hodu – obě cesty něco stojí.
 */
export const ObstacleKindSchema = z.enum(['check', 'social', 'encounter', 'hazard', 'dilemma'])
export type ObstacleKind = z.infer<typeof ObstacleKindSchema>
/** Překážky, které se neřeší jedním hodem na obtížnost (brief má `difficulty = null`) */
export const NO_ROLL_OBSTACLES: readonly ObstacleKind[] = ['encounter', 'dilemma']

/** Dramatická funkce beatu */
export const BeatKindSchema = z.enum(['escalation', 'consequence', 'resolution', 'reveal'])
export type BeatKind = z.infer<typeof BeatKindSchema>

export const StakesSchema = z.enum(['low', 'medium', 'high'])
export type Stakes = z.infer<typeof StakesSchema>

/** Výsledek hodu hráče podle jeho systému (zadává ručně před psaním AI) */
export const RollOutcomeSchema = z.enum(['success', 'partial', 'fail'])
export type RollOutcome = z.infer<typeof RollOutcomeSchema>

/**
 * Fáze hodu v beatu: `none` bez hodu; `before` AI dovede scénu k hodu / střetu a zastaví se (hráč pak hází či bojuje);
 * `after` hráč už hodil / odehrál střet – do briefu zadá `outcome` a AI popíše dopad
 */
export const RollPhaseSchema = z.enum(['none', 'before', 'after'])
export type RollPhase = z.infer<typeof RollPhaseSchema>

/** Entity, kterých se beat týká – vybírá aplikace (ne AI); jména + id, aby je AI mohla citovat */
export const BriefFocusSchema = z.object({
  characters: z.array(z.string()),
  thread: z.string().nullable(),
  quest: z.string().nullable(),
  faction: z.string().nullable(),
  location: z.string().nullable(),
})
export type BriefFocus = z.infer<typeof BriefFocusSchema>

/**
 * Režijní zadání pro AI vypravěče – výstup Directoru. Hráč ho v panelu může přehodit (nový seed), upravit nebo
 * přeskočit; teprve pak AI píše. Uložen u scény (`SceneDirector`), do `events` jde při přijetí návrhu.
 */
export const NarrativeBriefSchema = z.object({
  id: z.string().min(1),
  sceneId: z.string().min(1),
  /** Seed RNG – stejný seed nad stejným stavem dá stejný brief */
  seed: z.number().int(),
  mode: BriefModeSchema,
  /** null při `mode = continue` */
  eventType: EventTypeSchema.nullable(),
  /** Podoba překážky; null mimo `eventType = obstacle` */
  obstacleKind: ObstacleKindSchema.nullable(),
  beatKind: BeatKindSchema,
  /** Abstraktní obtížnost 1–5; null = beat nevyžaduje hod */
  difficulty: z.number().int().min(1).max(5).nullable(),
  /** Překlad obtížnosti do systému hry (`DC 15`, `Difficulty 4`, `+3 (Good)`); null bez systému / bez hodu */
  difficultyLabel: z.string().nullable(),
  /** Fáze hodu: `before` = zastavit před hodem/střetem, `after` = výsledek už padl (`outcome` povinný před psaním) */
  rollPhase: RollPhaseSchema,
  stakes: StakesSchema,
  /** Významný zvrat (zrada, odhalení, nová skutečnost) */
  twist: z.boolean(),
  focus: BriefFocusSchema,
  /** Výsledek hodu hráče; null = ještě nehodil / hod není potřeba */
  outcome: RollOutcomeSchema.nullable(),
  /** Volná poznámka hráče pro AI („ať se objeví ten dopis“) */
  notes: z.string(),
  /** Probíhající událost scény, jejímž beatem tento brief je; null = pokračování nebo první beat nové události */
  eventId: z.string().nullable(),
  /** Snímek pulsu, ze kterého brief vznikl */
  pulse: CampaignPulseSchema,
  createdAt: z.number(),
})
export type NarrativeBrief = z.infer<typeof NarrativeBriefSchema>

/** Jeden přijatý beat uvnitř události */
export const EventBeatSchema = z.object({
  briefId: z.string(),
  suggestionId: z.string(),
  beatKind: BeatKindSchema,
  rollPhase: RollPhaseSchema,
  difficulty: z.number().int().min(1).max(5).nullable(),
  outcome: RollOutcomeSchema.nullable(),
  twist: z.boolean(),
  createdAt: z.number(),
})
export type EventBeat = z.infer<typeof EventBeatSchema>

export const DirectorEventStatusSchema = z.enum(['active', 'resolved', 'abandoned'])
export type DirectorEventStatus = z.infer<typeof DirectorEventStatusSchema>

/**
 * Událost Directoru – trvá přes několik beatů (uvedení → hod/střet → dopad → rozuzlení). Vzniká přijetím prvního beatu
 * briefu `mode = event`, uzavře ji beat `resolution` (nebo hráč ručně). Scéna má nejvýš jednu aktivní; uložena u scény.
 */
export const DirectorEventSchema = z.object({
  id: z.string().min(1),
  sceneId: z.string().min(1),
  eventType: EventTypeSchema,
  obstacleKind: ObstacleKindSchema.nullable(),
  stakes: StakesSchema,
  focus: BriefFocusSchema,
  status: DirectorEventStatusSchema,
  beats: z.array(EventBeatSchema),
  createdAt: z.number(),
  resolvedAt: z.number().nullable(),
})
export type DirectorEvent = z.infer<typeof DirectorEventSchema>

/** Stav Directoru uložený u scény (přežije restart BE) */
export const SceneDirectorSchema = z.object({
  brief: NarrativeBriefSchema.nullable(),
  event: DirectorEventSchema.nullable(),
})
export type SceneDirector = z.infer<typeof SceneDirectorSchema>

/** Odpověď `GET …/scenes/:scene/director` – aktuální puls, rozpracovaný brief a probíhající událost scény */
export const DirectorStateSchema = z.object({
  pulse: CampaignPulseSchema,
  brief: NarrativeBriefSchema.nullable(),
  event: DirectorEventSchema.nullable(),
})
export type DirectorState = z.infer<typeof DirectorStateSchema>

/**
 * Tělo `POST …/director/brief` – volitelný seed (bez něj náhodný = „přehodit“). `resolve` při aktivní události
 * vynutí beat rozuzlení s daným celkovým výsledkem (null = bez hodu) – „uzavřít událost“.
 */
export const BriefRequestSchema = z.object({
  seed: z.number().int().optional(),
  resolve: z.object({ outcome: RollOutcomeSchema.nullable() }).optional(),
})
export type BriefRequest = z.infer<typeof BriefRequestSchema>

/** Tělo `PATCH …/director/brief` – ruční úpravy hráče; `difficulty` se přepočítá i do `difficultyLabel` */
export const BriefPatchSchema = z.object({
  mode: BriefModeSchema.optional(),
  eventType: EventTypeSchema.nullable().optional(),
  obstacleKind: ObstacleKindSchema.nullable().optional(),
  beatKind: BeatKindSchema.optional(),
  difficulty: z.number().int().min(1).max(5).nullable().optional(),
  rollPhase: RollPhaseSchema.optional(),
  stakes: StakesSchema.optional(),
  twist: z.boolean().optional(),
  outcome: RollOutcomeSchema.nullable().optional(),
  notes: z.string().trim().max(2000).optional(),
  focus: BriefFocusSchema.partial().optional(),
})
export type BriefPatch = z.infer<typeof BriefPatchSchema>

/** Quest, který AI při shrnutí scény navrhla jako nový (hráč ho v UI schválí → `POST /quests`, nebo zamítne) */
export const QuestProposalSchema = z.object({
  title: z.string().trim().min(1).max(100),
  /** Co quest znamená – cíl, proč vznikl, co o něm postavy vědí */
  description: z.string(),
})
export type QuestProposal = z.infer<typeof QuestProposalSchema>

/** Odpověď `POST /api/games/:game/scenes/:scene/summary` – AI shrnutí děje scény (neukládá se, FE ho vloží do dialogu scény) */
export const SceneSummaryResponseSchema = z.object({
  summary: z.string(),
  /** Nové questy, které podle AI scéna otevírá a které ještě v seznamu questů nejsou (prázdné = žádné) */
  quests: z.array(QuestProposalSchema),
  /** Surová odpověď modelu (pro ladění promptu) */
  raw: z.string(),
})
export type SceneSummaryResponse = z.infer<typeof SceneSummaryResponseSchema>

/**
 * Tělo `POST /api/games/:game/scenes/:scene/prose/ai`.
 * `continue`: pokyn autora, BE si vezme dosavadní text scény z úložiště a model napíše pokračování.
 * `rewrite`: FE pošle markdown upravovaného úseku (`selection`) a text před/za ním jako kontext (`before`/`after`, prázdné
 * při úpravě celého textu); `previous` = předchozí pokus modelu, který autorovi nevyhověl (při „Přepracovat“).
 */
export const ProseAiRequestSchema = z.discriminatedUnion('mode', [
  z.object({
    mode: z.literal('continue'),
    prompt: z.string().trim().min(1).max(20000),
  }),
  z.object({
    mode: z.literal('rewrite'),
    prompt: z.string().trim().min(1).max(20000),
    selection: z.string().trim().min(1).max(500000),
    before: z.string().max(500000),
    after: z.string().max(500000),
    previous: z.string().max(500000).optional(),
  }),
])
export type ProseAiRequest = z.infer<typeof ProseAiRequestSchema>

/** Odpověď – text od modelu (markdown; pokračování k připsání na konec, nebo nový úsek místo `selection`) a aktualizovaná historie scény */
export const ProseAiResponseSchema = z.object({
  text: z.string(),
  prompts: z.array(ProsePromptEntrySchema),
})
export type ProseAiResponse = z.infer<typeof ProseAiResponseSchema>

/** Odpověď `POST /api/games/:game/scenes/:scene/context-scenes` – AI výběr předchozích scén relevantních pro tuto scénu (neukládá se) */
export const SceneContextSuggestionResponseSchema = z.object({
  /** Názvy vybraných scén v chronologickém pořadí */
  scenes: z.array(z.string()),
  raw: z.string(),
})
export type SceneContextSuggestionResponse = z.infer<typeof SceneContextSuggestionResponseSchema>

/** Tělo `POST /api/games/:game/scenes/:scene/import` – přepis odehraného textu (např. z Notionu) ve tvaru `**Jméno**: text` */
export const SceneImportRequestSchema = z.object({
  text: z.string().min(1).max(500000),
  /** Rozhodnutí nejednoznačných jmen z předchozího pokusu: jméno v textu → celé jméno zvolené postavy */
  resolutions: z.record(z.string(), z.string()).optional(),
})
export type SceneImportRequest = z.infer<typeof SceneImportRequestSchema>

/** Jméno mluvčího v přepisu, které odpovídá více postavám hry (stejné křestní jméno nebo přezdívka) */
export const SceneImportAmbiguitySchema = z.object({
  /** Jméno tak, jak je v textu */
  name: z.string(),
  /** Celá jména postav, které přicházejí v úvahu */
  candidates: z.array(z.string()),
})
export type SceneImportAmbiguity = z.infer<typeof SceneImportAmbiguitySchema>

/**
 * Odpověď importu přepisu – záznamy připsané na konec scény (už uložené) a postavy hry, které import do scény doplnil.
 * Když `ambiguous` není prázdné, nic se neuložilo: FE nechá hráče vybrat postavy a pošle požadavek znovu s `resolutions`.
 */
export const SceneImportResponseSchema = z.object({
  entries: z.array(StoryEntrySchema),
  addedCharacters: z.array(z.string()),
  ambiguous: z.array(SceneImportAmbiguitySchema),
})
export type SceneImportResponse = z.infer<typeof SceneImportResponseSchema>

/** Odpověď `GET /api/games/:game/rules-prompt` – kompletní sekce o kostkách a pravidlech, jak ji dostává AI (pro textový export hry) */
export const RulesPromptResponseSchema = z.object({
  /** `prompts/rules-prompt.md` + `## Herní pravidla pod příběhem` s popisem pravidel hry; bez ohledu na `SceneMeta.rulesInAi` */
  text: z.string(),
})
export type RulesPromptResponse = z.infer<typeof RulesPromptResponseSchema>

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
