import { existsSync, mkdirSync, mkdtempSync, readdirSync, utimesSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { JobCreateRequest, JobProgressEvent } from '../../shared/ipc-contract'
import { testPresetSource } from '../presets/test-presets'
import { JobRepository } from '../database/repositories/job.repository'
import { openTestDatabase } from '../database/test-db'
import { AppError } from '../errors'
import type { Artifacts } from './artifacts'
import { currentJobId } from '../logging/job-context'
import { JobManager } from './job-manager'
import { StepFailure, type RunHooks, type RunOutcome } from './job-runner'
import type { JobSpec } from './job-spec'

interface Pending {
  id: string
  input: { spec: JobSpec; artifacts: Artifacts; workDir: string }
  hooks: RunHooks
  resolve(o: RunOutcome): void
  reject(e: unknown): void
  /** Job id visible to logging while the runner runs. */
  logJobId: string | undefined
}

let t: Awaited<ReturnType<typeof openTestDatabase>>
let root: string
let workRoot: string
let pending: Pending[]
let events: JobProgressEvent[]
let concurrency: number
let repo: JobRepository
let manager: JobManager
let ids: number

/** Espera a fila assentar: sem timers fixos (flaky sob carga). */
async function tick(): Promise<void> {
  for (let i = 0; i < 50; i++) await new Promise((r) => setImmediate(r))
  await new Promise((r) => setTimeout(r, 20))
}
async function until(cond: () => boolean | Promise<boolean>, ms = 3000): Promise<void> {
  const end = Date.now() + ms
  while (!(await cond())) {
    if (Date.now() > end) throw new Error('timeout waiting for condition')
    await new Promise((r) => setTimeout(r, 5))
  }
}

beforeEach(async () => {
  t = await openTestDatabase()
  root = mkdtempSync(join(tmpdir(), 'bakasub-mgr-'))
  workRoot = join(root, 'jobs')
  writeFileSync(join(root, 'a.srt'), '1\n00:00:01,000 --> 00:00:02,000\nHi\n')
  pending = []
  events = []
  concurrency = 2
  ids = 0
  repo = new JobRepository(t.db)
  manager = new JobManager({
    repo,
    runner: {
      run: (input, hooks) =>
        new Promise<RunOutcome>((resolve, reject) => {
          const id = input.workDir.split('/').pop()!
          pending.push({ id, input, hooks, resolve, reject, logJobId: currentJobId() })
          hooks.signal.addEventListener('abort', () =>
            reject(
              new StepFailure('translate', new AppError('CANCELLED', 'x'), {
                outputs: [],
                warnings: []
              })
            )
          )
        })
    },
    presets: testPresetSource(),
    workRoot,
    concurrency: async () => concurrency,
    emit: (e) => events.push(e),
    newId: () => `job-${++ids}`
  })
  await manager.init()
})
afterEach(async () => {
  await manager.dispose(100)
  t.close()
})

const req = (): JobCreateRequest => ({
  kind: 'translate',
  source: join(root, 'a.srt'),
  presetId: 'p-test'
})
const done = (p: Pending, status: RunOutcome['status'] = 'completed'): void =>
  p.resolve({ status, result: { outputs: ['/out/a.pt-BR.srt'], warnings: [] } })

describe('JobManager', () => {
  it('create enfileira, executa e conclui; diretório de trabalho é removido no sucesso', async () => {
    const job = await manager.create(req())
    expect(job).toMatchObject({ id: 'job-1', status: 'queued', kind: 'translate', source: 'a.srt' })
    await until(() => pending.length === 1)
    expect(pending).toHaveLength(1)
    expect((await manager.get('job-1')).status).toBe('running')
    expect(pending[0].logJobId).toBe('job-1')
    expect(existsSync(join(workRoot, 'job-1'))).toBe(true)
    done(pending[0])
    await until(async () => (await manager.get('job-1')).status === 'completed')
    const j = await manager.get('job-1')
    expect(j).toMatchObject({ status: 'completed', result: { outputs: ['/out/a.pt-BR.srt'] } })
    expect(j.finishedAt).not.toBeNull()
    expect(existsSync(join(workRoot, 'job-1'))).toBe(false)
    expect(events.at(-1)).toMatchObject({ id: 'job-1', status: 'completed' })
  })

  it('concorrência e FIFO', async () => {
    for (let i = 0; i < 3; i++) await manager.create(req())
    await tick()
    expect(pending.map((p) => p.id)).toEqual(['job-1', 'job-2'])
    expect(manager.isBusy()).toBe(true)
    done(pending[1])
    await tick()
    expect(pending.map((p) => p.id)).toEqual(['job-1', 'job-2', 'job-3'])
  })

  it('cancel: na fila não executa; rodando aborta e vira cancelled', async () => {
    concurrency = 1
    await manager.create(req())
    await manager.create(req())
    await tick()
    await manager.cancel('job-2')
    expect((await manager.get('job-2')).status).toBe('cancelled')
    await manager.cancel('job-1')
    await tick()
    expect((await manager.get('job-1')).status).toBe('cancelled')
    expect(existsSync(join(workRoot, 'job-1'))).toBe(false)
    expect(pending.map((p) => p.id)).toEqual(['job-1'])
    await expect(manager.cancel('job-1')).rejects.toMatchObject({ code: 'JOB_INVALID_STATE' })
    await expect(manager.cancel('nope')).rejects.toMatchObject({ code: 'JOB_NOT_FOUND' })
  })

  it('falha: erro tipado e etapa; workdir mantido; retry retoma com os artefatos salvos', async () => {
    await manager.create(req())
    await tick()
    const p = pending[0]
    await p.hooks.onArtifacts({ probe: { tracks: [] } })
    p.reject(
      new StepFailure('translate', new AppError('LLM_UNAVAILABLE', 'down'), {
        outputs: [],
        warnings: []
      })
    )
    await tick()
    const j = await manager.get('job-1')
    expect(j).toMatchObject({
      status: 'failed',
      step: 'translate',
      error: { code: 'LLM_UNAVAILABLE', message: 'down' }
    })
    expect(existsSync(join(workRoot, 'job-1'))).toBe(true)

    const r = await manager.retry('job-1')
    expect(r).toMatchObject({ status: 'queued', attempt: 2, error: null })
    await tick()
    expect(pending[1].input.artifacts).toEqual({ probe: { tracks: [] } })
    await expect(manager.retry('job-1')).rejects.toMatchObject({ code: 'JOB_INVALID_STATE' })
  })

  it('erro inesperado (não AppError) vira INTERNAL', async () => {
    await manager.create(req())
    await tick()
    pending[0].reject(
      new StepFailure('translate', new TypeError('bug'), { outputs: [], warnings: [] })
    )
    await tick()
    expect((await manager.get('job-1')).error).toEqual({ code: 'INTERNAL', message: 'bug' })
  })

  it('remove só terminais, apagando o workdir', async () => {
    await manager.create(req())
    await tick()
    await expect(manager.remove('job-1')).rejects.toMatchObject({ code: 'JOB_INVALID_STATE' })
    pending[0].reject(
      new StepFailure('translate', new AppError('LLM_AUTH', 'x'), { outputs: [], warnings: [] })
    )
    await tick()
    await manager.remove('job-1')
    expect(existsSync(join(workRoot, 'job-1'))).toBe(false)
    await expect(manager.get('job-1')).rejects.toMatchObject({ code: 'JOB_NOT_FOUND' })
  })

  it('clearFinished remove só concluídos/cancelados, com workdir', async () => {
    concurrency = 1
    await manager.create(req())
    await manager.create(req())
    await tick()
    await manager.cancel('job-2')
    expect(await manager.clearFinished()).toEqual(['job-2'])
    expect(existsSync(join(workRoot, 'job-2'))).toBe(false)
    await expect(manager.get('job-2')).rejects.toMatchObject({ code: 'JOB_NOT_FOUND' })
    // O que roda (job-1) não é tocado.
    expect((await manager.get('job-1')).status).toBe('running')
    expect(await manager.clearFinished()).toEqual([])
  })

  it('isPresetInUse considera jobs não terminais', async () => {
    concurrency = 1
    await manager.create(req())
    await tick()
    expect(await manager.isPresetInUse('p-test')).toBe(true)
    expect(await manager.isPresetInUse('other')).toBe(false)
    done(pending[0])
    await tick()
    expect(await manager.isPresetInUse('p-test')).toBe(false)
  })

  it('dispose aborta e marca interrupted (não cancelled)', async () => {
    await manager.create(req())
    await tick()
    await manager.dispose(500)
    expect((await manager.get('job-1')).status).toBe('interrupted')
    await expect(manager.create(req())).rejects.toMatchObject({ code: 'CANCELLED' })
  })

  it('init: running vira interrupted, órfãos e terminais antigos têm o workdir removido', async () => {
    await manager.dispose(100)
    await repo.insert({ id: 'old-run', kind: 'translate', spec: {}, status: 'running' })
    await repo.insert({ id: 'old-fail', kind: 'translate', spec: {}, status: 'failed' })
    await repo.update('old-fail', { finishedAt: new Date(Date.now() - 8 * 86_400_000) })
    await repo.insert({ id: 'new-fail', kind: 'translate', spec: {}, status: 'failed' })
    await repo.update('new-fail', { finishedAt: new Date() })
    for (const d of ['old-run', 'old-fail', 'new-fail', 'orphan'])
      mkdirSync(join(workRoot, d), { recursive: true })
    const old = new Date(Date.now() - 8 * 86_400_000)
    utimesSync(join(workRoot, 'orphan'), old, old)

    const m2 = new JobManager({
      repo,
      runner: { run: vi.fn() },
      presets: testPresetSource(),
      workRoot,
      concurrency: async () => 1,
      emit: () => undefined
    })
    await m2.init()
    expect((await repo.get('old-run'))!.status).toBe('interrupted')
    expect(readdirSync(workRoot).sort()).toEqual(['new-fail', 'old-run'])
    await m2.dispose(10)
  })

  it('progresso: evento com throttle e persistência por chunk', async () => {
    await manager.create(req())
    await tick()
    const h = pending[0].hooks
    h.onProgress({ step: 'translate', translation: { done: 40, total: 100, cached: 0 } })
    h.onProgress({ step: 'translate', translation: { done: 41, total: 100, cached: 0 } })
    await tick()
    expect((await manager.get('job-1')).progress.translation?.done).toBe(41)
    expect(events.filter((e) => e.status === 'running').length).toBeLessThanOrEqual(2)
  })

  it('awaiting-confirmation libera o slot; confirm retoma com a decisão confirmada', async () => {
    concurrency = 1
    await manager.create(req())
    await manager.create(req())
    await until(() => pending.length === 1)
    const estimate = {
      model: { id: 'a/b', pricing: null, catalogFetchedAt: null },
      approximate: true,
      lines: { total: 1, cached: 0, toTranslate: 1, chunks: 1 },
      tokens: { input: { low: 1, high: 2 }, output: { low: 1, high: 2 } },
      cost: null,
      decision: 'needs-confirmation' as const
    }
    await pending[0].hooks.onArtifacts({
      preflight: { estimate, coverage: { byReason: {} } as never }
    })
    pending[0].resolve({
      status: 'awaiting-confirmation',
      result: { outputs: [], warnings: [], preflight: estimate }
    })
    await until(() => pending.length === 2) // o slot foi liberado para o job-2
    const j = await manager.get('job-1')
    expect(j).toMatchObject({ status: 'awaiting-confirmation', finishedAt: null })
    expect(j.result?.preflight?.decision).toBe('needs-confirmation')
    expect(existsSync(join(workRoot, 'job-1'))).toBe(true)
    expect(await manager.preflight('job-1')).toEqual({ estimate, coverage: { byReason: {} } })
    expect(await manager.isPresetInUse('p-test')).toBe(true)

    await expect(manager.confirm('job-2')).rejects.toMatchObject({ code: 'JOB_INVALID_STATE' })
    expect((await manager.confirm('job-1')).status).toBe('queued')
    done(pending[1])
    await until(() => pending.length === 3)
    expect(pending[2].input.artifacts.preflight?.estimate.decision).toBe('confirmed')
  })

  it('awaiting-confirmation sobrevive ao reinício (não vira interrupted) e pode ser cancelado', async () => {
    await manager.create(req())
    await until(() => pending.length === 1)
    pending[0].resolve({ status: 'awaiting-confirmation', result: { outputs: [], warnings: [] } })
    await until(async () => (await manager.get('job-1')).status === 'awaiting-confirmation')
    await manager.dispose(50)
    const m2 = new JobManager({
      repo,
      runner: { run: vi.fn() },
      presets: testPresetSource(),
      workRoot,
      concurrency: async () => 1,
      emit: () => undefined
    })
    await m2.init()
    expect((await m2.get('job-1')).status).toBe('awaiting-confirmation')
    expect((await m2.cancel('job-1')).status).toBe('cancelled')
    await m2.dispose(10)
  })
})
