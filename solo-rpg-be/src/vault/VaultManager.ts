import fs from 'node:fs/promises'
import path from 'node:path'
import { ObsidianVaultProvider } from './ObsidianVaultProvider.js'
import { GameWatcher } from './GameWatcher.js'
import { ValidationError, type StorageProvider } from './StorageProvider.js'

/**
 * Drží aktuálně otevřenou složku s hrami (vault) a k ní příslušný storage provider a watcher.
 *
 * Cestu si pamatuje prohlížeč (localStorage) a posílá ji s každým požadavkem v hlavičce `x-vault-path`
 * (u SSE a statických souborů v query `vault`). BE při změně cesty přepne provider i watcher.
 */
export class VaultManager {
  private current: { path: string; storage: StorageProvider; watcher: GameWatcher }
  private switching: Promise<void> | null = null

  private constructor(readonly defaultPath: string, initial: { path: string; storage: StorageProvider; watcher: GameWatcher }) {
    this.current = initial
  }

  static async create(defaultPath: string): Promise<VaultManager> {
    const resolved = path.resolve(defaultPath)
    const storage = new ObsidianVaultProvider(resolved)
    await storage.init()
    return new VaultManager(resolved, { path: resolved, storage, watcher: new GameWatcher(resolved) })
  }

  get path(): string {
    return this.current.path
  }

  get storage(): StorageProvider {
    return this.current.storage
  }

  get watcher(): GameWatcher {
    return this.current.watcher
  }

  /** Absolutní cesta ke složce dané hry v aktuálním vaultu */
  gameDir(game: string): string {
    return path.join(this.current.path, game)
  }

  /**
   * Přepne na jinou složku s hrami. Složka musí existovat (nebo `create = true`).
   * Opakované volání se stejnou cestou je bez efektu.
   */
  async use(requested: string, create = false): Promise<string> {
    const normalized = VaultManager.normalize(requested)
    if (normalized === this.current.path) return normalized
    if (this.switching) await this.switching
    if (normalized === this.current.path) return normalized

    this.switching = (async () => {
      await VaultManager.ensureDirectory(normalized, create)
      const storage = new ObsidianVaultProvider(normalized)
      await storage.init()
      const previous = this.current
      this.current = { path: normalized, storage, watcher: new GameWatcher(normalized) }
      previous.watcher.closeAll()
    })()
    try {
      await this.switching
    } finally {
      this.switching = null
    }
    return normalized
  }

  close(): void {
    this.current.watcher.closeAll()
  }

  static normalize(requested: string): string {
    const trimmed = requested.trim().replace(/^"(.*)"$/, '$1')
    if (!trimmed) throw new ValidationError('Cesta ke složce s hrami je prázdná.')
    if (!path.isAbsolute(trimmed)) throw new ValidationError('Cesta ke složce s hrami musí být absolutní (např. D:\\SoloRPG\\hry).')
    return path.resolve(trimmed)
  }

  private static async ensureDirectory(dir: string, create: boolean): Promise<void> {
    try {
      const stat = await fs.stat(dir)
      if (!stat.isDirectory()) throw new ValidationError(`„${dir}“ není složka.`)
      return
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
    }
    if (!create) throw new ValidationError(`Složka „${dir}“ neexistuje.`)
    await fs.mkdir(dir, { recursive: true })
  }
}
