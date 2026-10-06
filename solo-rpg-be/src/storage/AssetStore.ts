import { createHash } from 'node:crypto'
import fs from 'node:fs/promises'
import { createReadStream } from 'node:fs'
import path from 'node:path'
import type { Readable } from 'node:stream'

/**
 * Úložiště binárních assetů (obrázky). Rozhraní je tvarované podle S3 (docs/ARCHITECTURE_V2.md §2.3):
 * klíč je neměnný content hash, žádné přejmenování, žádný výpis – seznam drží DB (tabulka `assets`).
 * Dnes `FsAssetStore` (složka na disku), v cloudu `S3AssetStore` (R2) se stejnými testy.
 */
export interface AssetStore {
  put(key: string, body: Buffer, meta: { contentType: string }): Promise<void>
  get(key: string): Promise<Readable>
  head(key: string): Promise<{ size: number } | null>
  delete(key: string): Promise<void>
}

export function sha256(data: Buffer): string {
  return createHash('sha256').update(data).digest('hex')
}

/** Klíč `ab/cd/<sha256><ext>` – dvě úrovně prefixu, aby složky nebobtnaly */
export function assetKey(hash: string, ext: string): string {
  return `${hash.slice(0, 2)}/${hash.slice(2, 4)}/${hash}${ext}`
}

export class FsAssetStore implements AssetStore {
  constructor(private readonly root: string) {}

  private resolve(key: string): string {
    if (!/^[0-9a-f]{2}\/[0-9a-f]{2}\/[0-9a-f]{64}\.[a-z0-9]+$/.test(key)) throw new Error(`Neplatný klíč assetu: ${key}`)
    return path.join(this.root, ...key.split('/'))
  }

  async put(key: string, body: Buffer): Promise<void> {
    const target = this.resolve(key)
    await fs.mkdir(path.dirname(target), { recursive: true })
    // Obsah je určený hashem – existující soubor je identický
    try {
      await fs.access(target)
      return
    } catch {
      /* neexistuje */
    }
    const tmp = `${target}.${process.pid}.${Date.now()}.tmp`
    await fs.writeFile(tmp, body)
    await fs.rename(tmp, target)
  }

  async get(key: string): Promise<Readable> {
    const target = this.resolve(key)
    await fs.access(target)
    return createReadStream(target)
  }

  async head(key: string): Promise<{ size: number } | null> {
    try {
      const stat = await fs.stat(this.resolve(key))
      return { size: stat.size }
    } catch {
      return null
    }
  }

  async delete(key: string): Promise<void> {
    await fs.rm(this.resolve(key), { force: true })
  }
}
