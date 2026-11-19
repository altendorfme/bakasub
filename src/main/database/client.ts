import { createClient, type Client } from '@libsql/client'
import { pathToFileURL } from 'node:url'
import { paths } from '../config/paths'
import { logger } from '../logging/logger'
import { initDatabase, type Database } from './init'

export type { Database } from './init'

export interface DatabaseHandle {
  db: Database
  close(): Promise<void>
}

export async function openDatabase(): Promise<DatabaseHandle> {
  const client: Client = createClient({ url: pathToFileURL(paths.database()).href })

  const db: Database = await initDatabase(client, paths.migrations())
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
