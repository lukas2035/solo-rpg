/**
 * Starší úložiště v prohlížeči (IndexedDB). Používá se už jen pro jednorázový
 * import her do Obsidian vaultu – viz `importLegacyGames.ts`.
 */
const DB_NAME = 'solo-rpg'
const STORE_NAME = 'setup'
const STORY_STORE_NAME = 'story'
const GAMES_STORE_NAME = 'games'
/** Jméno hry, pod které se přesunou data uložená starší verzí aplikace */
const LEGACY_GAME_NAME = 'Původní hra'

export interface StoredCharacter {
  id: string
  name: string
  /** Blob = binárka obrázku, string = vzdálená URL */
  image: Blob | string | null
}

export interface StoredSetup {
  characters: StoredCharacter[]
  backgroundImage: Blob | string | null
  /** Zesvětlené pozadí (checkbox); u starších dat může chybět */
  brightBackground?: boolean
  /** Vlastní jméno a portrét vypravěče (DM); u starších dat může chybět */
  dm?: {
    name: string
    image: Blob | string | null
  }
}

export interface StoredStoryEntry {
  id: string
  /** null = vypravěč (DM) */
  characterName: string | null
  text: string
  timestamp: number
  /** Text je víceřádkový markdown; u starších dat může chybět */
  markdown?: boolean
}

export interface GameMeta {
  name: string
  /** Čas posledního uložení (setup nebo příběh) */
  updatedAt: number
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 3)
    request.onupgradeneeded = (event) => {
      const db = request.result
      const tx = request.transaction
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME)
      }
      if (!db.objectStoreNames.contains(STORY_STORE_NAME)) {
        db.createObjectStore(STORY_STORE_NAME)
      }
      if (!db.objectStoreNames.contains(GAMES_STORE_NAME)) {
        db.createObjectStore(GAMES_STORE_NAME)
      }
      // Migrace dat ze starší verze (klíč 'current' → jméno hry)
      if (event.oldVersion > 0 && event.oldVersion < 3 && tx) {
        const migrate = (storeName: string) => {
          const store = tx.objectStore(storeName)
          const get = store.get('current')
          get.onsuccess = () => {
            if (get.result !== undefined) {
              store.put(get.result, LEGACY_GAME_NAME)
              store.delete('current')
              tx.objectStore(GAMES_STORE_NAME).put(
                { name: LEGACY_GAME_NAME, updatedAt: Date.now() } satisfies GameMeta,
                LEGACY_GAME_NAME
              )
            }
          }
        }
        migrate(STORE_NAME)
        migrate(STORY_STORE_NAME)
      }
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

/** Uloží hodnotu pod jménem hry a zároveň aktualizuje metadata hry (datum uložení). */
async function putForGame(storeName: string, gameName: string, value: unknown): Promise<void> {
  const db = await openDb()
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction([storeName, GAMES_STORE_NAME], 'readwrite')
      tx.objectStore(storeName).put(value, gameName)
      tx.objectStore(GAMES_STORE_NAME).put(
        { name: gameName, updatedAt: Date.now() } satisfies GameMeta,
        gameName
      )
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error)
    })
  } finally {
    db.close()
  }
}

async function getForGame(storeName: string, gameName: string): Promise<unknown> {
  const db = await openDb()
  try {
    return await new Promise<unknown>((resolve, reject) => {
      const tx = db.transaction(storeName, 'readonly')
      const request = tx.objectStore(storeName).get(gameName)
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => reject(request.error)
    })
  } finally {
    db.close()
  }
}

export async function saveSetup(gameName: string, setup: StoredSetup): Promise<void> {
  await putForGame(STORE_NAME, gameName, setup)
}

export async function loadSetup(gameName: string): Promise<StoredSetup | null> {
  const result = await getForGame(STORE_NAME, gameName)
  return isValidSetup(result) ? result : null
}

export async function saveStory(gameName: string, entries: StoredStoryEntry[]): Promise<void> {
  await putForGame(STORY_STORE_NAME, gameName, entries)
}

export async function loadStory(gameName: string): Promise<StoredStoryEntry[] | null> {
  const result = await getForGame(STORY_STORE_NAME, gameName)
  return isValidStory(result) ? result : null
}

/** Vymaže příběh dané hry (nastavení hry zůstává). */
export async function clearStory(gameName: string): Promise<void> {
  const db = await openDb()
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORY_STORE_NAME, 'readwrite')
      tx.objectStore(STORY_STORE_NAME).delete(gameName)
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error)
    })
  } finally {
    db.close()
  }
}

/** Seznam všech uložených her, seřazený od nejnovější. */
export async function listGames(): Promise<GameMeta[]> {
  const db = await openDb()
  try {
    const result = await new Promise<unknown[]>((resolve, reject) => {
      const tx = db.transaction(GAMES_STORE_NAME, 'readonly')
      const request = tx.objectStore(GAMES_STORE_NAME).getAll()
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => reject(request.error)
    })
    return result
      .filter(isValidGameMeta)
      .sort((a, b) => b.updatedAt - a.updatedAt)
  } finally {
    db.close()
  }
}

/** Přejmenuje hru – přesune nastavení, příběh i metadata pod nový klíč (atomicky v jedné transakci). */
export async function renameGame(oldName: string, newName: string): Promise<void> {
  if (oldName === newName) return
  const db = await openDb()
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction([STORE_NAME, STORY_STORE_NAME, GAMES_STORE_NAME], 'readwrite')
      const games = tx.objectStore(GAMES_STORE_NAME)
      const existing = games.get(newName)
      existing.onsuccess = () => {
        if (existing.result !== undefined) {
          reject(new Error(`Hra „${newName}" už existuje.`))
          tx.abort()
          return
        }
        const move = (storeName: string) => {
          const store = tx.objectStore(storeName)
          const get = store.get(oldName)
          get.onsuccess = () => {
            if (get.result !== undefined) {
              store.put(get.result, newName)
              store.delete(oldName)
            }
          }
        }
        move(STORE_NAME)
        move(STORY_STORE_NAME)
        games.delete(oldName)
        games.put({ name: newName, updatedAt: Date.now() } satisfies GameMeta, newName)
      }
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error)
      tx.onabort = () => reject(tx.error ?? new Error('Přejmenování bylo zrušeno.'))
    })
  } finally {
    db.close()
  }
}

/** Smaže hru včetně nastavení i příběhu. */
export async function deleteGame(gameName: string): Promise<void> {
  const db = await openDb()
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction([STORE_NAME, STORY_STORE_NAME, GAMES_STORE_NAME], 'readwrite')
      tx.objectStore(STORE_NAME).delete(gameName)
      tx.objectStore(STORY_STORE_NAME).delete(gameName)
      tx.objectStore(GAMES_STORE_NAME).delete(gameName)
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error)
    })
  } finally {
    db.close()
  }
}

function isValidGameMeta(value: unknown): value is GameMeta {
  if (typeof value !== 'object' || value === null) return false
  const meta = value as GameMeta
  return typeof meta.name === 'string' && typeof meta.updatedAt === 'number'
}

function isValidImage(value: unknown): value is Blob | string | null {
  return value === null || typeof value === 'string' || value instanceof Blob
}

function isValidSetup(value: unknown): value is StoredSetup {
  if (typeof value !== 'object' || value === null) return false
  const setup = value as StoredSetup
  return (
    Array.isArray(setup.characters) &&
    setup.characters.length > 0 &&
    setup.characters.every(
      c =>
        typeof c === 'object' && c !== null &&
        typeof c.id === 'string' &&
        typeof c.name === 'string' &&
        isValidImage(c.image)
    ) &&
    isValidImage(setup.backgroundImage) &&
    (setup.brightBackground === undefined || typeof setup.brightBackground === 'boolean') &&
    (setup.dm === undefined ||
      (typeof setup.dm === 'object' && setup.dm !== null &&
        typeof setup.dm.name === 'string' && isValidImage(setup.dm.image)))
  )
}

function isValidStory(value: unknown): value is StoredStoryEntry[] {
  return (
    Array.isArray(value) &&
    value.every(
      e =>
        typeof e === 'object' && e !== null &&
        typeof e.id === 'string' &&
        (e.characterName === null || typeof e.characterName === 'string') &&
        typeof e.text === 'string' &&
        typeof e.timestamp === 'number' &&
        (e.markdown === undefined || typeof e.markdown === 'boolean')
    )
  )
}
