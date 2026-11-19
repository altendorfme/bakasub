import type { Client } from '@libsql/client'
import { drizzle, type LibSQLDatabase } from 'drizzle-orm/libsql'
import { migrate } from 'drizzle-orm/libsql/migrator'
import { readMigrationFiles } from 'drizzle-orm/migrator'
import * as schema from './schema'

/** Inclui `$client` (o drizzle já o expõe em runtime) para operações fora do query builder. */
export type Database = LibSQLDatabase<typeof schema> & { $client: Client }

/** `PRAGMA auto_vacuum`: 0 = NONE, 1 = FULL, 2 = INCREMENTAL. */
const AUTO_VACUUM_INCREMENTAL = 2

/**
 * PRAGMAs + migrações, sem dependência de Electron (testável com `file::memory:`).
 *
 * `auto_vacuum = INCREMENTAL` permite devolver ao disco as páginas liberadas pelo prune do
 * Job Memory com `PRAGMA incremental_vacuum`, sem reescrever o banco. Em um banco existente o
 * modo só vale após um `VACUUM`, executado uma única vez (antes de qualquer conexão concorrente).
 */
export async function initDatabase(client: Client, migrationsFolder: string): Promise<Database> {
  const av = await client.execute('PRAGMA auto_vacuum')
  if (Number(av.rows[0]?.auto_vacuum) !== AUTO_VACUUM_INCREMENTAL) {
    await client.execute('PRAGMA auto_vacuum = INCREMENTAL')
    await client.execute('VACUUM')
  }
  await client.execute('PRAGMA journal_mode = WAL')
  await client.execute('PRAGMA synchronous = NORMAL')
  await client.execute('PRAGMA foreign_keys = ON')
  await client.execute('PRAGMA busy_timeout = 5000')

  await assertMigrationHistory(client, migrationsFolder)
  const db = drizzle(client, { schema })
  await migrate(db, { migrationsFolder })
  return db
}

/** The database was migrated by migrations this build does not have (or has with other SQL). */
export class DatabaseSchemaMismatchError extends Error {
  readonly code = 'DB_SCHEMA_MISMATCH'
  constructor(readonly detail: string) {
    super(`Database migration history does not match this build: ${detail}`)
    this.name = 'DatabaseSchemaMismatchError'
  }
}

/**
 * Drizzle's migrator only compares the timestamp of the LAST applied migration with the local
 * ones, so a rewritten migration is either skipped silently or re-applied (and fails with
 * "table already exists"). Every applied migration must exist locally with the same hash.
 */
async function assertMigrationHistory(client: Client, migrationsFolder: string): Promise<void> {
  const table = await client.execute(
    "SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = '__drizzle_migrations'"
  )
  if (table.rows.length === 0) return
  const applied = await client.execute('SELECT hash, created_at FROM __drizzle_migrations')
  const local = new Map(
    readMigrationFiles({ migrationsFolder }).map((m) => [m.folderMillis, m.hash])
  )
  for (const row of applied.rows) {
    const at = Number(row.created_at)
    const hash = local.get(at)
    if (hash === undefined)
      throw new DatabaseSchemaMismatchError(`migration ${at} is not in this build`)
    if (hash !== String(row.hash))
      throw new DatabaseSchemaMismatchError(`migration ${at} was changed`)
  }
}
