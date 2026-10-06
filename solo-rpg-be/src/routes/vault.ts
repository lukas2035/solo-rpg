import type { FastifyInstance } from 'fastify'
import { PickFolderRequestSchema, PickSaveFileRequestSchema, SetVaultRequestSchema, type PickResponse, type VaultInfo } from '@solo-rpg/shared'
import type { VaultManager } from '../vault/VaultManager.js'
import type { PostgresProvider } from '../storage/PostgresProvider.js'
import type { AssetStore } from '../storage/AssetStore.js'
import * as dialogs from '../system/dialogs.js'

/** Hlavička, ve které FE posílá cestu ke složce s hrami uloženou v prohlížeči */
export const VAULT_HEADER = 'x-vault-path'
/** Query parametr se stejným významem – pro EventSource a <img>, kde hlavičky nastavit nejde */
export const VAULT_QUERY = 'vault'

export interface VaultRouteDeps {
  storage: PostgresProvider
  assetStore: AssetStore
}

export async function registerVaultRoutes(app: FastifyInstance, vault: VaultManager, deps: VaultRouteDeps): Promise<void> {
  // Každý požadavek může nést cestu k vaultu; pokud se liší od aktuální, BE přepne (složka musí existovat)
  app.addHook('onRequest', async (request) => {
    const header = request.headers[VAULT_HEADER]
    const query = (request.query as Record<string, unknown> | undefined)?.[VAULT_QUERY]
    const requested = typeof header === 'string' ? header : typeof query === 'string' ? query : null
    if (!requested) return
    const decoded = typeof header === 'string' ? decodeURIComponent(requested) : requested
    if (decoded.trim() === vault.path) return
    await vault.use(decoded)
  })

  const info = (): VaultInfo => ({ path: vault.path, defaultPath: vault.defaultPath, nativeDialogs: dialogs.isAvailable() })

  app.get('/api/vault', async () => info())

  app.put('/api/vault', async (request) => {
    const { path, create } = SetVaultRequestSchema.parse(request.body)
    await vault.use(path, create ?? false)
    return info()
  })

  // ---------- nativní dialogy (jen Windows; jinde 501 a FE nabídne ruční zadání) ----------

  app.post('/api/system/pick-folder', async (request, reply) => {
    if (!dialogs.isAvailable()) return reply.code(501).send({ error: 'Nativní výběr složky není na této platformě dostupný – zadej cestu ručně.' })
    const { title, initialPath } = PickFolderRequestSchema.parse(request.body ?? {})
    const path = await dialogs.pickFolder({ title, initialPath })
    return { path } satisfies PickResponse
  })

  app.post('/api/system/pick-save-file', async (request, reply) => {
    if (!dialogs.isAvailable()) return reply.code(501).send({ error: 'Nativní dialog „Uložit jako“ není na této platformě dostupný – zadej cestu ručně.' })
    const { title, fileName, initialDir, extension } = PickSaveFileRequestSchema.parse(request.body)
    const path = await dialogs.pickSaveFile({ title, fileName, initialDir, extension })
    return { path } satisfies PickResponse
  })

  // ---------- obrázky her: /vault/<Hra>/assets/<id>.<ext> (cesta `ImageRef` vrácená ze `saveAsset`) ----------

  app.get('/vault/:game/assets/:file', async (request, reply) => {
    const { game, file } = request.params as { game: string; file: string }
    const asset = await deps.storage.getAsset(game, file)
    if (!asset) return reply.code(404).send({ error: 'Obrázek neexistuje.' })
    const stream = await deps.assetStore.get(asset.storageKey)
    // Obsah je určený hashem – klient může cachovat dlouho
    return reply
      .header('content-type', asset.mime)
      .header('content-length', String(asset.size))
      .header('cache-control', 'public, max-age=31536000, immutable')
      .send(stream)
  })
}
