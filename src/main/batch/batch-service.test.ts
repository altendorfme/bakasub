import { mkdirSync, mkdtempSync, writeFileSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { JobResult } from '../../shared/ipc-contract'
import { TEST_PRESET, testPresetSource } from '../presets/test-presets'
import { BatchRepository } from '../database/repositories/batch.repository'
import { JobRepository } from '../database/repositories/job.repository'
import { openTestDatabase } from '../database/test-db'
import { AppError } from '../errors'
import { JobManager } from '../jobs/job-manager'
import { StepFailure, type RunHooks, type RunOutcome } from '../jobs/job-runner'
import type { JobSpec } from '../jobs/job-spec'
import type { MkvInfo } from '../media/mkv-probe'
import { BatchService, type BatchServiceDeps } from './batch-service'

const tracks = (lang: string): MkvInfo => ({
  attachments: 0,
  subtitles: [
    {
      id: 2,
      codecId: 'S_TEXT/UTF8',
      format: 'srt',
      language: lang,
      default: false,
      forced: false,
      eventCount: 300
    },
    {
      id: 3,
      codecId: 'S_TEXT/ASS',
      format: 'ass',
      language: lang,
      default: true,
      forced: false,
      eventCount: 300
    },
    {
      id: 4,
      codecId: 'S_HDMV/PGS',
      format: null,
      unsupported: 'image-based',
      default: false,
      forced: false
    }
  ]
})

let t: Awaited<ReturnType<typeof openTestDatabase>>
let root: string
let out: string
let runs: { spec: JobSpec; hooks: RunHooks; resolve(o: RunOutcome): void }[]
let jobs: JobManager
let svc: BatchService
let probe: ReturnType<typeof vi.fn>

async function until(cond: () => boolean | Promise<boolean>): Promise<void> {
  const end = Date.now() + 3000
  while (!(await cond())) {
    if (Date.now() > end) throw new Error('timeout')
    await new Promise((r) => setTimeout(r, 5))
  }
}

beforeEach(async () => {
  t = await openTestDatabase()
  root = mkdtempSync(join(tmpdir(), 'bakasub-batch-'))
  out = join(root, 'out')
  mkdirSync(join(root, 'show', 'S02'), { recursive: true })
  mkdirSync(out)
  for (const f of ['ep1.mkv', 'ep2.mkv', 'broken.mkv']) writeFileSync(join(root, 'show', f), 'x')
  writeFileSync(join(root, 'show', 'S02', 'ep1.mkv'), 'x')
  writeFileSync(join(root, 'show', 'ep1.en.srt'), '1\n00:00:01,000 --> 00:00:02,000\nHi\n')
  runs = []
  probe = vi.fn(async (p: string) => {
    if (p.endsWith('broken.mkv')) throw new AppError('MEDIA_TOOL_FAILED', 'mkvmerge: bad file')
    return tracks('en')
  })
  const presets = testPresetSource()
  jobs = new JobManager({
    repo: new JobRepository(t.db),
    runner: {
      run: (input, hooks) =>
        new Promise<RunOutcome>((resolve, reject) => {
          runs.push({ spec: input.spec, hooks, resolve })
          hooks.signal.addEventListener('abort', () =>
            reject(
              new StepFailure('mux', new AppError('CANCELLED', 'x'), { outputs: [], warnings: [] })
            )
          )
        })
    },
    presets,
    workRoot: join(root, 'work'),
    concurrency: () => 1,
    emit: () => undefined
  })
  await jobs.init()
  let n = 0
  svc = new BatchService({
    batches: new BatchRepository(t.db),
    jobs,
    mkv: { probe: probe as unknown as BatchServiceDeps['mkv']['probe'] },
    presets,
    preferredSourceLangs: async () => ['en'],
    newId: () => `batch-${++n}`
  })
})
afterEach(async () => {
  await jobs.dispose(100)
  t.close()
})

describe('BatchService.plan', () => {
  it('pipeline de pasta recursiva: uma faixa por arquivo (ASS > SRT), falhas de probe no plano', async () => {
    const plan = await svc.plan({
      kind: 'pipeline',
      source: { type: 'folder', path: join(root, 'show'), recursive: true }
    })
    expect(plan.root).toBe(join(root, 'show'))
    expect(plan.items.map((i) => [i.relPath, i.selected, i.skipped ?? null])).toEqual([
      ['broken.mkv', [], 'probe-failed'],
      ['ep1.mkv', [3], null],
      ['ep2.mkv', [3], null],
      [join('S02', 'ep1.mkv'), [3], null]
    ])
    expect(plan.items[0].error).toBe('mkvmerge: bad file')
    expect(plan.items[1].tracks).toHaveLength(3)
  })

  it('extract: todas as faixas de texto', async () => {
    const plan = await svc.plan({
      kind: 'extract',
      source: { type: 'files', paths: [join(root, 'show', 'ep1.mkv')] }
    })
    expect(plan.root).toBeNull()
    expect(plan.items[0].selected).toEqual([2, 3])
  })

  it('translate: só legendas, sem probe; recusados listados', async () => {
    const plan = await svc.plan({
      kind: 'translate',
      source: {
        type: 'files',
        paths: [join(root, 'show', 'ep1.en.srt'), join(root, 'show', 'ep1.mkv')]
      }
    })
    expect(plan.items.map((i) => i.relPath)).toEqual(['ep1.en.srt'])
    expect(plan.rejected).toEqual([{ path: join(root, 'show', 'ep1.mkv'), reason: 'extension' }])
    expect(probe).not.toHaveBeenCalled()
  })
})

describe('BatchService.create', () => {
  it('cria batch + jobs atomicamente, espelhando a estrutura na pasta de saída', async () => {
    const b = await svc.create({
      kind: 'pipeline',
      root: join(root, 'show'),
      items: [
        { path: join(root, 'show', 'ep1.mkv'), trackIds: [3] },
        { path: join(root, 'show', 'S02', 'ep1.mkv'), trackIds: [2] }
      ],
      presetId: 'p-test',
      outputDir: out
    })
    expect(b).toMatchObject({
      id: 'batch-1',
      name: 'show',
      kind: 'pipeline',
      total: 2,
      state: 'active'
    })
    await until(() => runs.length === 1)
    expect(runs[0].spec).toMatchObject({ trackId: 3, outputDir: out })
    expect(existsSync(join(out, 'S02'))).toBe(true)
    runs[0].resolve({ status: 'completed', result: { outputs: [], warnings: [] } })
    await until(() => runs.length === 2)
    expect(runs[1].spec).toMatchObject({ trackId: 2, outputDir: join(out, 'S02') })
  })

  it('repassa outputMode (e o legado alsoWriteSubtitle) ao job do pipeline, e naming/overwrite ao extract', async () => {
    await svc.create({
      kind: 'pipeline',
      root: null,
      items: [{ path: join(root, 'show', 'ep1.mkv'), trackIds: [3] }],
      presetId: 'p-test',
      options: { outputMode: 'subtitle', overwrite: true }
    })
    await until(() => runs.length === 1)
    expect(runs[0].spec).toMatchObject({ outputMode: 'subtitle', overwrite: true })
    runs[0].resolve({ status: 'completed', result: { outputs: [], warnings: [] } })

    await svc.create({
      kind: 'pipeline',
      root: null,
      items: [{ path: join(root, 'show', 'ep2.mkv'), trackIds: [3] }],
      presetId: 'p-test',
      options: { alsoWriteSubtitle: true }
    })
    await until(() => runs.length === 2)
    expect(runs[1].spec).toMatchObject({ outputMode: 'both' })
    runs[1].resolve({ status: 'completed', result: { outputs: [], warnings: [] } })

    await svc.create({
      kind: 'extract',
      root: null,
      items: [{ path: join(root, 'show', 'ep2.mkv'), trackIds: [2, 3] }],
      options: { extractNaming: 'player' }
    })
    await until(() => runs.length === 3)
    expect(runs[2].spec).toMatchObject({ kind: 'extract', naming: 'player' })
  })

  it('sem outputDir: saída ao lado de cada arquivo; nome padrão para arquivos avulsos', async () => {
    const b = await svc.create({
      kind: 'extract',
      root: null,
      items: [{ path: join(root, 'show', 'ep2.mkv'), trackIds: [2, 3] }]
    })
    expect(b.name).toBe('1 file')
    await until(() => runs.length === 1)
    expect(runs[0].spec).toMatchObject({
      kind: 'extract',
      trackIds: [2, 3],
      outputDir: join(root, 'show')
    })
  })

  it('item fora da pasta raiz ou inválido: nada é criado', async () => {
    await expect(
      svc.create({
        kind: 'pipeline',
        root: join(root, 'show', 'S02'),
        items: [
          { path: join(root, 'show', 'S02', 'ep1.mkv'), trackIds: [3] },
          { path: join(root, 'show', 'ep1.mkv'), trackIds: [3] }
        ],
        presetId: 'p-test',
        outputDir: out
      })
    ).rejects.toMatchObject({ code: 'INVALID_INPUT' })
    await expect(
      svc.create({
        kind: 'pipeline',
        root: null,
        items: [{ path: join(root, 'show', 'ep1.mkv'), trackIds: [] }],
        presetId: 'p-test'
      })
    ).rejects.toMatchObject({ code: 'INVALID_INPUT' })
    expect(await svc.list()).toEqual([])
    expect(await jobs.list()).toEqual([])
  })

  it('sem presetId usa o preset padrão das configurações', async () => {
    await svc.create({
      kind: 'translate',
      root: null,
      items: [{ path: join(root, 'show', 'ep1.en.srt') }]
    })
    await until(() => runs.length === 1)
    expect(runs[0].spec).toMatchObject({ preset: { id: 'p-test' } })
  })
})

describe('BatchService: estado agregado, cancel e remove', () => {
  it('cancel cancela enfileirados e o que roda; remove só quando tudo terminou', async () => {
    const b = await svc.create({
      kind: 'extract',
      root: null,
      items: ['ep1.mkv', 'ep2.mkv'].map((f) => ({ path: join(root, 'show', f), trackIds: [2] }))
    })
    await until(() => runs.length === 1)
    await expect(svc.remove(b.id)).rejects.toMatchObject({ code: 'JOB_INVALID_STATE' })
    const c = await svc.cancel(b.id)
    expect(c).toMatchObject({ state: 'finished', counts: { cancelled: 2 } })
    expect(runs).toHaveLength(1) // o 2º nunca começou
    await svc.remove(b.id)
    await expect(svc.get(b.id)).rejects.toMatchObject({ code: 'BATCH_NOT_FOUND' })
    expect(await jobs.list()).toEqual([])
  })

  it('preflight do batch: soma das estimativas em espera; confirm confirma todos', async () => {
    const b = await svc.create({
      kind: 'pipeline',
      root: null,
      items: ['ep1.mkv', 'ep2.mkv'].map((f) => ({ path: join(root, 'show', f), trackIds: [3] })),
      presetId: 'p-test'
    })
    const est = (high: number): NonNullable<JobResult['preflight']> => ({
      model: { id: 'a/b', pricing: { prompt: 0, completion: 0 }, catalogFetchedAt: null },
      approximate: false,
      lines: { total: 10, cached: 2, toTranslate: 8, copies: 0, chunks: 1 },
      tokens: { input: { low: 1, high: 2 }, output: { low: 1, high: 2 } },
      cost: { low: high / 2, high },
      decision: 'needs-confirmation' as const
    })
    for (const high of [0.1, 0.3]) {
      await until(() => runs.length >= (high === 0.1 ? 1 : 2))
      const r = runs.at(-1)!
      await r.hooks.onArtifacts({ preflight: { estimate: est(high), coverage: {} as never } })
      r.resolve({
        status: 'awaiting-confirmation',
        result: { outputs: [], warnings: [], preflight: est(high) }
      })
    }
    await until(async () => (await svc.get(b.id)).counts['awaiting-confirmation'] === 2)
    const got = await svc.get(b.id)
    expect(got.state).toBe('active')
    expect(got.preflight).toEqual({
      awaiting: 2,
      toTranslate: 16,
      cost: { low: 0.2, high: 0.4 },
      approximate: false
    })

    const c = await svc.confirm(b.id)
    expect(c.counts.queued).toBe(2)
    expect(c.preflight).toBeUndefined()
  })

  it('confirmBeforeTranslate repassado aos jobs', async () => {
    await svc.create({
      kind: 'pipeline',
      root: null,
      items: [{ path: join(root, 'show', 'ep1.mkv'), trackIds: [3] }],
      presetId: 'p-test',
      confirmBeforeTranslate: false
    })
    await until(() => runs.length === 1)
    expect(runs[0].spec).toMatchObject({ confirmBeforeTranslate: false })
  })
})

describe('BatchService: obras (groups)', () => {
  const lookup = vi.fn(
    async (
      ref: { id: number; kind: 'movie' | 'series' },
      ep: { season?: number; episode?: number }
    ) => ({
      details: {
        provider: 'tmdb' as const,
        id: ref.id,
        kind: ref.kind,
        title: `T${ref.id}`,
        genres: [],
        synopsis: 's'
      },
      episode:
        ep.season !== undefined && ep.episode !== undefined
          ? { season: ep.season, episode: ep.episode, title: `E${ep.episode}` }
          : null
    })
  )
  const withGroups = (): BatchService =>
    new BatchService({
      batches: new BatchRepository(t.db),
      jobs,
      mkv: { probe: probe as unknown as BatchServiceDeps['mkv']['probe'] },
      presets: testPresetSource([TEST_PRESET, { ...TEST_PRESET, id: 'p-two', name: 'Two' }]),
      media: { lookup },
      preferredSourceLangs: async () => ['en'],
      newId: () => 'batch-g'
    })

  it('cada obra substitui os padrões do batch; mídia e episódio só vêm da obra', async () => {
    await withGroups().create({
      kind: 'pipeline',
      root: null,
      presetId: 'p-test',
      model: 'base/model',
      notes: 'batch notes',
      groups: [
        { name: 'Show', media: { provider: 'tmdb', id: 7, kind: 'series' } },
        { name: 'Other', presetId: 'p-two', model: 'g/model', targetLang: 'es', notes: 'own' }
      ],
      items: [
        { path: join(root, 'show', 'ep1.mkv'), trackIds: [3], group: 0, season: 1, episode: 1 },
        { path: join(root, 'show', 'ep2.mkv'), trackIds: [3], group: 1, season: 1, episode: 2 },
        { path: join(root, 'show', 'S02', 'ep1.mkv'), trackIds: [3] }
      ]
    })
    const specs = (await jobs.list()).map((j) => j.source)
    expect(specs).toHaveLength(3)
    await until(() => runs.length === 1)
    expect(runs[0].spec).toMatchObject({
      preset: { id: 'p-test', model: 'base/model' },
      targetLang: 'pt-BR',
      notes: 'batch notes',
      media: { details: { id: 7 }, episode: { season: 1, episode: 1 } }
    })
    expect(lookup).toHaveBeenCalledTimes(1)
    runs[0].resolve({ status: 'completed', result: { outputs: [], warnings: [] } })
    await until(() => runs.length === 2)
    expect(runs[1].spec).toMatchObject({
      preset: { id: 'p-two', model: 'g/model' },
      targetLang: 'es',
      notes: 'own'
    })
    expect(runs[1].spec).not.toHaveProperty('media')
    runs[1].resolve({ status: 'completed', result: { outputs: [], warnings: [] } })
    await until(() => runs.length === 3)
    expect(runs[2].spec).toMatchObject({ preset: { id: 'p-test' }, notes: 'batch notes' })
    expect(runs[2].spec).not.toHaveProperty('media')
  })

  it('obra inexistente, obras num extract ou item inválido: nada é criado, erro do primeiro item', async () => {
    const svcG = withGroups()
    await expect(
      svcG.create({
        kind: 'translate',
        root: null,
        groups: [{}],
        items: [{ path: join(root, 'show', 'ep1.en.srt'), group: 1 }]
      })
    ).rejects.toMatchObject({ code: 'INVALID_INPUT' })
    await expect(
      svcG.create({
        kind: 'extract',
        root: null,
        groups: [{}],
        items: [{ path: join(root, 'show', 'ep1.mkv'), trackIds: [2] }]
      })
    ).rejects.toMatchObject({ code: 'INVALID_INPUT' })
    await expect(
      svcG.create({
        kind: 'pipeline',
        root: null,
        presetId: 'p-test',
        items: [
          { path: join(root, 'show', 'ep1.mkv'), trackIds: [3] },
          { path: join(root, 'show', 'missing.mkv'), trackIds: [3] },
          { path: join(root, 'show', 'ep2.mkv'), trackIds: [] }
        ]
      })
    ).rejects.toThrow(/^item 1:/)
    expect(await jobs.list()).toEqual([])
  })
})

describe('BatchService: mux', () => {
  const show = (...p: string[]): string => join(root, 'show', ...p)
  const sub = (path: string, language = 'en'): { path: string; language: string } => ({
    path,
    language
  })

  it('plan: pasta com MKVs e legendas pareados; sem probe; sobras listadas', async () => {
    writeFileSync(show('ep2.pt-BR.srt'), 'x')
    writeFileSync(show('orphan.en.srt'), 'x')
    const plan = await svc.plan({ kind: 'mux', source: { type: 'folder', path: show() } })
    expect(plan).toMatchObject({ kind: 'mux', root: show(), rejected: [], truncated: false })
    expect(
      plan.items.map((i) => [
        i.video.relPath,
        i.subtitles.map((s) => [s.relPath, s.language, s.matchedBy])
      ])
    ).toEqual([
      ['ep1.mkv', [['ep1.en.srt', 'en', 'name']]],
      ['ep2.mkv', [['ep2.pt-BR.srt', 'pt-BR', 'name']]]
    ])
    expect(plan.unmatchedVideos.map((v) => v.relPath)).toEqual(['broken.mkv'])
    expect(plan.unmatchedSubtitles.map((s) => s.relPath)).toEqual(['orphan.en.srt'])
    expect(probe).not.toHaveBeenCalled()
  })

  it('plan: arquivos avulsos; extensão inválida vai em rejected', async () => {
    writeFileSync(show('notes.txt'), 'x')
    const plan = await svc.plan({
      kind: 'mux',
      source: { type: 'files', paths: [show('ep1.mkv'), show('ep1.en.srt'), show('notes.txt')] }
    })
    expect(plan.root).toBeNull()
    expect(plan.items).toHaveLength(1)
    expect(plan.rejected).toEqual([{ path: show('notes.txt'), reason: 'extension' }])
  })

  it('create: um job mux por MKV, opções do batch, FIFO, `und` aceito, estrutura espelhada', async () => {
    const b = await svc.create({
      kind: 'mux',
      root: join(root, 'show'),
      items: [
        {
          video: show('ep1.mkv'),
          subtitles: [sub(show('ep1.en.srt')), sub(show('ep1.en.srt'), 'und')]
        },
        {
          video: show('S02', 'ep1.mkv'),
          subtitles: [{ ...sub(show('ep1.en.srt'), 'pt-BR'), name: 'PT', default: true }]
        }
      ],
      options: { keepOriginalSubtitles: false, setDefault: false },
      outputDir: out
    })
    expect(b).toMatchObject({ kind: 'mux', total: 2, state: 'active', name: 'show' })
    await until(() => runs.length === 1)
    expect(runs[0].spec).toMatchObject({
      kind: 'mux',
      outputDir: out,
      keepOriginalSubtitles: false,
      setDefault: false,
      subtitles: [
        { language: 'en', default: false },
        { language: 'und', default: false }
      ]
    })
    runs[0].resolve({ status: 'completed', result: { outputs: [], warnings: [] } })
    await until(() => runs.length === 2)
    expect(runs[1].spec).toMatchObject({
      outputDir: join(out, 'S02'),
      subtitles: [{ language: 'pt-BR', name: 'PT', default: true }]
    })
  })

  it('create: um item inválido recusa o batch inteiro com "item N"', async () => {
    const good = { video: show('ep1.mkv'), subtitles: [sub(show('ep1.en.srt'))] }
    await expect(
      svc.create({
        kind: 'mux',
        root: null,
        items: [good, { video: show('ep2.mkv'), subtitles: [sub(show('missing.srt'))] }]
      })
    ).rejects.toMatchObject({ code: 'INVALID_INPUT', message: expect.stringMatching(/^item 1: /) })
    await expect(
      svc.create({
        kind: 'mux',
        root: null,
        items: [good, { video: show('ep2.mkv'), subtitles: [sub(show('ep1.en.srt'), 'xx_??')] }]
      })
    ).rejects.toMatchObject({ code: 'INVALID_INPUT', message: expect.stringMatching(/^item 1: /) })
    await expect(
      svc.create({ kind: 'mux', root: null, items: [good, { ...good }] })
    ).rejects.toMatchObject({ code: 'INVALID_INPUT', message: expect.stringMatching(/^item 1: /) })
    expect(await svc.list()).toEqual([])
    expect(await jobs.list()).toEqual([])
  })

  it('groups em batch mux e itens do formato errado são INVALID_INPUT', async () => {
    const item = { video: show('ep1.mkv'), subtitles: [sub(show('ep1.en.srt'))] }
    await expect(
      svc.create({ kind: 'mux', root: null, items: [item], groups: [{ name: 'x' }] })
    ).rejects.toMatchObject({ code: 'INVALID_INPUT' })
    await expect(
      svc.create({ kind: 'mux', root: null, items: [{ path: show('ep1.mkv') }] })
    ).rejects.toMatchObject({ code: 'INVALID_INPUT' })
    await expect(svc.create({ kind: 'extract', root: null, items: [item] })).rejects.toMatchObject({
      code: 'INVALID_INPUT'
    })
    await expect(
      svc.create({ kind: 'mux', root: null, items: [{ video: show('ep1.mkv'), subtitles: [] }] })
    ).rejects.toMatchObject({ code: 'INVALID_INPUT' })
    expect(await svc.list()).toEqual([])
  })

  it('cancelar e remover como nos outros kinds', async () => {
    const b = await svc.create({
      kind: 'mux',
      root: null,
      items: [
        { video: show('ep1.mkv'), subtitles: [sub(show('ep1.en.srt'))] },
        { video: show('ep2.mkv'), subtitles: [sub(show('ep1.en.srt'))] }
      ]
    })
    await until(() => runs.length === 1)
    const c = await svc.cancel(b.id)
    expect(c.counts).toEqual({ cancelled: 2 })
    await until(async () => (await svc.get(b.id)).state === 'finished')
    await svc.remove(b.id)
    expect(await svc.list()).toEqual([])
  })
})
