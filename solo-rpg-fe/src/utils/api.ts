import type {
  AssetKind,
  AssetResponse,
  GameDetail,
  GameMeta,
  GameSetup,
  ImageRef,
  SceneMeta,
  StoryEntry,
} from '@solo-rpg/shared'
import { isRemoteImage } from '@solo-rpg/shared'

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

async function request<T>(method: string, url: string, body?: unknown): Promise<T> {
  const response = await fetch(`${API_BASE}${url}`, {
    method,
    headers: body instanceof FormData || body === undefined ? undefined : { 'content-type': 'application/json' },
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

// ---------- hry ----------

export const listGames = () => request<GameMeta[]>('GET', '/api/games')
export const createGame = (name: string) => request<GameDetail>('POST', '/api/games', { name })
export const getGame = (game: string) => request<GameDetail>('GET', gamePath(game))
export const renameGame = (game: string, name: string) => request<GameMeta>('PATCH', gamePath(game), { name })
export const deleteGame = (game: string) => request<void>('DELETE', gamePath(game))

// ---------- setup ----------

export const saveSetup = (game: string, setup: GameSetup) => request<GameSetup>('PUT', `${gamePath(game)}/setup`, setup)

// ---------- obrázky ----------

export async function uploadAsset(game: string, kind: AssetKind, file: Blob, filename: string, characterName?: string): Promise<ImageRef> {
  const form = new FormData()
  form.append('kind', kind)
  if (characterName) form.append('characterName', characterName)
  form.append('file', file, filename)
  const result = await request<AssetResponse>('POST', `${gamePath(game)}/assets`, form)
  return result.path
}

export async function assetFromUrl(game: string, kind: AssetKind, url: string, characterName?: string): Promise<ImageRef> {
  const result = await request<AssetResponse>('POST', `${gamePath(game)}/assets/from-url`, { kind, url, characterName })
  return result.path
}

/**
 * Uloží obrázek zadaný jako File, data: URL nebo http(s) URL do vaultu
 * a vrátí odkaz použitelný v GameSetup.
 */
export async function storeImage(game: string, kind: AssetKind, image: File | string, characterName?: string): Promise<ImageRef> {
  if (image instanceof File) return uploadAsset(game, kind, image, image.name, characterName)
  if (image.startsWith('data:') || image.startsWith('blob:')) {
    const blob = await (await fetch(image)).blob()
    const ext = blob.type.split('/')[1]?.replace('jpeg', 'jpg') || 'png'
    return uploadAsset(game, kind, blob, `obrazek.${ext}`, characterName)
  }
  if (/^https?:/i.test(image)) return assetFromUrl(game, kind, image, characterName)
  return image
}

/** Převod odkazu na obrázek (cesta ve vaultu / vzdálená URL) na URL použitelnou v <img>. */
export function assetUrl(game: string, ref: ImageRef): string | null {
  if (!ref) return null
  if (isRemoteImage(ref)) return ref
  const encodedPath = ref.split('/').map(encodeURIComponent).join('/')
  return `${API_BASE}/vault/${encodeURIComponent(game)}/${encodedPath}`
}

// ---------- scény ----------

export const listScenes = (game: string) => request<SceneMeta[]>('GET', `${gamePath(game)}/scenes`)
export const createScene = (game: string, title: string) => request<SceneMeta>('POST', `${gamePath(game)}/scenes`, { title })
export const getSceneEntries = (game: string, sceneId: string) =>
  request<StoryEntry[]>('GET', `${gamePath(game)}/scenes/${encodeURIComponent(sceneId)}`)
export const saveSceneEntries = (game: string, sceneId: string, entries: StoryEntry[]) =>
  request<void>('PUT', `${gamePath(game)}/scenes/${encodeURIComponent(sceneId)}`, entries)
export const deleteScene = (game: string, sceneId: string) =>
  request<void>('DELETE', `${gamePath(game)}/scenes/${encodeURIComponent(sceneId)}`)
