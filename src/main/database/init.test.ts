import { createClient } from '@libsql/client'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { initDatabase } from './init'

const MIGRATIONS = resolve('drizzle')

describe('initDatabase', () => {
  it('aplica migrações, auto_vacuum INCREMENTAL e a chave nova do job_memory', async () => {
    const client = createClient({ url: 'file::memory:' })
    await initDatabase(client, MIGRATIONS)

    const av = await client.execute('PRAGMA auto_vacuum')
    expect(Number(av.rows[0].auto_vacuum)).toBe(2)

    const cols = (await client.execute('PRAGMA table_info(job_memory)')).rows.map((r) => r.name)
    expect(cols).toEqual(
      expect.arrayContaining(['prompt_hash', 'last_used_at', 'updated_at', 'model'])
    )

    const idx = await client.execute(
      "SELECT name FROM pragma_index_list('job_memory') WHERE \"unique\" = 1 AND origin = 'c'"
    )
    const [{ name }] = idx.rows
    const keyCols = (await client.execute(`PRAGMA index_info(${String(name)})`)).rows.map(
      (r) => r.name
    )
    expect(keyCols).toEqual(['context_hash', 'target_lang', 'model', 'prompt_hash'])
    client.close()
  })

  it('é idempotente (segundo boot não reaplica nem falha)', async () => {
    const client = createClient({ url: 'file::memory:' })
    await initDatabase(client, MIGRATIONS)
    await expect(initDatabase(client, MIGRATIONS)).resolves.toBeDefined()
    client.close()
  })

  it('cria settings, secrets e presets (só personalizados)', async () => {
    const client = createClient({ url: 'file::memory:' })
    await initDatabase(client, MIGRATIONS)
    const cols = async (t: string): Promise<unknown[]> =>
      (await client.execute(`PRAGMA table_info(${t})`)).rows.map((r) => r.name)
    expect(await cols('settings')).toEqual(['key', 'value', 'updated_at'])
    expect(await cols('secrets')).toEqual([
      'key',
      'ciphertext',
      'iv',
      'tag',
      'key_version',
      'updated_at'
    ])
    expect(await cols('presets')).toEqual(
      expect.arrayContaining(['media_type', 'temperature', 'prompt', 'glossary', 'copied_from'])
    )
    client.close()
  })

  it('a migration applied here but changed or gone locally is a clear DB_SCHEMA_MISMATCH', async () => {
    const client = createClient({ url: 'file::memory:' })
    await initDatabase(client, MIGRATIONS)
    // Simulates a dev database migrated by an older, since regenerated, 0000.
    await client.execute('UPDATE __drizzle_migrations SET created_at = created_at - 1000')
    await expect(initDatabase(client, MIGRATIONS)).rejects.toMatchObject({
      code: 'DB_SCHEMA_MISMATCH'
    })
    client.close()
  })

  it('same timestamp but a different hash is also a mismatch', async () => {
    const client = createClient({ url: 'file::memory:' })
    await initDatabase(client, MIGRATIONS)
    await client.execute("UPDATE __drizzle_migrations SET hash = 'edited'")
    await expect(initDatabase(client, MIGRATIONS)).rejects.toMatchObject({
      code: 'DB_SCHEMA_MISMATCH'
    })
    client.close()
  })

  it('re-opening an up-to-date database is a no-op', async () => {
    const client = createClient({ url: 'file::memory:' })
    await initDatabase(client, MIGRATIONS)
    await expect(initDatabase(client, MIGRATIONS)).resolves.toBeDefined()
    client.close()
  })
})
