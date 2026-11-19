import { randomUUID } from 'node:crypto'
import { mkdir, realpath, stat } from 'node:fs/promises'
import { basename, dirname, isAbsolute, join, relative } from 'node:path'
import { z } from 'zod'
import type {
  Batch,
  BatchCreateRequest,
  BatchPlan,
  BatchPlanRequest,
  Job,
  JobCreateRequest,
  JobStatus,
  Profile
} from '../../shared/ipc-contract'
import type { BatchRepository, BatchRow } from '../database/repositories/batch.repository'
import { AppError } from '../errors'
import type { JobManager } from '../jobs/job-manager'
import { resolveJobSpec, type JobSpec } from '../jobs/job-spec'
import type { MkvToolnix } from '../media/mkvtoolnix-service'
import {
  MEDIA_EXTENSIONS,
  SUBTITLE_EXTENSIONS,
  validateInputFile,
  validateOutputDir
} from '../media/path-guard'
import { planBatch } from './batch-planner'

const TERMINAL: ReadonlySet<JobStatus> = new Set([
  'completed',
  'completed-with-warnings',
  'failed',
  'cancelled',
  'interrupted'
])
const MAX_ITEMS = 2000

const path = z.string().min(1).max(4096)
const kind = z.enum(['extract', 'translate', 'pipeline'])

export const BatchPlanRequestSchema = z.object({
  kind,
  source: z.discriminatedUnion('type', [
    z.object({ type: z.literal('folder'), path, recursive: z.boolean().optional() }),
    z.object({ type: z.literal('files'), paths: z.array(path).min(1).max(MAX_ITEMS) })
  ])
}) satisfies z.ZodType<BatchPlanRequest>

export const BatchCreateRequestSchema = z.object({
  kind,
  name: z.string().trim().min(1).max(120).optional(),
  root: path.nullable(),
  items: z
    .array(
      z.object({
        path,
        trackIds: z.array(z.number().int().min(0).max(10_000)).max(64).optional()
      })
    )
    .min(1)
    .max(MAX_ITEMS),
  profileId: z.number().int().optional(),
  targetLang: z.string().min(1).max(64).optional(),
  sourceLang: z.string().min(1).max(64).optional(),
  outputDir: path.optional(),
  options: z
    .object({
      setDefault: z.boolean().optional(),
      keepOriginalSubtitles: z.boolean().optional(),
      alsoWriteSubtitle: z.boolean().optional()
    })
    .optional()
}) satisfies z.ZodType<BatchCreateRequest>

export interface BatchServiceDeps {
  readonly batches: BatchRepository
  readonly jobs: JobManager
  readonly mkv: Pick<MkvToolnix, 'probe'>
  readonly profiles: { get(id: number): Promise<Profile> }
  readonly preferredSourceLangs: () => Promise<string[]>
  readonly newId?: () => string
}

/**
 * Modo batch: plano (varredura + probe + seleção automática) e criação atômica de um grupo de
 * jobs independentes. O batch não executa nada; o estado é agregado dos jobs.
 */
export class BatchService {
  private readonly newId: () => string
  constructor(private readonly deps: BatchServiceDeps) {
    this.newId = deps.newId ?? randomUUID
  }

  async plan(raw: BatchPlanRequest): Promise<BatchPlan> {
    const req = parse(BatchPlanRequestSchema, raw)
    return planBatch(req, this.deps)
  }

  async create(raw: BatchCreateRequest): Promise<Batch> {
    const req = parse(BatchCreateRequestSchema, raw)
    if (req.kind !== 'extract' && req.profileId === undefined)
      throw new AppError('INVALID_INPUT', `profileId is required for ${req.kind}`)

    const realRoot = req.root ? await directory(req.root) : null
    const outRoot = req.outputDir ? await validateOutputDir(req.outputDir) : null
    const exts = req.kind === 'translate' ? SUBTITLE_EXTENSIONS : MEDIA_EXTENSIONS

    // Tudo é resolvido e validado ANTES de inserir: um item ruim recusa o batch inteiro.
    const specs: JobSpec[] = []
    for (const [i, item] of req.items.entries()) {
      const src = await validateInputFile(item.path, exts).catch((err: AppError) => {
        throw new AppError('INVALID_INPUT', `item ${i}: ${err.message}`)
      })
      let outputDir: string | undefined
      if (outRoot) {
        const relDir = realRoot ? relative(realRoot, dirname(src.path)) : ''
        if (relDir.startsWith('..') || isAbsolute(relDir))
          throw new AppError('INVALID_INPUT', `item ${i}: outside the batch folder`)
        outputDir = join(outRoot, relDir)
        await mkdir(outputDir, { recursive: true })
      }
      specs.push(
        await resolveJobSpec(
          this.jobRequest(req, item, src.path, outputDir, i),
          this.deps.profiles
        ).catch((err: unknown) => {
          if (
            err instanceof AppError &&
            (err.code === 'INVALID_INPUT' || err.code === 'INVALID_PATH')
          )
            throw new AppError('INVALID_INPUT', `item ${i}: ${err.message}`)
          throw err
        })
      )
    }

    const id = this.newId()
    const name =
      req.name ??
      (realRoot ? basename(realRoot) : `${specs.length} file${specs.length > 1 ? 's' : ''}`)
    await this.deps.batches.insertWithJobs(
      {
        id,
        name,
        kind: req.kind,
        root: realRoot,
        options: {
          profileId: req.profileId,
          targetLang: req.targetLang,
          sourceLang: req.sourceLang,
          outputDir: outRoot,
          options: req.options
        }
      },
      specs.map((spec) => ({ id: randomUUID(), kind: spec.kind, spec, status: 'queued' as const }))
    )
    this.deps.jobs.kick()
    return this.get(id)
  }

  async list(): Promise<Batch[]> {
    return Promise.all((await this.deps.batches.list()).map((r) => this.toDto(r)))
  }

  async get(id: string): Promise<Batch> {
    const row = await this.deps.batches.get(id)
    if (!row) throw new AppError('BATCH_NOT_FOUND', `Batch ${id} not found`)
    return this.toDto(row)
  }

  async jobs(id: string): Promise<Job[]> {
    await this.get(id)
    const ids = new Set(await this.deps.batches.jobIds(id))
    return (await this.deps.jobs.list()).filter((j) => ids.has(j.id))
  }

  /** Enfileirados primeiro (para a fila não puxar o próximo do batch), depois os que rodam. */
  async cancel(id: string): Promise<Batch> {
    await this.get(id)
    const jobs = await Promise.all(
      (await this.deps.batches.jobIds(id)).map((j) => this.deps.jobs.get(j))
    )
    for (const status of ['queued', 'awaiting-confirmation', 'running'] as const)
      for (const j of jobs.filter((x) => x.status === status))
        await this.deps.jobs.cancel(j.id).catch((err: unknown) => {
          if (!(err instanceof AppError && err.code === 'JOB_INVALID_STATE')) throw err
        })
    return this.get(id)
  }

  /** Só quando todos os jobs terminaram: remove os jobs (e seus diretórios) e o batch. */
  async remove(id: string): Promise<void> {
    const b = await this.get(id)
    if (b.state === 'active')
      throw new AppError('JOB_INVALID_STATE', `Batch ${id} still has active jobs`)
    for (const j of await this.deps.batches.jobIds(id)) await this.deps.jobs.remove(j)
    await this.deps.batches.delete(id)
  }

  private jobRequest(
    req: z.output<typeof BatchCreateRequestSchema>,
    item: { trackIds?: number[] },
    source: string,
    outputDir: string | undefined,
    index: number
  ): JobCreateRequest {
    const common = { source, ...(outputDir ? { outputDir } : {}) }
    switch (req.kind) {
      case 'extract':
        return { kind: 'extract', ...common, trackIds: item.trackIds ?? [] }
      case 'translate':
        return {
          kind: 'translate',
          ...common,
          profileId: req.profileId!,
          targetLang: req.targetLang,
          sourceLang: req.sourceLang
        }
      case 'pipeline': {
        const [trackId] = item.trackIds ?? []
        if (trackId === undefined)
          throw new AppError('INVALID_INPUT', `item ${index}: a track must be selected`)
        return {
          kind: 'pipeline',
          ...common,
          trackId,
          profileId: req.profileId!,
          targetLang: req.targetLang,
          sourceLang: req.sourceLang,
          options: req.options
        }
      }
    }
  }

  private async toDto(r: BatchRow): Promise<Batch> {
    const counts = await this.deps.batches.counts(r.id)
    const total = Object.values(counts).reduce((n, c) => n + (c ?? 0), 0)
    const active = Object.entries(counts).some(([s, c]) => c && !TERMINAL.has(s as JobStatus))
    return {
      id: r.id,
      name: r.name,
      kind: r.kind,
      root: r.root,
      createdAt: r.createdAt.toISOString(),
      total,
      counts,
      state: active ? 'active' : 'finished'
    }
  }
}

function parse<T extends z.ZodType>(schema: T, raw: unknown): z.output<T> {
  const r = schema.safeParse(raw)
  if (!r.success) throw new AppError('INVALID_INPUT', r.error.message)
  return r.data
}

async function directory(p: string): Promise<string> {
  if (!isAbsolute(p)) throw new AppError('INVALID_PATH', 'relative')
  const real = await realpath(p).catch(() => {
    throw new AppError('INVALID_PATH', 'not-found')
  })
  if (!(await stat(real)).isDirectory()) throw new AppError('INVALID_PATH', 'not-a-directory')
  return real
}
