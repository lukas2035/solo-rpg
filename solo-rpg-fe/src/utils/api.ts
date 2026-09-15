import type {
  AiGenerateResponse,
  AssetKind,
  AssetResponse,
  Character,
  CharacterInput,
  GameDetail,
  GameMeta,
  GameSettings,
  GameSetup,
  ImageRef,
  Narrator,
  NarratorInput,
  SceneInput,
  SceneMeta,
  SceneSummaryResponse,
  StoryEntry,
  StoryThread,
  ThreadInput,
  Faction,
  FactionInput,
  Quest,
  QuestInput,
  StoryLocation,
  LocationInput,
  LoreEntry,
  LoreInput,
  GameSession,
  GameSessionInput,
  VaultInfo,
  PickResponse,
  BackupGameResponse,
} from '@solo-rpg/shared'
import { isRemoteImage } from '@solo-rpg/shared'
import { useSyncExternalStore } from 'react'
import { getVaultPath } from './vaultPath'

/**
 * Klient lokálního API (solo-rpg-be). Ve vývoji Vite proxy přesměruje
 * /api a /vault na BE, v produkci lze nastavit VITE_API_BASE.
 */
const API_BASE = (import.meta.env.VITE_API_BASE as string | undefined) ?? ''

export class ApiError extends Error {
  readonly status: number

  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

/** Cesta ke složce s hrami uložená v prohlížeči – BE podle ní přepne otevřený vault (hlavička musí být ASCII, proto encode) */
function vaultHeaders(): Record<string, string> {
  const vaultPath = getVaultPath()
  return vaultPath ? { 'x-vault-path': encodeURIComponent(vaultPath) } : {}
}

/** Stejná informace jako query parametr – pro EventSource a <img>, kde hlavičky nastavit nejde */
function vaultQuery(separator: '?' | '&'): string {
  const vaultPath = getVaultPath()
  return vaultPath ? `${separator}vault=${encodeURIComponent(vaultPath)}` : ''
}

async function request<T>(method: string, url: string, body?: unknown): Promise<T> {
  const response = await fetch(`${API_BASE}${url}`, {
    method,
    headers: {
      ...vaultHeaders(),
      ...(body instanceof FormData || body === undefined ? {} : { 'content-type': 'application/json' }),
    },
    body: body instanceof FormData ? body : body === undefined ? undefined : JSON.stringify(body),
  })
  if (!response.ok) {
    let message = `${response.status} ${response.statusText}`
    try {
      const data = (await response.json()) as { error?: string }
      if (data.error) message = data.error
    } catch {
      // tělo není JSON
    }
    throw new ApiError(response.status, message)
  }
  if (response.status === 204) return undefined as T
  return (await response.json()) as T
}

const gamePath = (game: string) => `/api/games/${encodeURIComponent(game)}`

// ---------- složka s hrami (vault) ----------

export const getVaultInfo = () => request<VaultInfo>('GET', '/api/vault')
/** Přepne BE na jinou složku s hrami; `create` = založit, pokud neexistuje */
export const setVaultPath = (path: string, create = false) => request<VaultInfo>('PUT', '/api/vault', { path, create })

// ---------- nativní dialogy (BE běží na stejném počítači) ----------

/** Nativní výběr složky; vrací cestu, null při zrušení. Vyhodí ApiError 501, kde není dostupný. */
export const pickFolder = (options: { title?: string; initialPath?: string } = {}) =>
  request<PickResponse>('POST', '/api/system/pick-folder', options).then(r => r.path)
/** Nativní dialog „Uložit jako“; vrací cestu, null při zrušení. Vyhodí ApiError 501, kde není dostupný. */
export const pickSaveFile = (options: { title?: string; fileName: string; initialDir?: string; extension?: string }) =>
  request<PickResponse>('POST', '/api/system/pick-save-file', options).then(r => r.path)

// ---------- záloha hry ----------

/** Zabalí celou složku hry do zipu na dané absolutní cestě */
export const backupGame = (game: string, targetPath: string) =>
  request<BackupGameResponse>('POST', `${gamePath(game)}/backup`, { targetPath })

// ---------- hry ----------

export const listGames = () => request<GameMeta[]>('GET', '/api/games')
export const createGame = (name: string) => request<GameDetail>('POST', '/api/games', { name })
export const getGame = (game: string) => request<GameDetail>('GET', gamePath(game))
export const renameGame = (game: string, name: string) => request<GameMeta>('PATCH', gamePath(game), { name })
export const deleteGame = (game: string) => request<void>('DELETE', gamePath(game))

// ---------- setup (pozadí, aktuální vypravěč) ----------

export const saveSetup = (game: string, settings: GameSettings) => request<GameSetup>('PUT', `${gamePath(game)}/setup`, settings)

// ---------- postavy ----------

export const createCharacter = (game: string, input: CharacterInput) =>
  request<Character>('POST', `${gamePath(game)}/characters`, input)
export const updateCharacter = (game: string, characterId: string, input: CharacterInput) =>
  request<Character>('PUT', `${gamePath(game)}/characters/${encodeURIComponent(characterId)}`, input)
export const deleteCharacter = (game: string, characterId: string) =>
  request<void>('DELETE', `${gamePath(game)}/characters/${encodeURIComponent(characterId)}`)

// ---------- vypravěči ----------

export const createNarrator = (game: string, input: NarratorInput) =>
  request<Narrator>('POST', `${gamePath(game)}/narrators`, input)
export const updateNarrator = (game: string, narratorId: string, input: NarratorInput) =>
  request<Narrator>('PUT', `${gamePath(game)}/narrators/${encodeURIComponent(narratorId)}`, input)
export const deleteNarrator = (game: string, narratorId: string) =>
  request<void>('DELETE', `${gamePath(game)}/narrators/${encodeURIComponent(narratorId)}`)

// ---------- obrázky ----------

export async function uploadAsset(game: string, kind: AssetKind, file: Blob, filename: string, ownerName?: string): Promise<ImageRef> {
  const form = new FormData()
  form.append('kind', kind)
  if (ownerName) form.append('ownerName', ownerName)
  form.append('file', file, filename)
  const result = await request<AssetResponse>('POST', `${gamePath(game)}/assets`, form)
  bumpAssetVersion()
  return result.path
}

export async function assetFromUrl(game: string, kind: AssetKind, url: string, ownerName?: string): Promise<ImageRef> {
  const result = await request<AssetResponse>('POST', `${gamePath(game)}/assets/from-url`, { kind, url, ownerName })
  bumpAssetVersion()
  return result.path
}

/**
 * Uloží obrázek zadaný jako File, data: URL nebo http(s) URL do vaultu
 * a vrátí odkaz použitelný v GameSetup. `ownerName` = celé jméno postavy (portrait) / jméno vypravěče (narrator) / název scény (scene).
 */
export async function storeImage(game: string, kind: AssetKind, image: File | string, ownerName?: string): Promise<ImageRef> {
  if (image instanceof File) return uploadAsset(game, kind, image, image.name, ownerName)
  if (image.startsWith('data:') || image.startsWith('blob:')) {
    const blob = await (await fetch(image)).blob()
    const ext = blob.type.split('/')[1]?.replace('jpeg', 'jpg') || 'png'
    return uploadAsset(game, kind, blob, `obrazek.${ext}`, ownerName)
  }
  if (/^https?:/i.test(image)) return assetFromUrl(game, kind, image, ownerName)
  return image
}

// Verze obrázků: soubor ve vaultu má po přepsání stejnou cestu, takže by prohlížeč
// zobrazoval starou verzi z cache. Po každém uploadu / načtení z vaultu verzi zvýšíme
// a přidáme ji do URL jako ?v=.
let assetVersion = Date.now()
const assetVersionListeners = new Set<() => void>()

export function bumpAssetVersion(): void {
  assetVersion = Date.now()
  assetVersionListeners.forEach(listener => listener())
}

/** React hook – aktuální verze obrázků; změna vyvolá překreslení komponenty. */
export function useAssetVersion(): number {
  return useSyncExternalStore(
    listener => {
      assetVersionListeners.add(listener)
      return () => assetVersionListeners.delete(listener)
    },
    () => assetVersion
  )
}

/** Převod odkazu na obrázek (cesta ve vaultu / vzdálená URL) na URL použitelnou v <img>. */
export function assetUrl(game: string, ref: ImageRef, version: number = assetVersion): string | null {
  if (!ref) return null
  if (isRemoteImage(ref)) return ref
  const encodedPath = ref.split('/').map(encodeURIComponent).join('/')
  return `${API_BASE}/vault/${encodeURIComponent(game)}/${encodedPath}?v=${version}${vaultQuery('&')}`
}

// ---------- scény ----------

export const listScenes = (game: string) => request<SceneMeta[]>('GET', `${gamePath(game)}/scenes`)
export const createScene = (game: string, input: SceneInput) => request<SceneMeta>('POST', `${gamePath(game)}/scenes`, input)
export const updateScene = (game: string, sceneId: string, input: SceneInput) =>
  request<SceneMeta>('PATCH', `${gamePath(game)}/scenes/${encodeURIComponent(sceneId)}`, input)
export const getSceneEntries = (game: string, sceneId: string) =>
  request<StoryEntry[]>('GET', `${gamePath(game)}/scenes/${encodeURIComponent(sceneId)}`)
export const saveSceneEntries = (game: string, sceneId: string, entries: StoryEntry[]) =>
  request<void>('PUT', `${gamePath(game)}/scenes/${encodeURIComponent(sceneId)}`, entries)
export const deleteScene = (game: string, sceneId: string) =>
  request<void>('DELETE', `${gamePath(game)}/scenes/${encodeURIComponent(sceneId)}`)

// ---------- AI vypravěč ----------

/** Nechá aktuálního vypravěče odpovědět (OpenRouter); vrací nové záznamy, které BE už připsal do scény */
export const generateAiReply = (game: string, sceneId: string) =>
  request<AiGenerateResponse>('POST', `${gamePath(game)}/scenes/${encodeURIComponent(sceneId)}/ai`)

/** Nechá AI shrnout děj scény (nic neukládá – výsledek se vloží do pole „Shrnutí“ v dialogu scény) */
export const summarizeScene = (game: string, sceneId: string) =>
  request<SceneSummaryResponse>('POST', `${gamePath(game)}/scenes/${encodeURIComponent(sceneId)}/summary`)

// ---------- dějové nitě (threads) ----------

export const listThreads = (game: string) => request<StoryThread[]>('GET', `${gamePath(game)}/threads`)
export const createThread = (game: string, input: ThreadInput) => request<StoryThread>('POST', `${gamePath(game)}/threads`, input)
export const updateThread = (game: string, threadId: string, input: ThreadInput) =>
  request<StoryThread>('PUT', `${gamePath(game)}/threads/${encodeURIComponent(threadId)}`, input)
export const deleteThread = (game: string, threadId: string) =>
  request<void>('DELETE', `${gamePath(game)}/threads/${encodeURIComponent(threadId)}`)

// ---------- frakce (factions) ----------

export const listFactions = (game: string) => request<Faction[]>('GET', `${gamePath(game)}/factions`)
export const createFaction = (game: string, input: FactionInput) => request<Faction>('POST', `${gamePath(game)}/factions`, input)
export const updateFaction = (game: string, factionId: string, input: FactionInput) =>
  request<Faction>('PUT', `${gamePath(game)}/factions/${encodeURIComponent(factionId)}`, input)
export const deleteFaction = (game: string, factionId: string) =>
  request<void>('DELETE', `${gamePath(game)}/factions/${encodeURIComponent(factionId)}`)

// ---------- questy (quests) ----------

export const listQuests = (game: string) => request<Quest[]>('GET', `${gamePath(game)}/quests`)
export const createQuest = (game: string, input: QuestInput) => request<Quest>('POST', `${gamePath(game)}/quests`, input)
export const updateQuest = (game: string, questId: string, input: QuestInput) =>
  request<Quest>('PUT', `${gamePath(game)}/quests/${encodeURIComponent(questId)}`, input)
export const deleteQuest = (game: string, questId: string) =>
  request<void>('DELETE', `${gamePath(game)}/quests/${encodeURIComponent(questId)}`)

// ---------- lokace (locations) ----------

export const listLocations = (game: string) => request<StoryLocation[]>('GET', `${gamePath(game)}/locations`)
export const createLocation = (game: string, input: LocationInput) => request<StoryLocation>('POST', `${gamePath(game)}/locations`, input)
export const updateLocation = (game: string, locationId: string, input: LocationInput) =>
  request<StoryLocation>('PUT', `${gamePath(game)}/locations/${encodeURIComponent(locationId)}`, input)
export const deleteLocation = (game: string, locationId: string) =>
  request<void>('DELETE', `${gamePath(game)}/locations/${encodeURIComponent(locationId)}`)

// ---------- lore ----------

export const listLore = (game: string) => request<LoreEntry[]>('GET', `${gamePath(game)}/lore`)
export const createLore = (game: string, input: LoreInput) => request<LoreEntry>('POST', `${gamePath(game)}/lore`, input)
export const updateLore = (game: string, loreId: string, input: LoreInput) =>
  request<LoreEntry>('PUT', `${gamePath(game)}/lore/${encodeURIComponent(loreId)}`, input)
export const deleteLore = (game: string, loreId: string) =>
  request<void>('DELETE', `${gamePath(game)}/lore/${encodeURIComponent(loreId)}`)

// ---------- herní sezení (stopky) ----------

export const listSessions = (game: string) => request<GameSession[]>('GET', `${gamePath(game)}/sessions`)
export const createSession = (game: string, input: GameSessionInput) => request<GameSession>('POST', `${gamePath(game)}/sessions`, input)
export const updateSession = (game: string, sessionId: string, input: GameSessionInput) =>
  request<GameSession>('PUT', `${gamePath(game)}/sessions/${encodeURIComponent(sessionId)}`, input)
export const deleteSession = (game: string, sessionId: string) =>
  request<void>('DELETE', `${gamePath(game)}/sessions/${encodeURIComponent(sessionId)}`)

// ---------- změny ve vaultu ----------

/**
 * Přihlásí se k hlášení změn souborů hry (SSE). `onChange` dostane relativní cesty změněných souborů.
 * Vrací funkci pro odhlášení.
 */
export function subscribeVaultChanges(game: string, onChange: (paths: string[]) => void): () => void {
  const source = new EventSource(`${API_BASE}${gamePath(game)}/events${vaultQuery('?')}`)
  source.addEventListener('change', (event) => {
    try {
      const data = JSON.parse((event as MessageEvent<string>).data) as { paths?: string[] }
      onChange(data.paths ?? [])
    } catch {
      onChange([])
    }
  })
  return () => source.close()
}
