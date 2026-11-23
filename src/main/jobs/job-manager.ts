import { runWithJob } from '../logging/job-context'
import { randomUUID } from 'node:crypto'
import { mkdir, readdir, rm } from 'node:fs/promises'
import { basename, join } from 'node:path'
import type {
  Job,
  JobCreateRequest,
  JobMemoryMode,
  JobProgress,
  JobProgressEvent,
  JobStatus
} from '../../shared/ipc-contract'
import type { JobRepository, JobRow } from '../database/repositories/job.repository'
import { mediaSummary } from './media-summary'
import { translationSummary } from './translation-summary'
import { AppError } from '../errors'
import { TranslationCancelled } from '../llm/translate-document'
import { isStepComplete, type Artifacts } from './artifacts'
import type { RunHooks, RunOutcome } from './job-runner'
import { StepFailure } from './job-runner'
import {
  jobMemoryMode,
  resolveJobSpec,
  type JobSpec,
  type PresetSource,
  type MediaLookupSource
} from './job-spec'
import { createThrottle, type Throttle } from './throttle'

const TERMINAL: ReadonlySet<JobStatus> = new Set([
  'completed',
  'completed-with-warnings',
  'failed',
  'cancelled',
  'interrupted'
])
/** "Concluídos" da fila: terminais que não pedem ação (falhas/interrompidos ficam). */
const FINISHED: readonly JobStatus[] = ['completed', 'completed-with-warnings', 'cancelled']
const RETRYABLE: ReadonlySet<JobStatus> = new Set(['failed', 'cancelled', 'interrupted'])
const PROGRESS_THROTTLE_MS = 250
const WORKDIR_RETENTION_MS = 7 * 86_400_000

export interface JobRunnerLike {
  run(
    input: { spec: JobSpec; artifacts: Artifacts; workDir: string },
    hooks: RunHooks
  ): Promise<RunOutcome>
}

export interface JobManagerDeps {
  readonly repo: JobRepository
  readonly runner: JobRunnerLike
  readonly presets: PresetSource
  /** Contexto do TMDB pedido pela UI, congelado no spec. Opcional. */
  readonly media?: MediaLookupSource
  /** `userData/cache/jobs`. */
  readonly workRoot: string
  readonly concurrency: () => Promise<number> | number
  readonly emit: (event: JobProgressEvent) => void
  readonly log?: {
    info(m: string): void
    warn(m: string): void
    error(m: string, e?: unknown): void
  }
  readonly newId?: () => string
  readonly now?: () => number
}

interface Running {
  readonly controller: AbortController
  readonly done: Promise<void>
  readonly throttle: Throttle<JobProgressEvent>
}

function toDto(r: JobRow): Job {
  const spec = r.spec as { source?: string }
  const media = mediaSummary(r.spec)
  const memory = jobMemoryMode(r.spec)
  const translation = translationSummary(r.spec)
  return {
    id: r.id,
    kind: r.kind,
    batchId: r.batchId ?? null,
    status: r.status,
    step: r.step ?? null,
    source: spec.source ? basename(spec.source) : '',
    progress: r.progress,
    ...(media ? { media } : {}),
    ...(translation ? { translation } : {}),
    ...(memory ? { memory } : {}),
    result: r.result ?? null,
    error: r.error ?? null,
    attempt: r.attempt,
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
    startedAt: r.startedAt?.toISOString() ?? null,
    finishedAt: r.finishedAt?.toISOString() ?? null
  }
}

/** Cópia dos artefatos sem as etapas dadas (refeitas na próxima execução). */
function withoutSteps(raw: unknown, steps: readonly (keyof Artifacts)[]): Artifacts {
  const a = structuredClone((raw ?? {}) as Artifacts)
  for (const s of steps) delete a[s]
  return a
}

/**
 * Retry sem trocar `memory`: se a tradução não terminou, o preflight é refeito. As falas traduzidas
 * antes da falha já estão na Job Memory e o custo real conta só a nova tentativa, então a estimativa
 * antiga (cheia) não seria comparável a ele. Uma estimativa já aceita (confirmada ou automática) não
 * para de novo para confirmação (`preconfirmed`). `null` = artefatos ficam como estão.
 */
async function reestimateUnfinished(raw: unknown): Promise<Artifacts | null> {
  const a = (raw ?? {}) as Artifacts
  if (!a.preflight || (await isStepComplete('translate', a))) return null
  const accepted = a.preflight.estimate.decision !== 'needs-confirmation'
  const next = withoutSteps(a, ['preflight', 'translate'])
  if (accepted) next.preconfirmed = true
  return next
}

function isCancellation(err: unknown): boolean {
  return (
    err instanceof TranslationCancelled || (err instanceof AppError && err.code === 'CANCELLED')
  )
}

/**
 * Fila de jobs: FIFO com concorrência limitada, estado persistido em cada transição,
 * cancelamento via `AbortController` por job, retry por etapa e shutdown que marca como
 * `interrupted` o que não terminou. Ver `docs/jobs.md`.
 */
export class JobManager {
  private readonly running = new Map<string, Running>()
  private pumping: Promise<void> = Promise.resolve()
  private disposed = false
  private readonly log: NonNullable<JobManagerDeps['log']>
  private readonly newId: () => string
  private readonly now: () => number

  constructor(private readonly deps: JobManagerDeps) {
    const noop = (): void => undefined
    this.log = deps.log ?? { info: noop, warn: noop, error: noop }
    this.newId = deps.newId ?? randomUUID
    this.now = deps.now ?? Date.now
  }

  /** Boot: recupera o estado e limpa diretórios de trabalho, depois começa a consumir a fila. */
  async init(): Promise<void> {
    const n = await this.deps.repo.markInterrupted()
    if (n) this.log.warn(`${n} job(s) were interrupted by the last shutdown`)
    await mkdir(this.deps.workRoot, { recursive: true })
    await this.collectWorkDirs()
    this.pump()
  }

  async create(request: JobCreateRequest): Promise<Job> {
    if (this.disposed) throw new AppError('CANCELLED', 'Shutting down')
    const spec = await resolveJobSpec(request, this.deps.presets, this.deps.media)
    const row = await this.deps.repo.insert({
      id: this.newId(),
      kind: spec.kind,
      spec,
      status: 'queued'
    })
    this.pump()
    return toDto(row)
  }

  async list(): Promise<Job[]> {
    return (await this.deps.repo.list()).map(toDto)
  }

  async get(id: string): Promise<Job> {
    return toDto(await this.row(id))
  }

  async cancel(id: string): Promise<Job> {
    const row = await this.row(id)
    const run = this.running.get(id)
    if (run) {
      run.controller.abort()
      await run.done
    } else if (row.status === 'queued' || row.status === 'awaiting-confirmation') {
      await this.deps.repo.update(id, { status: 'cancelled', finishedAt: new Date(this.now()) })
      this.emitNow(id, 'cancelled', row.progress)
    } else throw new AppError('JOB_INVALID_STATE', `Job ${id} is ${row.status}`)
    return this.get(id)
  }

  /** `awaiting-confirmation` -> fila, com a decisão do preflight marcada como confirmada. */
  async confirm(id: string): Promise<Job> {
    const row = await this.row(id)
    if (row.status !== 'awaiting-confirmation')
      throw new AppError('JOB_INVALID_STATE', `Job ${id} is ${row.status}`)
    const artifacts = structuredClone(row.artifacts) as Artifacts
    if (artifacts.preflight) artifacts.preflight.estimate.decision = 'confirmed'
    await this.deps.repo.update(id, {
      status: 'queued',
      artifacts: artifacts as Record<string, unknown>
    })
    this.pump()
    return this.get(id)
  }

  /**
   * Dispensa as sugestões de consistência de termos de um job terminal: grava a flag no
   * resultado (idempotente). O preset não é tocado; um retry gera um relatório novo, sem a flag.
   */
  async dismissConsistency(id: string): Promise<Job> {
    const row = await this.row(id)
    if (!TERMINAL.has(row.status) || this.running.has(id) || !row.result?.consistency)
      throw new AppError('JOB_INVALID_STATE', `Job ${id} is ${row.status}`)
    if (!row.result.consistencyDismissed)
      await this.deps.repo.update(id, { result: { ...row.result, consistencyDismissed: true } })
    return this.get(id)
  }

  /** Estimativa + cobertura completa guardadas pela etapa de preflight. */
  async preflight(id: string): Promise<Artifacts['preflight'] | null> {
    const row = await this.row(id)
    return (row.artifacts as Artifacts).preflight ?? null
  }

  /**
   * Volta à fila retomando da primeira etapa incompleta. `memory` ausente = a escolha original;
   * trocar descarta preflight e tradução (estimativa e cache mudam), mantendo probe/extração.
   * Sem troca, uma tradução inacabada também refaz o preflight (`reestimateUnfinished`).
   */
  async retry(id: string, memory?: JobMemoryMode): Promise<Job> {
    const row = await this.row(id)
    if (!RETRYABLE.has(row.status) || this.running.has(id))
      throw new AppError('JOB_INVALID_STATE', `Job ${id} is ${row.status}`)
    const change = this.memoryChange(row, memory)
    const artifacts = change
      ? withoutSteps(row.artifacts, ['preflight', 'translate'])
      : await reestimateUnfinished(row.artifacts)
    await this.deps.repo.update(id, {
      ...(change ? { spec: change.spec } : {}),
      ...(artifacts ? { artifacts: artifacts as Record<string, unknown> } : {}),
      status: 'queued',
      attempt: row.attempt + 1,
      error: null,
      result: null,
      finishedAt: null,
      progress: { step: null }
    })
    this.pump()
    return this.get(id)
  }

  /**
   * Revisão do preflight: troca o `memory` de um job em `awaiting-confirmation` e refaz só a
   * estimativa. O job volta à fila e para de novo para confirmação (`reestimate`).
   */
  async setMemory(id: string, memory: JobMemoryMode): Promise<Job> {
    const row = await this.row(id)
    if (row.status !== 'awaiting-confirmation' || this.running.has(id))
      throw new AppError('JOB_INVALID_STATE', `Job ${id} is ${row.status}`)
    const change = this.memoryChange(row, memory)
    if (!change) return this.get(id)
    const artifacts = withoutSteps(row.artifacts, ['preflight', 'translate'])
    artifacts.reestimate = true
    await this.deps.repo.update(id, {
      spec: change.spec,
      artifacts: artifacts as Record<string, unknown>,
      status: 'queued',
      result: null,
      progress: { step: null }
    })
    this.pump()
    return this.get(id)
  }

  /** Novo spec quando `memory` muda; `null` sem mudança. Só jobs que traduzem. */
  private memoryChange(row: JobRow, memory: JobMemoryMode | undefined): { spec: JobSpec } | null {
    if (memory === undefined) return null
    const current = jobMemoryMode(row.spec)
    if (!current)
      throw new AppError('INVALID_INPUT', `Job ${row.id} (${row.kind}) does not translate`)
    if (current === memory) return null
    return { spec: { ...(row.spec as JobSpec & { memory?: JobMemoryMode }), memory } as JobSpec }
  }

  async remove(id: string): Promise<void> {
    const row = await this.row(id)
    if (!TERMINAL.has(row.status) || this.running.has(id))
      throw new AppError('JOB_INVALID_STATE', `Job ${id} is ${row.status}`)
    await rm(this.workDir(id), { recursive: true, force: true })
    await this.deps.repo.delete(id)
  }

  /**
   * Remove de uma vez os jobs concluídos/cancelados: um único DELETE, depois os workdirs.
   * Os diretórios que falharem ao apagar são recolhidos pelo `collectWorkDirs` (sem job = órfão).
   */
  async clearFinished(): Promise<string[]> {
    const ids = (await this.deps.repo.idsByStatus(FINISHED)).filter((id) => !this.running.has(id))
    await this.deps.repo.deleteMany(ids)
    await Promise.allSettled(
      ids.map((id) => rm(this.workDir(id), { recursive: true, force: true }))
    )
    return ids
  }

  /** Jobs inseridos por fora (batch): começa a consumi-los. */
  kick(): void {
    if (!this.disposed) this.pump()
  }

  /** Há job executando (o prune do Job Memory é recusado). */
  isBusy(): boolean {
    return this.running.size > 0
  }

  async isPresetInUse(presetId: string): Promise<boolean> {
    const active = await this.deps.repo.active()
    return active.some((r) => (r.spec as { preset?: { id: string } }).preset?.id === presetId)
  }

  /** Shutdown: aborta tudo, espera até `timeoutMs` e marca o que sobrou como `interrupted`. */
  async dispose(timeoutMs = 5000): Promise<void> {
    this.disposed = true
    const runs = [...this.running.entries()]
    for (const [, r] of runs) r.controller.abort()
    await Promise.race([
      Promise.allSettled(runs.map(([, r]) => r.done)),
      new Promise((resolve) => setTimeout(resolve, timeoutMs).unref())
    ])
    for (const [id] of this.running)
      await this.deps.repo.update(id, { status: 'interrupted' }).catch(() => undefined)
    await this.pumping
  }

  // ---------------------------------------------------------------------------

  /** Serializa os pumps: dois `create` simultâneos não podem iniciar o mesmo job. */
  private pump(): void {
    this.pumping = this.pumping
      .then(() => this.fill())
      .catch((err) => this.log.error('job queue pump failed', err))
  }

  private async fill(): Promise<void> {
    if (this.disposed) return
    const limit = await this.deps.concurrency()
    if (this.running.size >= limit) return
    for (const row of await this.deps.repo.queued()) {
      if (this.disposed || this.running.size >= limit) break
      if (!this.running.has(row.id)) await this.start(row)
    }
  }

  private async start(row: JobRow): Promise<void> {
    const id = row.id
    const controller = new AbortController()
    const throttle = createThrottle<JobProgressEvent>(PROGRESS_THROTTLE_MS, this.deps.emit)
    const workDir = this.workDir(id)
    await mkdir(workDir, { recursive: true })
    await this.deps.repo.update(id, {
      status: 'running',
      step: null,
      startedAt: new Date(this.now()),
      error: null
    })

    let progress: JobProgress = { step: null }
    let lastChunk = -1
    const hooks: RunHooks = {
      signal: controller.signal,
      onStep: async (step) => {
        progress = { step }
        await this.deps.repo.update(id, { step, progress })
      },
      onArtifacts: (artifacts) =>
        this.deps.repo.update(id, { artifacts: artifacts as Record<string, unknown> }),
      onProgress: (p) => {
        progress = p
        throttle.push({ id, status: 'running', progress: p })
        // Persistido por chunk de tradução (não a cada evento): o evento IPC é efêmero.
        const done = p.translation?.done ?? -1
        if (done !== lastChunk && p.translation) {
          lastChunk = done
          void this.deps.repo.update(id, { progress: p }).catch(() => undefined)
        }
      }
    }

    // Tudo que o job logar (LLM, sidecars, stderr dos CLIs) carrega o id, sem passar logger adiante.
    const done = runWithJob(id, () =>
      this.deps.runner.run(
        { spec: row.spec as JobSpec, artifacts: row.artifacts as Artifacts, workDir },
        hooks
      )
    )
      .then(
        (outcome) =>
          outcome.status === 'awaiting-confirmation'
            ? this.pause(id, progress, outcome.result)
            : this.finish(id, outcome.status, progress, { result: outcome.result }),
        (err) => this.fail(id, err, progress, controller.signal.aborted)
      )
      .catch((err) => this.log.error(`job ${id} bookkeeping failed`, err))
      .finally(() => {
        throttle.cancel()
        this.running.delete(id)
        this.pump()
      })
    this.running.set(id, { controller, done, throttle })
  }

  /** Parado antes da tradução: não terminal, sem `finishedAt`, mantém o diretório de trabalho. */
  private async pause(id: string, progress: JobProgress, result: Job['result']): Promise<void> {
    const p: JobProgress = { ...progress, step: 'preflight' }
    await this.deps.repo.update(id, {
      status: 'awaiting-confirmation',
      step: 'preflight',
      progress: p,
      result
    })
    this.running.get(id)?.throttle.cancel()
    this.emitNow(id, 'awaiting-confirmation', p)
  }

  private async fail(
    id: string,
    err: unknown,
    progress: JobProgress,
    aborted: boolean
  ): Promise<void> {
    const failure = err instanceof StepFailure ? err : null
    const cause = failure ? failure.cause : err
    const partial = failure?.partial ?? null
    if (aborted || isCancellation(cause)) {
      // No shutdown o job foi interrompido, não cancelado pelo usuário: fica retomável.
      const status: JobStatus = this.disposed ? 'interrupted' : 'cancelled'
      await this.finish(id, status, progress, {
        result: partial,
        step: failure?.step ?? null,
        keepWorkDir: status === 'interrupted'
      })
      return
    }
    const error =
      cause instanceof AppError
        ? { code: cause.code, message: cause.message }
        : { code: 'INTERNAL', message: cause instanceof Error ? cause.message : String(cause) }
    if (!(cause instanceof AppError)) this.log.error(`job ${id} failed unexpectedly`, cause)
    else this.log.warn(`job ${id} failed: ${error.code} ${error.message}`)
    await this.finish(id, 'failed', progress, {
      result: partial,
      error,
      step: failure?.step ?? null,
      keepWorkDir: true
    })
  }

  private async finish(
    id: string,
    status: JobStatus,
    progress: JobProgress,
    extra: {
      result?: Job['result']
      error?: Job['error']
      step?: Job['step']
      keepWorkDir?: boolean
    }
  ): Promise<void> {
    // Uma espera (limite/backoff) não sobrevive ao fim do job.
    const finalProgress: JobProgress = { ...progress, step: extra.step ?? null }
    delete finalProgress.waiting
    // Limpa antes de publicar o estado terminal: quem vê `completed` não vê o workdir.
    if (!extra.keepWorkDir) await rm(this.workDir(id), { recursive: true, force: true })
    await this.deps.repo.update(id, {
      status,
      step: extra.step ?? null,
      progress: finalProgress,
      result: extra.result ?? null,
      error: extra.error ?? null,
      finishedAt: new Date(this.now())
    })
    this.running.get(id)?.throttle.cancel()
    this.emitNow(id, status, finalProgress)
  }

  private emitNow(id: string, status: JobStatus, progress: JobProgress): void {
    this.deps.emit({ id, status, progress })
  }

  private async row(id: string): Promise<JobRow> {
    const row = await this.deps.repo.get(id)
    if (!row) throw new AppError('JOB_NOT_FOUND', `Job ${id} not found`)
    return row
  }

  private workDir(id: string): string {
    return join(this.deps.workRoot, id)
  }

  /** Remove diretórios sem job e de jobs terminais há mais de 7 dias. */
  private async collectWorkDirs(): Promise<void> {
    const entries = await readdir(this.deps.workRoot, { withFileTypes: true })
    const cutoff = this.now() - WORKDIR_RETENTION_MS
    for (const e of entries) {
      if (!e.isDirectory()) continue
      const row = await this.deps.repo.get(e.name)
      const stale =
        !row || (TERMINAL.has(row.status) && row.finishedAt && row.finishedAt.getTime() < cutoff)
      if (stale) await rm(join(this.deps.workRoot, e.name), { recursive: true, force: true })
    }
  }
}
