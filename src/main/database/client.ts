import { createClient, type Client } from '@libsql/client'
import { drizzle, type LibSQLDatabase } from 'drizzle-orm/libsql'
import { migrate } from 'drizzle-orm/libsql/migrator'
import { pathToFileURL } from 'node:url'
import { paths } from '../config/paths'
import { logger } from '../logging/logger'
import * as schema from './schema'

export type Database = LibSQLDatabase<typeof schema>

export interface DatabaseHandle {
  db: Database
  close(): Promise<void>
}

export async function openDatabase(): Promise<DatabaseHandle> {
  const client: Client = createClient({ url: pathToFileURL(paths.database()).href })

  await client.execute('PRAGMA journal_mode = WAL')
  await client.execute('PRAGMA synchronous = NORMAL')
  await client.execute('PRAGMA foreign_keys = ON')
  await client.execute('PRAGMA busy_timeout = 5000')

  const db = drizzle(client, { schema })
  await migrate(db, { migrationsFolder: paths.migrations() })
  logger.db.info(`database ready at ${paths.database()}`)

  return {
    db,
    async close() {
      // Checkpoint antes de fechar para não deixar WAL grande/inconsistente.
      try {
        await client.execute('PRAGMA wal_checkpoint(TRUNCATE)')
      } finally {
        client.close()
      }
    }
  }
}
