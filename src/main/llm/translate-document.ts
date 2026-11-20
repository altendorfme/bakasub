import { randomUUID } from 'node:crypto'
import type { TimelineRange, TranslationTimeline } from '../../shared/ipc-contract'
import { AppError } from '../errors'
import type { HashedUnit } from '../memory/context-hash'
import { JobMemoryService } from '../memory/job-memory.service'
import {
  applyTranslation,
  validateTranslation,
  type Cue,
  type InlineLexer,
  type Item,
  type SubtitleDocument
} from '../parsers'
import { DEFAULT_CHUNK_LIMITS, type ChunkLimits } from './chunker'
import { ChunkTranslator, type LineFailure } from './chunk-translator'
import {
  CancelRequested,
  DrainRequested,
  FatalLlmError,
  LlmSession,
  realSleep,
  silentLog,
  type LlmLog,
  type LlmTransport,
  type Sleep,
  type UsageTotals
} from './llm-session'
import type { ModelInfo } from './model-catalog'
import { buildSystemPrompt, parseGlossary } from './prompt-builder'
import { laneOf, RateLimiter, type WaitInfo } from './rate-limiter'
import { DEFAULT_RETRY_CONFIG, type RetryConfig } from './retry-policy'
import { planLanes } from './segmenter'

/**
 * Acima desta fração de falas distintas (context hash) esgotadas na validação, o job falha.
 * Moderação não conta; cópias de uma fala (letreiro quadro a quadro) contam uma vez só.
 */
export const MAX_FAILED_RATIO = 0.1
/** Espera antes da rodada extra N de um chunk (60 s, 120 s…). */
export const CHUNK_ROUND_DELAY_MS = 60_000

export interface RetrySettings extends RetryConfig {
  /** Rodadas extras de um chunk depois de esgotar o retry de transporte. */
  readonly chunkRounds: number
}

export const DEFAULT_RETRY_SETTINGS: RetrySettings = { ...DEFAULT_RETRY_CONFIG, chunkRounds: 2 }

export interface TranslateInput<F> {
  readonly doc: SubtitleDocument<F>
  readonly format: { readonly lexInline: InlineLexer }
  /** Preset já resolvido (modelo definido). */
  readonly preset: {
    readonly model: string
    readonly glossary: readonly unknown[]
    readonly temperature: number
    /** Orientação de estilo do tipo de mídia (System Prompt + chave do cache). */
    readonly prompt: string
  }
  readonly targetLang: string
  readonly sourceLang?: string
  /** Contexto de mídia (sinopse etc.), opcional. */
  readonly media?: string
  readonly limits?: Partial<ChunkLimits>
}

export interface TranslateDeps {
  readonly llm: LlmTransport
  readonly memory: JobMemoryService
  readonly models: { find(id: string, signal?: AbortSignal): Promise<ModelInfo | null> }
  readonly log?: LlmLog
  readonly sleep?: Sleep
  readonly random?: () => number
  readonly now?: () => number
  /** Limitador global do processo. Sem ele, só o cooldown local de 429 (sem teto por minuto). */
  readonly limiter?: RateLimiter
  /** Lido a cada requisição/rodada (Settings → Avançado). */
  readonly retrySettings?: () => Promise<RetrySettings>
  /** Máximo de lanes deste arquivo (`llm.concurrency.perJob`). Padrão 1 = sequencial. */
  readonly lanes?: () => Promise<number>
  /** `session_id` das requisições (sticky routing). Padrão: UUID por tradução. */
  readonly sessionId?: () => string
}

export interface TranslateProgress {
  readonly phase: 'lookup' | 'translating'
  /** Linhas a traduzir já resolvidas (traduzidas ou falhas). */
  readonly done: number
  /** Total de linhas traduzíveis do documento. */
  readonly total: number
  readonly cached: number
  readonly chunk?: { readonly completed: number; readonly count: number; readonly inFlight: number }
  readonly timeline?: TranslationTimeline
  readonly cost: number
  /** Todas as lanes ativas paradas esperando (limite, cooldown ou backoff). Ausente = trabalhando. */
  readonly waiting?: WaitInfo
}

export interface TranslateOptions {
  readonly signal?: AbortSignal
  readonly onProgress?: (p: TranslateProgress) => void
}

export interface TranslateResult<F> {
  /** Cues traduzidos via `applyTranslation`; tudo o mais intacto. */
  readonly doc: SubtitleDocument<F>
  readonly failed: readonly LineFailure[]
  readonly usage: UsageTotals
  readonly cache: { readonly hits: number; readonly misses: number }
  /** Falas resolvidas reaplicando a tradução de outra com o mesmo context hash. */
  readonly copies: number
  readonly status: 'completed' | 'completed-with-warnings'
}

/** Cancelado pelo chamador. O que já foi traduzido está no Job Memory; `usage` traz o custo. */
export class TranslationCancelled extends AppError {
  constructor(readonly usage: UsageTotals) {
    super('CANCELLED', 'Translation cancelled')
  }
}

/**
 * Traduz um documento: lookup no Job Memory, só os misses vão ao LLM, em lanes paralelas
 * (`planLanes`), cada uma sequencial por dentro; gravação por chunk e montagem do documento
 * final. A serialização fica com quem chama.
 *
 * Falha fatal numa lane drena o job: nenhuma requisição nova sai, as em voo terminam e o que
 * voltar válido é gravado. Cancelamento do chamador aborta tudo na hora.
 */
export async function translateDocument<F>(
  input: TranslateInput<F>,
  deps: TranslateDeps,
  options: TranslateOptions = {}
): Promise<TranslateResult<F>> {
  const { signal, onProgress } = options
  const log = deps.log ?? silentLog

  const model = await deps.models.find(input.preset.model, signal)
  if (!model)
    throw new AppError('LLM_UNKNOWN_MODEL', `Model not found on OpenRouter: ${input.preset.model}`)

  const glossary = parseGlossary(input.preset.glossary)
  if (glossary.invalid) log.warn(`glossary: ${glossary.invalid} invalid entries ignored`)

  const ctx = JobMemoryService.context({
    targetLang: input.targetLang,
    model: model.id,
    glossary: glossary.entries,
    stylePrompt: input.preset.prompt,
    lexInline: input.format.lexInline,
    sourceLang: input.sourceLang
  })

  const lookup = await deps.memory.lookupDocument(input.doc, ctx)
  const known = new Map<number, string>()
  for (const [cueId, hit] of lookup.hits) known.set(cueId, hit.translated)
  // Contexto do LLM: cache + representantes. As cópias repetiriam a mesma fala no `<context>`.
  const timeline: HashedUnit[] = [...[...lookup.hits.values()].map((h) => h.unit), ...lookup.misses]
  const copyUnits = [...lookup.copies.values()].flat()
  const allUnits = [...timeline, ...copyUnits]
  const total = allUnits.length
  const distinct = new Set(allUnits.map((u) => u.hash)).size
  const maxFailed = Math.floor(distinct * MAX_FAILED_RATIO)

  const sleep = deps.sleep ?? realSleep
  const now = deps.now ?? Date.now
  const settings = deps.retrySettings ?? (async () => DEFAULT_RETRY_SETTINGS)
  const limiter =
    deps.limiter ??
    new RateLimiter({ config: async () => ({ freeRpm: Infinity, paidRpm: null }), sleep, now })

  const lanes = planLanes(lookup.misses, {
    maxLanes: Math.max(1, (await deps.lanes?.()) ?? 1),
    limits: { ...DEFAULT_CHUNK_LIMITS, ...input.limits }
  })
  const chunkCount = lanes.reduce((n, l) => n + l.length, 0)
  if (lanes.length > 1)
    log.info(`translating in ${lanes.length} lanes: ${lanes.map((l) => l.length).join('+')} chunks`)

  const timeIndexOf = new Map(allUnits.map((u) => [u.cueId, u.timeIndex]))
  const cachedRanges = toRanges([...lookup.hits.values()].map((h) => h.unit.timeIndex))
  const laneRanges: TimelineRange[] = lanes.map((l) => {
    const lastChunk = l[l.length - 1]
    return [l[0][0].timeIndex, lastChunk[lastChunk.length - 1].timeIndex + 1]
  })
  const translatedIdx = new Set<number>()
  const failedIdx = new Set<number>()
  /** Chunk em voo de cada lane. */
  const active = new Map<number, readonly HashedUnit[]>()
  /** Espera atual de cada lane. */
  const waits = new Map<number, WaitInfo>()
  /** Lanes que ainda não terminaram. */
  const running = new Set<number>()

  const failed: LineFailure[] = []
  const failedIds = new Set<number>()
  /** Representantes esgotados na validação (uma vez por grupo de cópias). */
  let validationFailed = 0
  const markFailed = (f: LineFailure): void => {
    failed.push(f)
    failedIds.add(f.cueId)
    const idx = timeIndexOf.get(f.cueId)
    if (idx !== undefined) failedIdx.add(idx)
    done++
  }
  let done = 0
  let completed = 0
  let phase: TranslateProgress['phase'] = 'lookup'

  const sessions: LlmSession[] = []
  const usage = (): UsageTotals => sumUsage(sessions.map((s) => s.usage))

  /** Só "esperando" quando todas as lanes ativas esperam; mostra a que volta primeiro. */
  const waiting = (): WaitInfo | undefined => {
    let first: WaitInfo | undefined
    for (const lane of running) {
      const w = waits.get(lane)
      if (!w) return undefined
      if (!first || w.untilMs < first.untilMs) first = w
    }
    return first
  }
  const emit = (): void => {
    if (!onProgress) return
    const w = waiting()
    onProgress({
      phase,
      done,
      total,
      cached: lookup.hits.size,
      ...(chunkCount > 0 ? { chunk: { completed, count: chunkCount, inFlight: active.size } } : {}),
      timeline: {
        total,
        cached: cachedRanges,
        translated: toRanges(translatedIdx),
        failed: toRanges(failedIdx),
        active: toRanges([...active.values()].flatMap((c) => c.map((u) => u.timeIndex))),
        lanes: laneRanges
      },
      cost: usage().cost,
      ...(w ? { waiting: w } : {})
    })
  }

  emit()
  phase = 'translating'

  const sessionId = deps.sessionId?.() ?? randomUUID()
  const system = buildSystemPrompt({
    targetLang: input.targetLang,
    sourceLang: input.sourceLang,
    glossary: glossary.entries,
    stylePrompt: input.preset.prompt,
    media: input.media
  })
  const drain = new AbortController()
  let fatal: unknown = null
  const stop = (err: unknown): void => {
    if (fatal === null) fatal = err
    drain.abort()
  }
  /** Esperas entre rodadas param com cancelamento ou drenagem. */
  const waitSignal = signal ? AbortSignal.any([signal, drain.signal]) : drain.signal

  const runLane = async (laneIdx: number): Promise<void> => {
    const session = new LlmSession(
      {
        llm: deps.llm,
        sleep,
        random: deps.random ?? Math.random,
        log,
        limiter,
        retryConfig: settings,
        now,
        onWait: (w) => {
          if (w) waits.set(laneIdx, w)
          else waits.delete(laneIdx)
          emit()
        }
      },
      {
        model,
        lane: laneOf(model),
        temperature: input.preset.temperature,
        signal,
        sessionId,
        drain: drain.signal
      }
    )
    sessions.push(session)
    const translator = new ChunkTranslator(
      session,
      {
        system,
        timeline,
        known,
        lexInline: input.format.lexInline,
        maxCompletionTokens: model.maxCompletionTokens,
        log
      },
      {
        accept: async (entries) => {
          // Sem `signal`: a resposta já foi paga e validada; o abort só impede novas requisições
          // (a próxima `session.request` vê o signal e cancela). A transação é curta e atômica.
          // Só os representantes: as cópias têm o mesmo context hash, logo a mesma linha no cache.
          const r = await deps.memory.commitChunk(
            ctx,
            entries.map((e) => ({ hashed: e.unit, translated: e.translated }))
          )
          done += entries.length
          for (const e of entries) {
            translatedIdx.add(e.unit.timeIndex)
            for (const copy of lookup.copies.get(e.unit.cueId) ?? []) {
              // Mesmo payload normalizado => mesma forma de marcadores; valida contra o esqueleto
              // da própria cópia por segurança.
              const issues = validateTranslation(copy.unit, e.translated, input.format.lexInline)
              if (issues.length > 0) {
                markFailed({ cueId: copy.cueId, reason: 'UNTRANSLATED_VALIDATION_FAILED', issues })
                continue
              }
              known.set(copy.cueId, e.translated)
              translatedIdx.add(copy.timeIndex)
              done++
            }
          }
          if (r.rejected.length) log.warn(`memory rejected ids: ${r.rejected.join(',')}`)
          emit()
        },
        fail: (f) => {
          markFailed(f)
          for (const copy of lookup.copies.get(f.cueId) ?? [])
            markFailed({ ...f, cueId: copy.cueId })
          if (f.reason === 'UNTRANSLATED_VALIDATION_FAILED') validationFailed++
        }
      }
    )

    const chunks = lanes[laneIdx]
    for (const [i, chunk] of chunks.entries()) {
      if (fatal !== null || signal?.aborted) return
      active.set(laneIdx, chunk)
      emit()
      try {
        for (let round = 0; ; round++) {
          // Numa rodada extra, só o que a anterior não resolveu (aceitas já estão no Job Memory).
          const rest = chunk.filter((u) => !known.has(u.cueId) && !failedIds.has(u.cueId))
          if (rest.length === 0) break
          try {
            await translator.run(rest)
            break
          } catch (err) {
            const rounds = (await settings()).chunkRounds
            if (
              !(err instanceof FatalLlmError && err.code === 'LLM_UNAVAILABLE') ||
              round >= rounds
            )
              throw err
            const delay = CHUNK_ROUND_DELAY_MS * (round + 1)
            log.warn(
              `lane ${laneIdx + 1}/${lanes.length} chunk ${i + 1}/${chunks.length}: retries ` +
                `exhausted (${err.message}); extra round ${round + 1}/${rounds} in ${delay / 1000}s`
            )
            waits.set(laneIdx, { reason: 'backoff', untilMs: now() + delay })
            emit()
            try {
              await sleep(delay, waitSignal)
            } catch {
              throw signal?.aborted ? new CancelRequested() : new DrainRequested()
            }
            waits.delete(laneIdx)
          }
        }
      } catch (err) {
        // Drenagem: outra lane já registrou o motivo; esta só sai.
        if (!(err instanceof DrainRequested)) stop(err)
        return
      } finally {
        active.delete(laneIdx)
        waits.delete(laneIdx)
      }
      completed++
      if (validationFailed > maxFailed)
        stop(
          new AppError(
            'LLM_TOO_MANY_FAILURES',
            `${validationFailed} of ${distinct} distinct lines failed validation`
          )
        )
      emit()
    }
  }

  for (let i = 0; i < lanes.length; i++) running.add(i)
  await Promise.all(
    lanes.map(async (_, laneIdx) => {
      try {
        await runLane(laneIdx)
      } catch (err) {
        stop(err)
      } finally {
        running.delete(laneIdx)
      }
    })
  )
  await Promise.all(sessions.map((s) => s.settle()))

  if (fatal !== null || signal?.aborted) {
    const err = fatal ?? new CancelRequested()
    if (
      signal?.aborted ||
      err instanceof CancelRequested ||
      (err instanceof AppError && err.code === 'CANCELLED')
    )
      throw new TranslationCancelled(usage())
    if (err instanceof FatalLlmError) throw new AppError(err.code, err.message)
    throw err
  }
  emit()

  const units = new Map(allUnits.map((u) => [u.cueId, u]))
  const items = input.doc.items.map((item): Item<F> => {
    if (item.kind !== 'cue') return item
    const translated = known.get(item.id)
    const unit = units.get(item.id)
    if (translated === undefined || !unit) return item
    const r = applyTranslation(item as Cue<F>, unit.unit, translated, input.format.lexInline)
    return r.ok ? r.cue : item
  })

  return {
    doc: { ...input.doc, items },
    failed,
    usage: usage(),
    cache: { hits: lookup.hits.size, misses: lookup.misses.length + copyUnits.length },
    copies: copyUnits.length,
    status: failed.length > 0 ? 'completed-with-warnings' : 'completed'
  }
}

function sumUsage(all: readonly UsageTotals[]): UsageTotals {
  const u: UsageTotals = {
    requests: 0,
    promptTokens: 0,
    completionTokens: 0,
    cachedTokens: 0,
    cost: 0,
    costIncomplete: false
  }
  for (const x of all) {
    u.requests += x.requests
    u.promptTokens += x.promptTokens
    u.completionTokens += x.completionTokens
    u.cachedTokens += x.cachedTokens
    u.cost += x.cost
    u.costIncomplete ||= x.costIncomplete
  }
  return u
}

/** Posições -> faixas `[from, to)` ordenadas e fundidas. */
export function toRanges(indices: Iterable<number>): TimelineRange[] {
  const sorted = [...new Set(indices)].sort((a, b) => a - b)
  const out: [number, number][] = []
  for (const i of sorted) {
    const last = out[out.length - 1]
    if (last && last[1] === i) last[1] = i + 1
    else out.push([i, i + 1])
  }
  return out
}
