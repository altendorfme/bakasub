import { randomUUID } from 'node:crypto'
import { mkdir, realpath, stat } from 'node:fs/promises'
import { basename, dirname, isAbsolute, join, relative } from 'node:path'
import { z } from 'zod'
import type {
  Batch,
  BatchCreateRequest,
  BatchGroup,
  BatchMuxPlan,
  BatchMuxPlanRequest,
  BatchPlan,
  BatchPlanRequest,
  Job,
  JobCreateRequest,
  JobStatus,
  Range
} from '../../shared/ipc-contract'
import type { BatchRepository, BatchRow } from '../database/repositories/batch.repository'
import { AppError } from '../errors'
import type { JobManager } from '../jobs/job-manager'
import {
  resolveJobSpec,
  type JobSpec,
  type MediaLookupSource,
  type PresetSource
} from '../jobs/job-spec'
import { MAX_USER_NOTES } from '../presets/preset.schema'
import type { MkvToolnix } from '../media/mkvtoolnix-service'
import {
  MEDIA_EXTENSIONS,
  SUBTITLE_EXTENSIONS,
  validateInputFile,
  validateOutputDir
} from '../media/path-guard'
import { planBatch, planMuxBatch } from './batch-planner'
import { mapPool } from './pool'

/** Resolução dos itens (validação de caminho + lookup do TMDB por episódio) em paralelo. */
const RESOLVE_CONCURRENCY = 4

const TERMINAL: ReadonlySet<JobStatus> = new Set([
  'completed',
  'completed-with-warnings',
  'failed',
  'cancelled',
  'interrupted'
])
const MAX_ITEMS = 2000

const path = z.string().min(1).max(4096)
const kind = z.enum(['extract', 'translate', 'pipeline', 'mux'])

export const BatchPlanRequestSchema = z.object({
  kind,
  source: z.discriminatedUnion('type', [
    z.object({ type: z.literal('folder'), path, recursive: z.boolean().optional() }),
    z.object({ type: z.literal('files'), paths: z.array(path).min(1).max(MAX_ITEMS) })
  ])
})

const episodeNumber = z.number().int().min(0).max(9999)
const optionalText = (max: number): z.ZodOptional<z.ZodString> =>
  z.string().trim().min(1).max(max).optional()

const BatchGroupSchema = z.object({
  name: optionalText(120),
  media: z
    .object({
      provider: z.literal('tmdb'),
      id: z.number().int().positive(),
      kind: z.enum(['movie', 'series'])
    })
    .optional(),
  presetId: optionalText(64),
  model: optionalText(200),
  targetLang: optionalText(64),
  notes: z.string().max(MAX_USER_NOTES).optional()
}) satisfies z.ZodType<BatchGroup>

const MuxCreateItemSchema = z.object({
  video: path,
  subtitles: z
    .array(
      z.object({
        path,
        language: z.string().min(1).max(64),
        name: optionalText(200),
        default: z.boolean().optional()
      })
    )
    .min(1)
    .max(32)
})

export const BatchCreateRequestSchema = z
  .object({
    kind,
    name: z.string().trim().min(1).max(120).optional(),
    root: path.nullable(),
    items: z
      .array(
        z.union([
          MuxCreateItemSchema,
          z.object({
            path,
            trackIds: z.array(z.number().int().min(0).max(10_000)).max(64).optional(),
            group: z.number().int().min(0).max(MAX_ITEMS).optional(),
            season: episodeNumber.optional(),
            episode: episodeNumber.optional()
          })
        ])
      )
      .min(1)
      .max(MAX_ITEMS),
    groups: z.array(BatchGroupSchema).max(MAX_ITEMS).optional(),
    presetId: z.string().min(1).max(64).optional(),
    model: optionalText(200),
    notes: z.string().max(MAX_USER_NOTES).optional(),
    targetLang: z.string().min(1).max(64).optional(),
    sourceLang: z.string().min(1).max(64).optional(),
    outputDir: path.optional(),
    options: z
      .object({
        setDefault: z.boolean().optional(),
        keepOriginalSubtitles: z.boolean().optional(),
        alsoWriteSubtitle: z.boolean().optional()
      })
      .optional(),
    confirmBeforeTranslate: z.boolean().optional()
  })
  .superRefine((req, ctx) => {
    if (req.groups && (req.kind === 'extract' || req.kind === 'mux'))
      ctx.addIssue({
        code: 'custom',
        path: ['groups'],
        message: `${req.kind} batches have no groups`
      })
    req.items.forEach((item, i) => {
      if (isMuxItem(item) !== (req.kind === 'mux'))
        ctx.addIssue({
          code: 'custom',
          path: ['items', i],
          message: `item ${i}: ${req.kind === 'mux' ? 'expected video + subtitles' : 'expected path'}`
        })
      if (!isMuxItem(item) && item.group !== undefined && item.group >= (req.groups?.length ?? 0))
        ctx.addIssue({
          code: 'custom',
          path: ['items', i, 'group'],
          message: `item ${i}: unknown group`
        })
    })
  }) satisfies z.ZodType<BatchCreateRequest>

type ParsedCreate = z.output<typeof BatchCreateRequestSchema>
type ParsedItem = ParsedCreate['items'][number]
type ParsedPathItem = Exclude<ParsedItem, { video: string }>

const isMuxItem = (item: ParsedItem): item is Extract<ParsedItem, { video: string }> =>
  'video' in item

export interface BatchServiceDeps {
  readonly batches: BatchRepository
  readonly jobs: JobManager
  readonly mkv: Pick<MkvToolnix, 'probe'>
  readonly presets: PresetSource
  /** TMDB por obra (mesma fonte dos jobs avulsos); sem ela os jobs vão sem contexto de mídia. */
  readonly media?: MediaLookupSource
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

  plan(raw: BatchMuxPlanRequest): Promise<BatchMuxPlan>
  plan(raw: BatchPlanRequest): Promise<BatchPlan>
  plan(raw: BatchPlanRequest | BatchMuxPlanRequest): Promise<BatchPlan | BatchMuxPlan>
  async plan(raw: BatchPlanRequest | BatchMuxPlanRequest): Promise<BatchPlan | BatchMuxPlan> {
    const req = parse(BatchPlanRequestSchema, raw)
    return req.kind === 'mux'
      ? planMuxBatch({ kind: req.kind, source: req.source })
      : planBatch({ kind: req.kind, source: req.source }, this.deps)
  }

  async create(raw: BatchCreateRequest): Promise<Batch> {
    const req = parse(BatchCreateRequestSchema, raw)

    const realRoot = req.root ? await directory(req.root) : null
    const outRoot = req.outputDir ? await validateOutputDir(req.outputDir) : null
    const exts = req.kind === 'translate' ? SUBTITLE_EXTENSIONS : MEDIA_EXTENSIONS
    const videos = new Set<string>()
    if (req.kind === 'mux')
      req.items.forEach((item, i) => {
        const video = isMuxItem(item) ? item.video : ''
        if (videos.has(video))
          throw new AppError('INVALID_INPUT', `item ${i}: video already in the batch`)
        videos.add(video)
      })

    // Tudo é resolvido e validado ANTES de inserir: um item ruim recusa o batch inteiro (o
    // erro reportado é o do primeiro item, em ordem, independente do paralelismo).
    const resolved = await mapPool(req.items, RESOLVE_CONCURRENCY, async (item, i) => {
      try {
        return { spec: await this.resolveItem(req, item, i, exts, realRoot, outRoot) }
      } catch (err) {
        return { err }
      }
    })
    const failed = resolved.find((r) => 'err' in r)
    if (failed && 'err' in failed) throw failed.err
    const specs = resolved.map((r) => (r as { spec: JobSpec }).spec)

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
          presetId: req.presetId,
          model: req.model,
          notes: req.notes,
          targetLang: req.targetLang,
          sourceLang: req.sourceLang,
          groups: req.groups,
          outputDir: outRoot,
          options: req.options,
          confirmBeforeTranslate: req.confirmBeforeTranslate
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
    return this.jobsOf(id)
  }

  /** Sem validar a existência: usado por `toDto` (evita get -> toDto -> jobs -> get…). */
  private async jobsOf(id: string): Promise<Job[]> {
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

  /** Confirma todos os jobs do batch que aguardam a estimativa. */
  async confirm(id: string): Promise<Batch> {
    for (const j of await this.jobs(id))
      if (j.status === 'awaiting-confirmation') await this.deps.jobs.confirm(j.id)
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

  private async resolveItem(
    req: ParsedCreate,
    item: ParsedItem,
    i: number,
    exts: readonly string[],
    realRoot: string | null,
    outRoot: string | null
  ): Promise<JobSpec> {
    const src = await validateInputFile(isMuxItem(item) ? item.video : item.path, exts).catch(
      (err: AppError) => {
        throw new AppError('INVALID_INPUT', `item ${i}: ${err.message}`)
      }
    )
    let outputDir: string | undefined
    if (outRoot) {
      const relDir = realRoot ? relative(realRoot, dirname(src.path)) : ''
      if (relDir.startsWith('..') || isAbsolute(relDir))
        throw new AppError('INVALID_INPUT', `item ${i}: outside the batch folder`)
      outputDir = join(outRoot, relDir)
      await mkdir(outputDir, { recursive: true })
    }
    return resolveJobSpec(
      this.jobRequest(req, item, src.path, outputDir, i),
      this.deps.presets,
      this.deps.media
    ).catch((err: unknown) => {
      if (err instanceof AppError && (err.code === 'INVALID_INPUT' || err.code === 'INVALID_PATH'))
        throw new AppError('INVALID_INPUT', `item ${i}: ${err.message}`)
      throw err
    })
  }

  /** Padrões do batch, substituídos pelos da obra do item; a mídia vem só da obra. */
  private translation(
    req: ParsedCreate,
    item: ParsedPathItem
  ): Omit<Extract<JobCreateRequest, { kind: 'translate' }>, 'kind' | 'source' | 'outputDir'> {
    const g = item.group === undefined ? undefined : req.groups?.[item.group]
    return {
      presetId: g?.presetId ?? req.presetId,
      model: g?.model ?? req.model,
      notes: g?.notes ?? req.notes,
      targetLang: g?.targetLang ?? req.targetLang,
      sourceLang: req.sourceLang,
      ...(g?.media
        ? {
            media: {
              ref: g.media,
              ...(item.season !== undefined ? { season: item.season } : {}),
              ...(item.episode !== undefined ? { episode: item.episode } : {})
            }
          }
        : {}),
      confirmBeforeTranslate: req.confirmBeforeTranslate
    }
  }

  private jobRequest(
    req: ParsedCreate,
    item: ParsedItem,
    source: string,
    outputDir: string | undefined,
    index: number
  ): JobCreateRequest {
    const common = { source, ...(outputDir ? { outputDir } : {}) }
    if (isMuxItem(item))
      return {
        kind: 'mux',
        ...common,
        subtitles: item.subtitles,
        options: {
          setDefault: req.options?.setDefault,
          keepOriginalSubtitles: req.options?.keepOriginalSubtitles
        }
      }
    switch (req.kind) {
      case 'mux':
        throw new AppError('INVALID_INPUT', `item ${index}: expected video + subtitles`)
      case 'extract':
        return { kind: 'extract', ...common, trackIds: item.trackIds ?? [] }
      case 'translate':
        return { kind: 'translate', ...common, ...this.translation(req, item) }
      case 'pipeline': {
        const [trackId] = item.trackIds ?? []
        if (trackId === undefined)
          throw new AppError('INVALID_INPUT', `item ${index}: a track must be selected`)
        return {
          kind: 'pipeline',
          ...common,
          trackId,
          ...this.translation(req, item),
          options: req.options
        }
      }
    }
  }

  private async preflightTotals(id: string): Promise<Batch['preflight']> {
    const waiting = (await this.jobsOf(id)).filter((j) => j.status === 'awaiting-confirmation')
    let cost: Range | null = { low: 0, high: 0 }
    let toTranslate = 0
    let approximate = false
    for (const j of waiting) {
      const e = j.result?.preflight
      if (!e) continue
      toTranslate += e.lines.toTranslate
      approximate ||= e.approximate
      cost = cost && e.cost ? sum(cost, e.cost) : null
    }
    return { awaiting: waiting.length, toTranslate, cost, approximate }
  }

  private async toDto(r: BatchRow): Promise<Batch> {
    const counts = await this.deps.batches.counts(r.id)
    const total = Object.values(counts).reduce((n, c) => n + (c ?? 0), 0)
    const active = Object.entries(counts).some(([s, c]) => c && !TERMINAL.has(s as JobStatus))
    const preflight = counts['awaiting-confirmation'] ? await this.preflightTotals(r.id) : undefined
    return {
      ...(preflight ? { preflight } : {}),
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

function sum(a: Range, b: Range): Range {
  return { low: a.low + b.low, high: a.high + b.high }
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
