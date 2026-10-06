import path from 'node:path'
import Fastify from 'fastify'
import cors from '@fastify/cors'
import multipart from '@fastify/multipart'
import { loadConfig } from './config.js'
import { VaultManager } from './vault/VaultManager.js'
import { registerGameRoutes } from './routes/games.js'
import { registerVaultRoutes } from './routes/vault.js'
import { openDatabase } from './storage/db.js'
import { FsAssetStore } from './storage/AssetStore.js'
import { PostgresProvider } from './storage/PostgresProvider.js'
import { ObsidianExporter } from './storage/ObsidianExporter.js'

const config = loadConfig()

// Úložiště: Postgres (migrace se aplikují při startu) + obrázky na disku v DATA_DIR/assets
const database = await openDatabase(config.databaseUrl)
const assetStore = new FsAssetStore(path.join(config.dataDir, 'assets'))
const storage = new PostgresProvider(database.db, assetStore)
const exporter = new ObsidianExporter(storage, assetStore)

// Výchozí složka pro export/zálohy do Obsidianu; FE ji může přepnout na složku uloženou v prohlížeči
const vault = await VaultManager.create(config.vaultPath, storage)

const app = Fastify({
  logger: { level: 'info', transport: { target: 'pino-pretty', options: { translateTime: 'HH:MM:ss', ignore: 'pid,hostname' } } },
  bodyLimit: 10 * 1024 * 1024,
})

await app.register(cors, { origin: true })
await app.register(multipart)

app.get('/api/health', async () => ({ ok: true, vaultPath: vault.path }))

await registerGameRoutes(app, vault, config, exporter)
await registerVaultRoutes(app, vault, { storage, assetStore })
app.addHook('onClose', async () => {
  vault.close()
  await database.close()
})

try {
  await app.listen({ port: config.port, host: '127.0.0.1' })
  app.log.info(`Databáze: ${config.databaseUrl.replace(/\/\/.*@/, '//***@')}, assety: ${path.resolve(config.dataDir, 'assets')}, export: ${vault.path}`)
} catch (error) {
  app.log.error(error)
  process.exit(1)
}
