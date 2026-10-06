import path from 'node:path'
import { fileURLToPath } from 'node:url'
import pg from 'pg'
import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres'
import { migrate } from 'drizzle-orm/node-postgres/migrator'
import * as schema from './schema.js'

export type Db = NodePgDatabase<typeof schema>

export interface Database {
  db: Db
  pool: pg.Pool
  close(): Promise<void>
}

const MIGRATIONS_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../drizzle')

/** Otevře pool a aplikuje čekající SQL migrace z `solo-rpg-be/drizzle` (generuje `npm run db:generate`). */
export async function openDatabase(connectionString: string): Promise<Database> {
  const pool = new pg.Pool({ connectionString, max: 10 })
  const db = drizzle(pool, { schema })
  await migrate(db, { migrationsFolder: MIGRATIONS_DIR })
  return { db, pool, close: () => pool.end() }
}
