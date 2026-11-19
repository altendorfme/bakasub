import { mkdirSync, mkdtempSync, writeFileSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Profile } from '../../shared/ipc-contract'
import { BatchRepository } from '../database/repositories/batch.repository'
import { JobRepository } from '../database/repositories/job.repository'
import { openTestDatabase } from '../database/test-db'
import { AppError } from '../errors'
import { JobManager } from '../jobs/job-manager'
import { StepFailure, type RunHooks, type RunOutcome } from '../jobs/job-runner'
import type { JobSpec } from '../jobs/job-spec'
import type { MkvInfo } from '../media/mkv-probe'
import { BatchService, type BatchServiceDeps } from './batch-service'

const profile: Profile = {
  id: 1,
  name: 'P',
  model: 'a/b',
  glossary: [],
  targetLang: 'pt-BR',
  temperature: 0.3,
  createdAt: new Date(0).toISOString()
}
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
  const profiles = { get: async () => profile }
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
    profiles,
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
    profiles,
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
      profileId: 1,
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
        profileId: 1,
        outputDir: out
      })
    ).rejects.toMatchObject({ code: 'INVALID_INPUT' })
    await expect(
      svc.create({
        kind: 'pipeline',
        root: null,
        items: [{ path: join(root, 'show', 'ep1.mkv'), trackIds: [] }],
        profileId: 1
      })
    ).rejects.toMatchObject({ code: 'INVALID_INPUT' })
    expect(await svc.list()).toEqual([])
    expect(await jobs.list()).toEqual([])
  })

  it('translate e pipeline exigem profileId', async () => {
    await expect(
      svc.create({
        kind: 'translate',
        root: null,
        items: [{ path: join(root, 'show', 'ep1.en.srt') }]
      })
    ).rejects.toMatchObject({ code: 'INVALID_INPUT' })
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
})
