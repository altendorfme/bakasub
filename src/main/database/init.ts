import type { Client } from '@libsql/client'
import { drizzle, type LibSQLDatabase } from 'drizzle-orm/libsql'
import { migrate } from 'drizzle-orm/libsql/migrator'
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

  const db = drizzle(client, { schema })
  await migrate(db, { migrationsFolder })
  return db
}
