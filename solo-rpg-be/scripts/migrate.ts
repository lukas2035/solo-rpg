/** Aplikuje čekající migrace (totéž dělá server při startu) */
import { loadConfig } from '../src/config.js'
import { openDatabase } from '../src/storage/db.js'

const config = loadConfig()
const database = await openDatabase(config.databaseUrl)
await database.close()
console.log('Migrace aplikovány.')
