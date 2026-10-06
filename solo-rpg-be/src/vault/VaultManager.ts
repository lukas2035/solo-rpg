import fs from 'node:fs/promises'
import path from 'node:path'
import type { StorageProvider } from './StorageProvider.js'
import { ValidationError } from './StorageProvider.js'
import type { ChangeListener } from './GameWatcher.js'

/** Hlášení změn hry pro SSE; s Postgresem jako úložištěm žádné vnější změny nevznikají, zůstává jen rozhraní */
export interface ChangeNotifier {
  noteOwnChange(game: string): void
  subscribe(game: string, listener: ChangeListener): (() => void) | null
  closeAll(): void
}

export class NoopNotifier implements ChangeNotifier {
  noteOwnChange(): void {}
  subscribe(): (() => void) | null {
    return () => undefined
  }
  closeAll(): void {}
}

/**
 * Drží úložiště her (Postgres) a aktuální složku pro export/zálohy do Obsidian vaultu.
 *
 * Cestu ke složce si pamatuje prohlížeč (localStorage) a posílá ji s každým požadavkem v hlavičce `x-vault-path`
 * (u SSE a obrázků v query `vault`). Dřív určovala, odkud se hry čtou; teď jen kam se exportují.
 */
export class VaultManager {
  private currentPath: string
  private switching: Promise<void> | null = null

  constructor(
    readonly defaultPath: string,
    readonly storage: StorageProvider,
    readonly watcher: ChangeNotifier = new NoopNotifier(),
  ) {
    this.currentPath = path.resolve(defaultPath)
  }

  static async create(defaultPath: string, storage: StorageProvider): Promise<VaultManager> {
    const resolved = path.resolve(defaultPath)
    await fs.mkdir(resolved, { recursive: true })
    return new VaultManager(resolved, storage)
  }

  /** Složka Obsidian vaultu pro export a zálohy */
  get path(): string {
    return this.currentPath
  }

  /** Absolutní cesta ke složce dané hry v exportním vaultu */
  gameDir(game: string): string {
    return path.join(this.currentPath, game)
  }

  /** Přepne exportní složku. Složka musí existovat (nebo `create = true`). */
  async use(requested: string, create = false): Promise<string> {
    const normalized = VaultManager.normalize(requested)
    if (normalized === this.currentPath) return normalized
    if (this.switching) await this.switching
    if (normalized === this.currentPath) return normalized

    this.switching = (async () => {
      await VaultManager.ensureDirectory(normalized, create)
      this.currentPath = normalized
    })()
    try {
      await this.switching
    } finally {
      this.switching = null
    }
    return normalized
  }

  close(): void {
    this.watcher.closeAll()
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
