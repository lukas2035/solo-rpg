import type { Character, CharacterInput, Faction, FactionInput, GameDetail, GameMeta, GameSession, GameSessionInput, GameSettings, GameSetup, LocationInput, LoreEntry, LoreInput, Narrator, NarratorInput, Quest, QuestInput, SceneInput, SceneMeta, StoryEntry, StoryLocation, StoryThread, ThreadInput, AssetKind } from '@solo-rpg/shared'

export interface AssetInput {
  kind: AssetKind
  /** Celé jméno postavy (portrait), jméno vypravěče (narrator), název scény (scene), frakce (faction) či lokace (location) – určuje název souboru */
  ownerName?: string
  /** Původní název souboru (pro odvození přípony a jména pozadí) */
  filename: string
  mimeType?: string
  data: Buffer
}

/**
 * Abstrakce úložiště her. Aktuální implementace zapisuje do Obsidian vaultu,
 * do budoucna sem přijde např. databázový/cloudový provider.
 */
export interface StorageProvider {
  listGames(): Promise<GameMeta[]>
  createGame(name: string): Promise<GameDetail>
  getGame(name: string): Promise<GameDetail | null>
  renameGame(oldName: string, newName: string): Promise<GameMeta>
  deleteGame(name: string): Promise<void>

  saveSetup(name: string, settings: GameSettings): Promise<GameSetup>

  createCharacter(name: string, input: CharacterInput): Promise<Character>
  updateCharacter(name: string, characterId: string, input: CharacterInput): Promise<Character>
  deleteCharacter(name: string, characterId: string): Promise<void>

  createNarrator(name: string, input: NarratorInput): Promise<Narrator>
  updateNarrator(name: string, narratorId: string, input: NarratorInput): Promise<Narrator>
  deleteNarrator(name: string, narratorId: string): Promise<void>

  saveAsset(name: string, asset: AssetInput): Promise<string>

  listScenes(name: string): Promise<SceneMeta[]>
  createScene(name: string, input: SceneInput): Promise<SceneMeta>
  updateScene(name: string, sceneId: string, input: SceneInput): Promise<SceneMeta>
  getSceneEntries(name: string, sceneId: string): Promise<StoryEntry[] | null>
  saveSceneEntries(name: string, sceneId: string, entries: StoryEntry[]): Promise<void>
  deleteScene(name: string, sceneId: string): Promise<void>

  listThreads(name: string): Promise<StoryThread[]>
  createThread(name: string, input: ThreadInput): Promise<StoryThread>
  updateThread(name: string, threadId: string, input: ThreadInput): Promise<StoryThread>
  deleteThread(name: string, threadId: string): Promise<void>

  listFactions(name: string): Promise<Faction[]>
  createFaction(name: string, input: FactionInput): Promise<Faction>
  updateFaction(name: string, factionId: string, input: FactionInput): Promise<Faction>
  deleteFaction(name: string, factionId: string): Promise<void>

  listQuests(name: string): Promise<Quest[]>
  createQuest(name: string, input: QuestInput): Promise<Quest>
  updateQuest(name: string, questId: string, input: QuestInput): Promise<Quest>
  deleteQuest(name: string, questId: string): Promise<void>

  listLocations(name: string): Promise<StoryLocation[]>
  createLocation(name: string, input: LocationInput): Promise<StoryLocation>
  updateLocation(name: string, locationId: string, input: LocationInput): Promise<StoryLocation>
  deleteLocation(name: string, locationId: string): Promise<void>

  listLore(name: string): Promise<LoreEntry[]>
  createLore(name: string, input: LoreInput): Promise<LoreEntry>
  updateLore(name: string, loreId: string, input: LoreInput): Promise<LoreEntry>
  deleteLore(name: string, loreId: string): Promise<void>

  /** Herní sezení (stopky) – záznamy v jednom souboru `sessions.md` */
  listSessions(name: string): Promise<GameSession[]>
  createSession(name: string, input: GameSessionInput): Promise<GameSession>
  updateSession(name: string, sessionId: string, input: GameSessionInput): Promise<GameSession>
  deleteSession(name: string, sessionId: string): Promise<void>
}

export class NotFoundError extends Error {}
export class ConflictError extends Error {}
export class ValidationError extends Error {}
