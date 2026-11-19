import { createClient, type Client } from '@libsql/client'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { initDatabase, type Database } from './init'

/** Banco real em arquivo temporário (transações do libsql abrem outra conexão). Só para testes. */
export async function openTestDatabase(): Promise<{ db: Database; client: Client; close(): void }> {
  const dir = mkdtempSync(join(tmpdir(), 'bakasub-test-'))
  const client = createClient({ url: `file:${join(dir, 't.db')}` })
  const db = await initDatabase(client, resolve('drizzle'))
  return {
    db,
    client,
    close() {
      client.close()
      rmSync(dir, { recursive: true, force: true })
    }
  }
}
