import fs from 'node:fs'
import fsp from 'node:fs/promises'
import path from 'node:path'
import { ZipArchive } from 'archiver'
import { NotFoundError, ValidationError } from '../vault/StorageProvider.js'

export interface BackupResult {
  path: string
  bytes: number
}

/**
 * Zabalí celou složku hry (včetně obrázků a podsložek) do zip archivu na dané cestě.
 * V archivu je složka hry jako kořenová položka, aby šla po rozbalení rovnou vložit do vaultu.
 */
export async function backupGameFolder(gameDir: string, gameName: string, targetPath: string): Promise<BackupResult> {
  const target = path.resolve(targetPath.trim())
  if (!path.isAbsolute(targetPath.trim())) throw new ValidationError('Cesta k záloze musí být absolutní.')
  if (path.extname(target).toLowerCase() !== '.zip') throw new ValidationError('Záloha musí mít příponu .zip.')

  const relative = path.relative(gameDir, target)
  if (relative && !relative.startsWith('..') && !path.isAbsolute(relative)) {
    throw new ValidationError('Zálohu nelze uložit do složky zálohované hry.')
  }

  try {
    if (!(await fsp.stat(gameDir)).isDirectory()) throw new NotFoundError(`Hra „${gameName}“ neexistuje.`)
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') throw new NotFoundError(`Hra „${gameName}“ neexistuje.`)
    throw error
  }
  try {
    if (!(await fsp.stat(path.dirname(target))).isDirectory()) throw new ValidationError(`Cílová složka „${path.dirname(target)}“ neexistuje.`)
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') throw new ValidationError(`Cílová složka „${path.dirname(target)}“ neexistuje.`)
    throw error
  }

  // Zápis do dočasného souboru a přejmenování, aby po chybě nezůstal poškozený archiv
  const tmp = `${target}.tmp`
  const output = fs.createWriteStream(tmp)
  const archive = new ZipArchive({ zlib: { level: 9 } })

  const finished = new Promise<void>((resolve, reject) => {
    output.on('close', resolve)
    output.on('error', reject)
    archive.on('error', reject)
    archive.on('warning', (error: { code?: string }) => {
      if (error.code === 'ENOENT') return
      reject(error)
    })
  })

  archive.pipe(output)
  archive.directory(gameDir, gameName)
  try {
    await archive.finalize()
    await finished
    await fsp.rm(target, { force: true })
    await fsp.rename(tmp, target)
  } catch (error) {
    await fsp.rm(tmp, { force: true })
    throw error
  }
  const stat = await fsp.stat(target)
  return { path: target, bytes: stat.size }
}
