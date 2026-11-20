import { createClient, type Client } from '@libsql/client'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { initDatabase } from '../database/init'
import { JobMemoryRepository } from '../database/repositories/job-memory.repository'
import { AppError } from '../errors'
import { srtFormat } from '../parsers/srt'
import { computeContextHashes } from './context-hash'
import { JobMemoryService, type MemoryContext } from './job-memory.service'

const DAY = 86_400_000
let dir: string
let client: Client
let now: number
let busy: boolean
let repo: JobMemoryRepository
let svc: JobMemoryService

beforeEach(async () => {
  dir = mkdtempSync(join(tmpdir(), 'bakasub-svc-'))
  client = createClient({ url: `file:${join(dir, 't.db')}` })
  const db = await initDatabase(client, resolve('drizzle'))
  now = 100 * DAY
  busy = false
  repo = new JobMemoryRepository(db, () => now)
  svc = new JobMemoryService(repo, { now: () => now, isBusy: () => busy })
})
afterEach(() => {
  client.close()
  rmSync(dir, { recursive: true, force: true })
})

const doc = srtFormat.parse(
  '1\n00:00:01,000 --> 00:00:02,000\nOlá <i>mundo</i> lindo hoje\n\n2\n00:00:03,000 --> 00:00:04,000\nTudo bem com você?\n'
)
const ctx = (over: Partial<Parameters<typeof JobMemoryService.context>[0]> = {}): MemoryContext =>
  JobMemoryService.context({
    targetLang: 'pt-br',
    model: 'm/a',
    glossary: [],
    lexInline: srtFormat.lexInline,
    ...over
  })

describe('JobMemoryService', () => {
  it('context canoniza idioma e glossário', () => {
    expect(ctx().key).toEqual({ targetLang: 'pt-BR', model: 'm/a', promptHash: '' })
  })

  it('miss total, commit e hit no reprocessamento', async () => {
    const c = ctx()
    const first = await svc.lookupDocument(doc, c)
    expect(first.hits.size).toBe(0)
    expect(first.misses.map((m) => m.cueId)).toEqual([1, 2])

    const r = await svc.commitChunk(c, [
      { hashed: first.misses[0], translated: 'Hello <g1>world</g1> beautiful today' },
      { hashed: first.misses[1], translated: 'All good with you?' }
    ])
    expect(r).toEqual({ written: 2, rejected: [] })

    const second = await svc.lookupDocument(doc, c)
    expect(second.misses).toEqual([])
    expect(second.hits.get(1)?.translated).toBe('Hello <g1>world</g1> beautiful today')
  })

  it('misses com o mesmo context hash: um representante e as cópias agrupadas', async () => {
    const sign = 'The village chief is watching us.'
    const d = srtFormat.parse(
      [sign, 'Fine, then.', sign, sign]
        .map((t, i) => `${i + 1}\n00:00:0${i},000 --> 00:00:0${i},500\n${t}\n`)
        .join('\n')
    )
    const r = await svc.lookupDocument(d, ctx())
    const ids = (us: readonly { cueId: number }[]): number[] => us.map((u) => u.cueId)
    expect(r.misses).toHaveLength(2)
    const [rep] = r.misses
    expect(rep.unit.payload).toBe(sign)
    expect(ids(r.copies.get(rep.cueId)!)).toHaveLength(2)
    expect(r.copies.size).toBe(1)
  })

  it('escritas simultâneas (lanes, jobs) vão em fila: sem SQLITE_BUSY', async () => {
    // Transações do libsql pegam conexões distintas do pool; sem a fila, a 2ª dá database locked.
    const c = ctx()
    const { misses } = await svc.lookupDocument(doc, c)
    const results = await Promise.all(
      Array.from({ length: 8 }, (_, i) =>
        svc.commitChunk(c, [{ hashed: misses[1], translated: `All good with you? ${i}` }])
      )
    )
    expect(results.every((r) => r.written === 1)).toBe(true)
    expect((await svc.lookupDocument(doc, c)).hits.get(2)?.translated).toBe('All good with you? 7')
  })

  it('hit atualiza last_used_at (sobrevive ao prune)', async () => {
    const c = ctx()
    const { misses } = await svc.lookupDocument(doc, c)
    await svc.commitChunk(c, [{ hashed: misses[1], translated: 'All good?' }])
    now += 10 * DAY
    await svc.lookupDocument(doc, c)
    now += DAY
    expect(await svc.prune(7)).toEqual({ deleted: 0 })
    now += 8 * DAY
    expect(await svc.prune(7)).toEqual({ deleted: 1 })
  })

  it('commit rejeita tradução que não valida contra o esqueleto e grava o resto', async () => {
    const c = ctx()
    const { misses } = await svc.lookupDocument(doc, c)
    const r = await svc.commitChunk(c, [
      { hashed: misses[0], translated: 'Hello world' }, // perdeu <g1>
      { hashed: misses[1], translated: 'All good?' }
    ])
    expect(r.written).toBe(1)
    expect(r.rejected).toEqual([1])
  })

  it('hit corrompido (não valida mais) conta como miss', async () => {
    const c = ctx()
    const [h1] = computeContextHashes(doc)
    await repo.upsertMany(c.key, [
      { contextHash: h1.hash, sourceText: h1.unit.payload, translatedText: 'sem marcador' }
    ])
    const r = await svc.lookupDocument(doc, c)
    expect(r.hits.has(1)).toBe(false)
    expect(r.misses.map((m) => m.cueId)).toContain(1)
  })

  it('modelo, idioma e glossário diferentes não compartilham cache', async () => {
    const c = ctx()
    const { misses } = await svc.lookupDocument(doc, c)
    await svc.commitChunk(c, [{ hashed: misses[1], translated: 'All good?' }])
    for (const other of [
      ctx({ model: 'm/b' }),
      ctx({ targetLang: 'pt-PT' }),
      ctx({ glossary: [{ source: 'senpai', rule: 'manter' }] })
    ])
      expect((await svc.lookupDocument(doc, other)).hits.size).toBe(0)
  })

  it('signal abortado: nada é gravado', async () => {
    const c = ctx()
    const { misses } = await svc.lookupDocument(doc, c)
    const ac = new AbortController()
    ac.abort()
    await expect(
      svc.commitChunk(c, [{ hashed: misses[1], translated: 'x' }], ac.signal)
    ).rejects.toMatchObject({ code: 'CANCELLED' })
    expect((await svc.stats()).rows).toBe(0)
  })

  it('dispose espera a escrita corrente e recusa novas', async () => {
    const c = ctx()
    const { misses } = await svc.lookupDocument(doc, c)
    const pending = svc.commitChunk(c, [{ hashed: misses[1], translated: 'All good?' }])
    await svc.dispose()
    await expect(pending).resolves.toMatchObject({ written: 1 })
    expect((await svc.stats()).rows).toBe(1)
    await expect(
      svc.commitChunk(c, [{ hashed: misses[1], translated: 'y' }])
    ).rejects.toMatchObject({ code: 'CANCELLED' })
  })

  it('prune bloqueado com job ativo', async () => {
    busy = true
    await expect(svc.prune('all')).rejects.toBeInstanceOf(AppError)
    await expect(svc.prune('all')).rejects.toMatchObject({ code: 'MEMORY_BUSY' })
  })
})

describe('lookupDocument com peek', () => {
  it('não atualiza last_used_at (preflight cancelado não segura entradas velhas)', async () => {
    const c = ctx()
    const { misses } = await svc.lookupDocument(doc, c)
    await svc.commitChunk(c, [{ hashed: misses[1], translated: 'All good?' }])
    now += 10 * DAY
    const r = await svc.lookupDocument(doc, c, { peek: true })
    expect(r.hits.size).toBe(1)
    expect(await svc.prune(7)).toEqual({ deleted: 1 })
  })
})
