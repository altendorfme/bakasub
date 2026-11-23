import { createClient, type Client } from '@libsql/client'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { initDatabase } from '../init'
import { JobMemoryRepository, type MemoryKey } from './job-memory.repository'

const DAY = 86_400_000
const KEY: MemoryKey = { targetLang: 'pt-BR', model: 'm/a', promptHash: '', mediaScope: '' }

let dir: string
let client: Client
let now: number
let repo: JobMemoryRepository

beforeEach(async () => {
  // Arquivo real: `client.transaction()` abre outra conexão, o que quebraria `:memory:`.
  dir = mkdtempSync(join(tmpdir(), 'bakasub-mem-'))
  client = createClient({ url: `file:${join(dir, 't.db')}` })
  const db = await initDatabase(client, resolve('drizzle'))
  now = 100 * DAY
  repo = new JobMemoryRepository(db, () => now)
})
afterEach(() => {
  client.close()
  try {
    rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 })
  } catch {
    /* Windows: libsql pode manter o arquivo aberto; limpeza best-effort */
  }
})

const entry = (
  h: string,
  t = `tr-${h}`
): { contextHash: string; sourceText: string; translatedText: string } => ({
  contextHash: h,
  sourceText: `src-${h}`,
  translatedText: t
})

describe('JobMemoryRepository', () => {
  it('upsertMany + lookupMany', async () => {
    await repo.upsertMany(KEY, [entry('a'), entry('b')])
    const hits = await repo.lookupMany(KEY, ['a', 'b', 'c'])
    expect([...hits.keys()].sort()).toEqual(['a', 'b'])
    expect(hits.get('a')).toMatchObject({ sourceText: 'src-a', translatedText: 'tr-a' })
  })

  it('upsert sobrescreve a tradução e atualiza updated_at', async () => {
    await repo.upsertMany(KEY, [entry('a', 'v1')])
    now += DAY
    await repo.upsertMany(KEY, [entry('a', 'v2')])
    const hit = (await repo.lookupMany(KEY, ['a'])).get('a')!
    expect(hit.translatedText).toBe('v2')
    expect(hit.updatedAt.getTime()).toBe(now)
    expect((await repo.stats()).rows).toBe(1)
  })

  it('cada componente da chave isola as entradas', async () => {
    await repo.upsertMany(KEY, [entry('a')])
    for (const k of [
      { ...KEY, targetLang: 'pt-PT' },
      { ...KEY, model: 'm/b' },
      { ...KEY, promptHash: 'g' },
      { ...KEY, mediaScope: 'tmdb:series:1' }
    ])
      expect((await repo.lookupMany(k, ['a'])).size).toBe(0)
  })

  it('mesma frase em duas obras: duas entradas; escopo vazio só casa com vazio', async () => {
    const a = { ...KEY, mediaScope: 'tmdb:series:1' }
    const b = { ...KEY, mediaScope: 'tmdb:series:2' }
    await repo.upsertMany(a, [entry('x', 'ele')])
    await repo.upsertMany(b, [entry('x', 'ela')])
    expect((await repo.lookupMany(a, ['x'])).get('x')?.translatedText).toBe('ele')
    expect((await repo.lookupMany(b, ['x'])).get('x')?.translatedText).toBe('ela')
    expect((await repo.lookupMany(KEY, ['x'])).size).toBe(0)
    expect((await repo.stats()).rows).toBe(2)
  })

  it('lookup com muitas chaves (acima do limite de variáveis por statement)', async () => {
    const many = Array.from({ length: 1200 }, (_, i) => entry(`h${i}`))
    await repo.upsertMany(KEY, many)
    const hits = await repo.lookupMany(
      KEY,
      many.map((e) => e.contextHash)
    )
    expect(hits.size).toBe(1200)
  })

  it('upsertMany é atômico: falha no meio não grava nada', async () => {
    const bad = [entry('a'), { ...entry('b'), translatedText: null as unknown as string }]
    await expect(repo.upsertMany(KEY, bad)).rejects.toThrow()
    expect((await repo.stats()).rows).toBe(0)
  })

  it('touch atualiza last_used_at; prune remove os não usados há mais de N dias', async () => {
    await repo.upsertMany(KEY, [entry('velho'), entry('usado'), entry('novo')])
    now += 10 * DAY
    const hits = await repo.lookupMany(KEY, ['usado'])
    await repo.touch([hits.get('usado')!.id])
    await repo.upsertMany(KEY, [entry('novo')])
    now += 2 * DAY

    const r = await repo.prune({ olderThan: new Date(now - 7 * DAY) })
    expect(r.deleted).toBe(1)
    expect([...(await repo.lookupMany(KEY, ['velho', 'usado', 'novo'])).keys()].sort()).toEqual([
      'novo',
      'usado'
    ])
  })

  it("prune 'all' esvazia a tabela", async () => {
    await repo.upsertMany(KEY, [entry('a'), entry('b')])
    expect(await repo.prune('all')).toEqual({ deleted: 2 })
    expect((await repo.stats()).rows).toBe(0)
  })

  it('stats: linhas, bytes reais (dbstat) e entrada mais antiga; prune devolve páginas ao disco', async () => {
    expect(await repo.stats()).toMatchObject({ rows: 0, oldestUsedAt: null })
    const big = Array.from({ length: 2000 }, (_, i) => entry(`h${i}`, 'x'.repeat(500)))
    await repo.upsertMany(KEY, big)
    const before = await repo.stats()
    expect(before.rows).toBe(2000)
    expect(before.bytes).toBeGreaterThan(1_000_000)
    expect(before.oldestUsedAt?.getTime()).toBe(now)

    const pagesBefore = Number((await client.execute('PRAGMA page_count')).rows[0].page_count)
    await repo.prune('all')
    const pagesAfter = Number((await client.execute('PRAGMA page_count')).rows[0].page_count)
    expect(pagesAfter).toBeLessThan(pagesBefore / 4)
    expect((await repo.stats()).bytes).toBeLessThan(before.bytes / 4)
  })
})
