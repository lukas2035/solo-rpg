import type { FastifyInstance, FastifyReply } from 'fastify'
import { z } from 'zod'
import {
  AssetFromUrlRequestSchema,
  AssetKindSchema,
  CreateGameRequestSchema,
  CreateSceneRequestSchema,
  GameSetupSchema,
  RenameGameRequestSchema,
  StoryEntrySchema,
  isValidGameName,
} from '@solo-rpg/shared'
import { ConflictError, NotFoundError, ValidationError, type StorageProvider } from '../vault/StorageProvider.js'

const MAX_IMAGE_BYTES = 25 * 1024 * 1024

const GameParams = z.object({ game: z.string().min(1) })
const SceneParams = GameParams.extend({ scene: z.string().min(1) })

function sendError(reply: FastifyReply, error: unknown): FastifyReply {
  if (error instanceof z.ZodError) return reply.code(400).send({ error: z.prettifyError(error) })
  if (error instanceof ValidationError) return reply.code(400).send({ error: error.message })
  if (error instanceof NotFoundError) return reply.code(404).send({ error: error.message })
  if (error instanceof ConflictError) return reply.code(409).send({ error: error.message })
  reply.log.error(error)
  return reply.code(500).send({ error: error instanceof Error ? error.message : 'Neznámá chyba.' })
}

export async function registerGameRoutes(app: FastifyInstance, storage: StorageProvider): Promise<void> {
  app.setErrorHandler((error, _request, reply) => sendError(reply, error))

  // ---------- hry ----------

  app.get('/api/games', async () => storage.listGames())

  app.post('/api/games', async (request, reply) => {
    const { name } = CreateGameRequestSchema.parse(request.body)
    if (!isValidGameName(name)) throw new ValidationError('Název hry obsahuje nepovolené znaky (\\ / : * ? " < > | # ^ [ ]).')
    return reply.code(201).send(await storage.createGame(name))
  })

  app.get('/api/games/:game', async (request, reply) => {
    const { game } = GameParams.parse(request.params)
    const detail = await storage.getGame(game)
    if (!detail) return reply.code(404).send({ error: `Hra „${game}“ neexistuje.` })
    return detail
  })

  app.patch('/api/games/:game', async (request) => {
    const { game } = GameParams.parse(request.params)
    const { name } = RenameGameRequestSchema.parse(request.body)
    if (!isValidGameName(name)) throw new ValidationError('Název hry obsahuje nepovolené znaky (\\ / : * ? " < > | # ^ [ ]).')
    return storage.renameGame(game, name)
  })

  app.delete('/api/games/:game', async (request, reply) => {
    const { game } = GameParams.parse(request.params)
    await storage.deleteGame(game)
    return reply.code(204).send()
  })

  // ---------- setup ----------

  app.put('/api/games/:game/setup', async (request) => {
    const { game } = GameParams.parse(request.params)
    const setup = GameSetupSchema.parse(request.body)
    return storage.saveSetup(game, setup)
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
    const path = await storage.saveAsset(game, {
      kind,
      characterName: fieldValue('characterName'),
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
      const path = await storage.saveAsset(game, { kind: body.kind, characterName: body.characterName, filename, mimeType, data })
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
    return storage.listScenes(game)
  })

  app.post('/api/games/:game/scenes', async (request, reply) => {
    const { game } = GameParams.parse(request.params)
    const { title } = CreateSceneRequestSchema.parse(request.body)
    return reply.code(201).send(await storage.createScene(game, title))
  })

  app.get('/api/games/:game/scenes/:scene', async (request, reply) => {
    const { game, scene } = SceneParams.parse(request.params)
    const entries = await storage.getSceneEntries(game, scene)
    if (!entries) return reply.code(404).send({ error: `Scéna „${scene}“ neexistuje.` })
    return entries
  })

  app.put('/api/games/:game/scenes/:scene', async (request, reply) => {
    const { game, scene } = SceneParams.parse(request.params)
    const entries = z.array(StoryEntrySchema).parse(request.body)
    await storage.saveSceneEntries(game, scene, entries)
    return reply.code(204).send()
  })

  app.delete('/api/games/:game/scenes/:scene', async (request, reply) => {
    const { game, scene } = SceneParams.parse(request.params)
    await storage.deleteScene(game, scene)
    return reply.code(204).send()
  })
}
