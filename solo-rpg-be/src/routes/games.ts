import type { FastifyInstance, FastifyReply } from 'fastify'
import { z } from 'zod'
import {
  AssetFromUrlRequestSchema,
  AssetKindSchema,
  CharacterInputSchema,
  CreateGameRequestSchema,
  GameSettingsSchema,
  NarratorInputSchema,
  RenameGameRequestSchema,
  SceneInputSchema,
  StoryEntrySchema,
  ThreadInputSchema,
  FactionInputSchema,
  QuestInputSchema,
  LocationInputSchema,
  LoreInputSchema,
  GameSessionInputSchema,
  BackupGameRequestSchema,
  isValidGameName,
} from '@solo-rpg/shared'
import { ConflictError, NotFoundError, ValidationError } from '../vault/StorageProvider.js'
import type { VaultManager } from '../vault/VaultManager.js'
import { backupGameFolder } from '../vault/backup.js'
import { DialogBusyError } from '../system/dialogs.js'
import type { Config } from '../config.js'
import { AiError } from '../ai/openRouter.js'
import { generateSceneReply } from '../ai/sceneAi.js'
import { summarizeScene } from '../ai/sceneSummary.js'

const MAX_IMAGE_BYTES = 25 * 1024 * 1024
const SSE_HEARTBEAT_MS = 25_000
const MUTATING_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE'])

const GameParams = z.object({ game: z.string().min(1) })
const SceneParams = GameParams.extend({ scene: z.string().min(1) })
const CharacterParams = GameParams.extend({ character: z.string().min(1) })
const NarratorParams = GameParams.extend({ narrator: z.string().min(1) })
const ThreadParams = GameParams.extend({ thread: z.string().min(1) })
const FactionParams = GameParams.extend({ faction: z.string().min(1) })
const QuestParams = GameParams.extend({ quest: z.string().min(1) })
const LocationParams = GameParams.extend({ location: z.string().min(1) })
const LoreParams = GameParams.extend({ lore: z.string().min(1) })
const SessionParams = GameParams.extend({ session: z.string().min(1) })

function sendError(reply: FastifyReply, error: unknown): FastifyReply {
  if (error instanceof z.ZodError) return reply.code(400).send({ error: z.prettifyError(error) })
  if (error instanceof ValidationError) return reply.code(400).send({ error: error.message })
  if (error instanceof NotFoundError) return reply.code(404).send({ error: error.message })
  if (error instanceof ConflictError) return reply.code(409).send({ error: error.message })
  if (error instanceof DialogBusyError) return reply.code(409).send({ error: error.message })
  if (error instanceof AiError) return reply.code(error.status).send({ error: error.message })
  // Chyby Fastify / @fastify/static s vlastním HTTP kódem (nevalidní JSON, 403 mimo kořen, …)
  const statusCode = (error as { statusCode?: unknown }).statusCode
  if (typeof statusCode === 'number' && statusCode >= 400 && statusCode < 500) {
    return reply.code(statusCode).send({ error: error instanceof Error ? error.message : String(error) })
  }
  reply.log.error(error)
  return reply.code(500).send({ error: error instanceof Error ? error.message : 'Neznámá chyba.' })
}

export async function registerGameRoutes(app: FastifyInstance, vault: VaultManager, config: Config): Promise<void> {
  app.setErrorHandler((error, _request, reply) => sendError(reply, error))

  // Vlastní zápisy BE do složky hry nemají vyvolat hlášení „změna ve vaultu“ – utišit watcher před i po zpracování
  const noteOwnChange = (request: { method: string; params: unknown }) => {
    if (!MUTATING_METHODS.has(request.method)) return
    const params = request.params as { game?: unknown } | undefined
    if (typeof params?.game === 'string') vault.watcher.noteOwnChange(params.game)
  }
  app.addHook('preHandler', async (request) => noteOwnChange(request))
  app.addHook('onResponse', async (request) => noteOwnChange(request))

  // ---------- změny ve vaultu (SSE) ----------

  app.get('/api/games/:game/events', async (request, reply) => {
    const { game } = GameParams.parse(request.params)
    if (!(await vault.storage.getGame(game))) return reply.code(404).send({ error: `Hra „${game}“ neexistuje.` })

    // Stream si obsluhujeme sami přes raw response
    reply.hijack()
    reply.raw.writeHead(200, {
      'content-type': 'text/event-stream; charset=utf-8',
      'cache-control': 'no-cache, no-transform',
      connection: 'keep-alive',
      'access-control-allow-origin': (request.headers.origin as string | undefined) ?? '*',
      'access-control-allow-credentials': 'true',
    })
    reply.raw.write('retry: 3000\n\n')

    const unsubscribe = vault.watcher.subscribe(game, paths => {
      reply.raw.write(`event: change\ndata: ${JSON.stringify({ paths })}\n\n`)
    })
    const heartbeat = setInterval(() => reply.raw.write(': ping\n\n'), SSE_HEARTBEAT_MS)

    request.raw.on('close', () => {
      clearInterval(heartbeat)
      unsubscribe?.()
    })
  })

  // ---------- hry ----------

  app.get('/api/games', async () => vault.storage.listGames())

  app.post('/api/games', async (request, reply) => {
    const { name } = CreateGameRequestSchema.parse(request.body)
    if (!isValidGameName(name)) throw new ValidationError('Název hry obsahuje nepovolené znaky (\\ / : * ? " < > | # ^ [ ]).')
    return reply.code(201).send(await vault.storage.createGame(name))
  })

  app.get('/api/games/:game', async (request, reply) => {
    const { game } = GameParams.parse(request.params)
    const detail = await vault.storage.getGame(game)
    if (!detail) return reply.code(404).send({ error: `Hra „${game}“ neexistuje.` })
    return detail
  })

  app.patch('/api/games/:game', async (request) => {
    const { game } = GameParams.parse(request.params)
    const { name } = RenameGameRequestSchema.parse(request.body)
    if (!isValidGameName(name)) throw new ValidationError('Název hry obsahuje nepovolené znaky (\\ / : * ? " < > | # ^ [ ]).')
    return vault.storage.renameGame(game, name)
  })

  app.delete('/api/games/:game', async (request, reply) => {
    const { game } = GameParams.parse(request.params)
    await vault.storage.deleteGame(game)
    return reply.code(204).send()
  })

  // Záloha: celá složka hry zabalená do zipu na cestě zvolené uživatelem
  app.post('/api/games/:game/backup', async (request, reply) => {
    const { game } = GameParams.parse(request.params)
    const { targetPath } = BackupGameRequestSchema.parse(request.body)
    if (!(await vault.storage.getGame(game))) return reply.code(404).send({ error: `Hra „${game}“ neexistuje.` })
    return reply.code(201).send(await backupGameFolder(vault.gameDir(game), game, targetPath))
  })

  // ---------- setup (pozadí, aktuální vypravěč) ----------

  app.put('/api/games/:game/setup', async (request) => {
    const { game } = GameParams.parse(request.params)
    const settings = GameSettingsSchema.parse(request.body)
    return vault.storage.saveSetup(game, settings)
  })

  // ---------- postavy ----------

  app.post('/api/games/:game/characters', async (request, reply) => {
    const { game } = GameParams.parse(request.params)
    const input = CharacterInputSchema.parse(request.body)
    return reply.code(201).send(await vault.storage.createCharacter(game, input))
  })

  app.put('/api/games/:game/characters/:character', async (request) => {
    const { game, character } = CharacterParams.parse(request.params)
    const input = CharacterInputSchema.parse(request.body)
    return vault.storage.updateCharacter(game, character, input)
  })

  app.delete('/api/games/:game/characters/:character', async (request, reply) => {
    const { game, character } = CharacterParams.parse(request.params)
    await vault.storage.deleteCharacter(game, character)
    return reply.code(204).send()
  })

  // ---------- vypravěči ----------

  app.post('/api/games/:game/narrators', async (request, reply) => {
    const { game } = GameParams.parse(request.params)
    const input = NarratorInputSchema.parse(request.body)
    return reply.code(201).send(await vault.storage.createNarrator(game, input))
  })

  app.put('/api/games/:game/narrators/:narrator', async (request) => {
    const { game, narrator } = NarratorParams.parse(request.params)
    const input = NarratorInputSchema.parse(request.body)
    return vault.storage.updateNarrator(game, narrator, input)
  })

  app.delete('/api/games/:game/narrators/:narrator', async (request, reply) => {
    const { game, narrator } = NarratorParams.parse(request.params)
    await vault.storage.deleteNarrator(game, narrator)
    return reply.code(204).send()
  })

  // ---------- obrázky ----------

  app.post('/api/games/:game/assets', async (request) => {
    const { game } = GameParams.parse(request.params)
    const file = await request.file({ limits: { fileSize: MAX_IMAGE_BYTES } })
    if (!file) throw new ValidationError('Chybí soubor s obrázkem.')

    const fieldValue = (key: string): string | undefined => {
      const field = file.fields[key]
      const single = Array.isArray(field) ? field[0] : field
      return single && 'value' in single && typeof single.value === 'string' ? single.value : undefined
    }

    const kind = AssetKindSchema.parse(fieldValue('kind'))
    const data = await file.toBuffer()
    if (!file.mimetype.startsWith('image/') && !/\.(png|jpe?g|jfif|gif|webp|avif|bmp|svg)$/i.test(file.filename)) {
      throw new ValidationError('Soubor není obrázek.')
    }
    const path = await vault.storage.saveAsset(game, {
      kind,
      ownerName: fieldValue('ownerName') ?? fieldValue('characterName'),
      filename: file.filename,
      mimeType: file.mimetype,
      data,
    })
    return { path }
  })

  app.post('/api/games/:game/assets/from-url', async (request) => {
    const { game } = GameParams.parse(request.params)
    const body = AssetFromUrlRequestSchema.parse(request.body)

    try {
      const response = await fetch(body.url, { signal: AbortSignal.timeout(15_000) })
      if (!response.ok) throw new Error(`HTTP ${response.status}`)
      const mimeType = response.headers.get('content-type')?.split(';')[0] ?? undefined
      if (mimeType && !mimeType.startsWith('image/')) throw new Error(`Není obrázek (${mimeType})`)
      const data = Buffer.from(await response.arrayBuffer())
      if (data.byteLength > MAX_IMAGE_BYTES) throw new Error('Obrázek je příliš velký.')
      const filename = decodeURIComponent(new URL(body.url).pathname.split('/').pop() || 'obrazek')
      const path = await vault.storage.saveAsset(game, { kind: body.kind, ownerName: body.ownerName, filename, mimeType, data })
      return { path }
    } catch (error) {
      // Stažení se nepovedlo – ponecháme vzdálenou URL, aby hra fungovala dál
      request.log.warn({ err: error, url: body.url }, 'Stažení obrázku z URL selhalo, ukládám odkaz')
      return { path: body.url }
    }
  })

  // ---------- scény ----------

  app.get('/api/games/:game/scenes', async (request) => {
    const { game } = GameParams.parse(request.params)
    return vault.storage.listScenes(game)
  })

  app.post('/api/games/:game/scenes', async (request, reply) => {
    const { game } = GameParams.parse(request.params)
    const input = SceneInputSchema.parse(request.body)
    return reply.code(201).send(await vault.storage.createScene(game, input))
  })

  app.patch('/api/games/:game/scenes/:scene', async (request) => {
    const { game, scene } = SceneParams.parse(request.params)
    const input = SceneInputSchema.parse(request.body)
    return vault.storage.updateScene(game, scene, input)
  })

  app.get('/api/games/:game/scenes/:scene', async (request, reply) => {
    const { game, scene } = SceneParams.parse(request.params)
    const entries = await vault.storage.getSceneEntries(game, scene)
    if (!entries) return reply.code(404).send({ error: `Scéna „${scene}“ neexistuje.` })
    return entries
  })

  app.put('/api/games/:game/scenes/:scene', async (request, reply) => {
    const { game, scene } = SceneParams.parse(request.params)
    const entries = z.array(StoryEntrySchema).parse(request.body)
    await vault.storage.saveSceneEntries(game, scene, entries)
    return reply.code(204).send()
  })

  app.delete('/api/games/:game/scenes/:scene', async (request, reply) => {
    const { game, scene } = SceneParams.parse(request.params)
    await vault.storage.deleteScene(game, scene)
    return reply.code(204).send()
  })

  // ---------- AI vypravěč ----------

  /** Nechá aktuálního vypravěče odpovědět přes OpenRouter; nové záznamy se rovnou uloží do scény */
  app.post('/api/games/:game/scenes/:scene/ai', async (request) => {
    const { game, scene } = SceneParams.parse(request.params)
    const result = await generateSceneReply(vault.storage, config, game, scene, request.log)
    // Zápis proběhl až po dlouhém volání modelu – utišit watcher znovu těsně před odpovědí
    vault.watcher.noteOwnChange(game)
    return result
  })

  // AI shrnutí děje scény – nic neukládá, FE výsledek vloží do dialogu scény
  app.post('/api/games/:game/scenes/:scene/summary', async (request) => {
    const { game, scene } = SceneParams.parse(request.params)
    return summarizeScene(vault.storage, config, game, scene, request.log)
  })

  // ---------- dějové nitě (threads) ----------

  app.get('/api/games/:game/threads', async (request) => {
    const { game } = GameParams.parse(request.params)
    return vault.storage.listThreads(game)
  })

  app.post('/api/games/:game/threads', async (request, reply) => {
    const { game } = GameParams.parse(request.params)
    const input = ThreadInputSchema.parse(request.body)
    return reply.code(201).send(await vault.storage.createThread(game, input))
  })

  app.put('/api/games/:game/threads/:thread', async (request) => {
    const { game, thread } = ThreadParams.parse(request.params)
    const input = ThreadInputSchema.parse(request.body)
    return vault.storage.updateThread(game, thread, input)
  })

  app.delete('/api/games/:game/threads/:thread', async (request, reply) => {
    const { game, thread } = ThreadParams.parse(request.params)
    await vault.storage.deleteThread(game, thread)
    return reply.code(204).send()
  })

  // ---------- frakce (factions) ----------

  app.get('/api/games/:game/factions', async (request) => {
    const { game } = GameParams.parse(request.params)
    return vault.storage.listFactions(game)
  })

  app.post('/api/games/:game/factions', async (request, reply) => {
    const { game } = GameParams.parse(request.params)
    const input = FactionInputSchema.parse(request.body)
    return reply.code(201).send(await vault.storage.createFaction(game, input))
  })

  app.put('/api/games/:game/factions/:faction', async (request) => {
    const { game, faction } = FactionParams.parse(request.params)
    const input = FactionInputSchema.parse(request.body)
    return vault.storage.updateFaction(game, faction, input)
  })

  app.delete('/api/games/:game/factions/:faction', async (request, reply) => {
    const { game, faction } = FactionParams.parse(request.params)
    await vault.storage.deleteFaction(game, faction)
    return reply.code(204).send()
  })

  // ---------- questy (quests) ----------

  app.get('/api/games/:game/quests', async (request) => {
    const { game } = GameParams.parse(request.params)
    return vault.storage.listQuests(game)
  })

  app.post('/api/games/:game/quests', async (request, reply) => {
    const { game } = GameParams.parse(request.params)
    const input = QuestInputSchema.parse(request.body)
    return reply.code(201).send(await vault.storage.createQuest(game, input))
  })

  app.put('/api/games/:game/quests/:quest', async (request) => {
    const { game, quest } = QuestParams.parse(request.params)
    const input = QuestInputSchema.parse(request.body)
    return vault.storage.updateQuest(game, quest, input)
  })

  app.delete('/api/games/:game/quests/:quest', async (request, reply) => {
    const { game, quest } = QuestParams.parse(request.params)
    await vault.storage.deleteQuest(game, quest)
    return reply.code(204).send()
  })

  // ---------- lokace (locations) ----------

  app.get('/api/games/:game/locations', async (request) => {
    const { game } = GameParams.parse(request.params)
    return vault.storage.listLocations(game)
  })

  app.post('/api/games/:game/locations', async (request, reply) => {
    const { game } = GameParams.parse(request.params)
    const input = LocationInputSchema.parse(request.body)
    return reply.code(201).send(await vault.storage.createLocation(game, input))
  })

  app.put('/api/games/:game/locations/:location', async (request) => {
    const { game, location } = LocationParams.parse(request.params)
    const input = LocationInputSchema.parse(request.body)
    return vault.storage.updateLocation(game, location, input)
  })

  app.delete('/api/games/:game/locations/:location', async (request, reply) => {
    const { game, location } = LocationParams.parse(request.params)
    await vault.storage.deleteLocation(game, location)
    return reply.code(204).send()
  })

  // ---------- lore ----------

  app.get('/api/games/:game/lore', async (request) => {
    const { game } = GameParams.parse(request.params)
    return vault.storage.listLore(game)
  })

  app.post('/api/games/:game/lore', async (request, reply) => {
    const { game } = GameParams.parse(request.params)
    const input = LoreInputSchema.parse(request.body)
    return reply.code(201).send(await vault.storage.createLore(game, input))
  })

  app.put('/api/games/:game/lore/:lore', async (request) => {
    const { game, lore } = LoreParams.parse(request.params)
    const input = LoreInputSchema.parse(request.body)
    return vault.storage.updateLore(game, lore, input)
  })

  app.delete('/api/games/:game/lore/:lore', async (request, reply) => {
    const { game, lore } = LoreParams.parse(request.params)
    await vault.storage.deleteLore(game, lore)
    return reply.code(204).send()
  })

  // ---------- herní sezení (stopky) ----------

  app.get('/api/games/:game/sessions', async (request) => {
    const { game } = GameParams.parse(request.params)
    return vault.storage.listSessions(game)
  })

  app.post('/api/games/:game/sessions', async (request, reply) => {
    const { game } = GameParams.parse(request.params)
    const input = GameSessionInputSchema.parse(request.body)
    return reply.code(201).send(await vault.storage.createSession(game, input))
  })

  app.put('/api/games/:game/sessions/:session', async (request) => {
    const { game, session } = SessionParams.parse(request.params)
    const input = GameSessionInputSchema.parse(request.body)
    return vault.storage.updateSession(game, session, input)
  })

  app.delete('/api/games/:game/sessions/:session', async (request, reply) => {
    const { game, session } = SessionParams.parse(request.params)
    await vault.storage.deleteSession(game, session)
    return reply.code(204).send()
  })
}
