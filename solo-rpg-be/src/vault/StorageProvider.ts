import type { Character, CharacterInput, GameDetail, GameMeta, GameSettings, GameSetup, SceneInput, SceneMeta, StoryEntry, AssetKind } from '@solo-rpg/shared'

export interface AssetInput {
  kind: AssetKind
  /** Celé jméno postavy (portrait) nebo název scény (scene) – určuje název souboru */
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

  saveAsset(name: string, asset: AssetInput): Promise<string>

  listScenes(name: string): Promise<SceneMeta[]>
  createScene(name: string, input: SceneInput): Promise<SceneMeta>
  updateScene(name: string, sceneId: string, input: SceneInput): Promise<SceneMeta>
  getSceneEntries(name: string, sceneId: string): Promise<StoryEntry[] | null>
  saveSceneEntries(name: string, sceneId: string, entries: StoryEntry[]): Promise<void>
  deleteScene(name: string, sceneId: string): Promise<void>
}

export class NotFoundError extends Error {}
export class ConflictError extends Error {}
export class ValidationError extends Error {}
