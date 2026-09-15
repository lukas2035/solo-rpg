import Fastify from 'fastify'
import cors from '@fastify/cors'
import multipart from '@fastify/multipart'
import { loadConfig } from './config.js'
import { VaultManager } from './vault/VaultManager.js'
import { registerGameRoutes } from './routes/games.js'
import { registerVaultRoutes } from './routes/vault.js'

const config = loadConfig()
// Výchozí složka s hrami z konfigurace; FE ji může přepnout na složku uloženou v prohlížeči
const vault = await VaultManager.create(config.vaultPath)

const app = Fastify({
  logger: { level: 'info', transport: { target: 'pino-pretty', options: { translateTime: 'HH:MM:ss', ignore: 'pid,hostname' } } },
  bodyLimit: 10 * 1024 * 1024,
})

await app.register(cors, { origin: true })
await app.register(multipart)

app.get('/api/health', async () => ({ ok: true, vaultPath: vault.path }))

await registerGameRoutes(app, vault, config)
await registerVaultRoutes(app, vault)
app.addHook('onClose', async () => vault.close())

try {
  await app.listen({ port: config.port, host: '127.0.0.1' })
  app.log.info(`Vault: ${vault.path}`)
} catch (error) {
  app.log.error(error)
  process.exit(1)
}
