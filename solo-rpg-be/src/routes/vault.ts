import type { FastifyInstance } from 'fastify'
import fastifyStatic from '@fastify/static'
import { PickFolderRequestSchema, PickSaveFileRequestSchema, SetVaultRequestSchema, type PickResponse, type VaultInfo } from '@solo-rpg/shared'
import type { VaultManager } from '../vault/VaultManager.js'
import * as dialogs from '../system/dialogs.js'

/** Hlavička, ve které FE posílá cestu ke složce s hrami uloženou v prohlížeči */
export const VAULT_HEADER = 'x-vault-path'
/** Query parametr se stejným významem – pro EventSource a <img>, kde hlavičky nastavit nejde */
export const VAULT_QUERY = 'vault'

export async function registerVaultRoutes(app: FastifyInstance, vault: VaultManager): Promise<void> {
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

  // ---------- obrázky a soubory z vaultu: /vault/<Hra>/portraits/Aria.png ----------

  // `serve: false` – soubory posíláme sami, aby kořen odpovídal právě otevřené složce s hrami
  await app.register(fastifyStatic, { root: vault.defaultPath, serve: false, index: false, list: false, cacheControl: false })

  app.get('/vault/*', async (request, reply) => {
    const rel = (request.params as { '*': string })['*']
    return reply.sendFile(rel, vault.path)
  })
}
