/**
 * Import her z Obsidian vaultu (v1) do Postgresu.
 *
 *   npm run import:vault -- [--vault <cesta>] [--game <název>] [--replace]
 *
 * Bez `--game` importuje všechny hry ve vaultu. `--replace` přepíše hru, která už v databázi je.
 */
import path from 'node:path'
import { loadConfig } from '../src/config.js'
import { openDatabase } from '../src/storage/db.js'
import { FsAssetStore } from '../src/storage/AssetStore.js'
import { PostgresProvider } from '../src/storage/PostgresProvider.js'
import { VaultImporter } from '../src/storage/VaultImporter.js'

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`)
  return i >= 0 ? process.argv[i + 1] : undefined
}

const config = loadConfig()
const vaultPath = path.resolve(arg('vault') ?? config.vaultPath)
const only = arg('game')
const replace = process.argv.includes('--replace')

const database = await openDatabase(config.databaseUrl)
try {
  const storage = new PostgresProvider(database.db, new FsAssetStore(path.join(config.dataDir, 'assets')))
  const importer = new VaultImporter(vaultPath, storage)
  const games = only ? [only] : await importer.listGames()
  if (games.length === 0) console.log(`Ve vaultu „${vaultPath}“ nejsou žádné hry.`)
  for (const game of games) {
    console.log(`\n=== ${game} ===`)
    const report = await importer.importGame(game, { replace, log: m => console.log('  ' + m) })
    for (const missing of report.missingAssets) console.warn(`  ! chybí obrázek: ${missing}`)
  }
} finally {
  await database.close()
}
