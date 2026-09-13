import fs from 'node:fs/promises'
import path from 'node:path'

/** Odstraní znaky nepovolené v názvech souborů (Windows + Obsidian wikilinky). */
export function safeFileName(name: string, fallback = 'bez-nazvu'): string {
  const cleaned = name
    .replace(/[\\/:*?"<>|#^[\]]/g, '-')
    .replace(/\s+/g, ' ')
    .replace(/^\.+/, '')
    .trim()
  return cleaned || fallback
}

export async function exists(p: string): Promise<boolean> {
  try {
    await fs.access(p)
    return true
  } catch {
    return false
  }
}

export async function ensureDir(p: string): Promise<void> {
  await fs.mkdir(p, { recursive: true })
}

/** Atomický zápis – nejdřív do temp souboru, pak přejmenování. */
export async function writeFileAtomic(filePath: string, data: string | Buffer): Promise<void> {
  await ensureDir(path.dirname(filePath))
  const tmp = `${filePath}.${process.pid}.${Date.now()}.tmp`
  await fs.writeFile(tmp, data)
  await fs.rename(tmp, filePath)
}

export async function readTextIfExists(filePath: string): Promise<string | null> {
  try {
    return await fs.readFile(filePath, 'utf8')
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null
    throw error
  }
}

export async function listFiles(dir: string, ext?: string): Promise<string[]> {
  try {
    const entries = await fs.readdir(dir, { withFileTypes: true })
    return entries
      .filter(e => e.isFile() && (!ext || e.name.toLowerCase().endsWith(ext)))
      .map(e => e.name)
      .sort((a, b) => a.localeCompare(b, 'cs'))
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return []
    throw error
  }
}

export async function removeIfExists(p: string): Promise<void> {
  await fs.rm(p, { force: true, recursive: true })
}

/** Ověří, že `target` leží uvnitř `root` (ochrana proti path traversal). */
export function assertInside(root: string, target: string): void {
  const rel = path.relative(root, target)
  if (rel.startsWith('..') || path.isAbsolute(rel)) {
    throw new Error('Cesta míří mimo vault.')
  }
}

const MIME_EXT: Record<string, string> = {
  'image/png': '.png',
  'image/jpeg': '.jpg',
  'image/gif': '.gif',
  'image/webp': '.webp',
  'image/avif': '.avif',
  'image/bmp': '.bmp',
  'image/svg+xml': '.svg',
}

export function imageExtension(filename: string, mimeType?: string): string {
  const fromName = path.extname(filename).toLowerCase()
  if (/^\.(png|jpe?g|jfif|gif|webp|avif|bmp|svg)$/.test(fromName)) return fromName === '.jpeg' || fromName === '.jfif' ? '.jpg' : fromName
  if (mimeType && MIME_EXT[mimeType.toLowerCase()]) return MIME_EXT[mimeType.toLowerCase()]
  return '.png'
}
