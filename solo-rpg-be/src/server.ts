import Fastify from 'fastify'
import cors from '@fastify/cors'
import multipart from '@fastify/multipart'
import fastifyStatic from '@fastify/static'
import { loadConfig } from './config.js'
import { ObsidianVaultProvider } from './vault/ObsidianVaultProvider.js'
import { GameWatcher } from './vault/GameWatcher.js'
import { registerGameRoutes } from './routes/games.js'

const config = loadConfig()
const storage = new ObsidianVaultProvider(config.vaultPath)
await storage.init()
const watcher = new GameWatcher(config.vaultPath)

const app = Fastify({
  logger: { level: 'info', transport: { target: 'pino-pretty', options: { translateTime: 'HH:MM:ss', ignore: 'pid,hostname' } } },
  bodyLimit: 10 * 1024 * 1024,
})

await app.register(cors, { origin: true })
await app.register(multipart)

// Obrázky a soubory z vaultu: /vault/<Hra>/portraits/Aria.png
await app.register(fastifyStatic, {
  root: config.vaultPath,
  prefix: '/vault/',
  decorateReply: false,
  index: false,
  list: false,
  cacheControl: false,
})

app.get('/api/health', async () => ({ ok: true, vaultPath: config.vaultPath }))

await registerGameRoutes(app, storage, watcher)
app.addHook('onClose', async () => watcher.closeAll())

try {
  await app.listen({ port: config.port, host: '127.0.0.1' })
  app.log.info(`Vault: ${config.vaultPath}`)
} catch (error) {
  app.log.error(error)
  process.exit(1)
}
