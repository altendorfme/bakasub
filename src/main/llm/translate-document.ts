import { AppError } from '../errors'
import type { HashedUnit } from '../memory/context-hash'
import { JobMemoryService } from '../memory/job-memory.service'
import {
  applyTranslation,
  type Cue,
  type InlineLexer,
  type Item,
  type SubtitleDocument
} from '../parsers'
import { DEFAULT_CHUNK_LIMITS, planChunks, type ChunkLimits } from './chunker'
import { ChunkTranslator, type LineFailure } from './chunk-translator'
import {
  CancelRequested,
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

/** Acima desta fração de linhas esgotadas (validação), o job falha. Moderação não conta. */
export const MAX_FAILED_RATIO = 0.1

export interface TranslateInput<F> {
  readonly doc: SubtitleDocument<F>
  readonly format: { readonly lexInline: InlineLexer }
  readonly profile: {
    readonly model: string
    readonly glossary: readonly unknown[]
    readonly temperature: number
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
}

export interface TranslateProgress {
  readonly phase: 'lookup' | 'translating'
  /** Linhas a traduzir já resolvidas (traduzidas ou falhas). */
  readonly done: number
  /** Total de linhas traduzíveis do documento. */
  readonly total: number
  readonly cached: number
  readonly chunk?: { readonly index: number; readonly count: number }
  readonly cost: number
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
  readonly status: 'completed' | 'completed-with-warnings'
}

/** Cancelado pelo chamador. O que já foi traduzido está no Job Memory; `usage` traz o custo. */
export class TranslationCancelled extends AppError {
  constructor(readonly usage: UsageTotals) {
    super('CANCELLED', 'Translation cancelled')
  }
}

/**
 * Traduz um documento: lookup no Job Memory, chunks sequenciais só com os misses, gravação por
 * chunk, e montagem do documento final. A serialização fica com quem chama.
 */
export async function translateDocument<F>(
  input: TranslateInput<F>,
  deps: TranslateDeps,
  options: TranslateOptions = {}
): Promise<TranslateResult<F>> {
  const { signal, onProgress } = options
  const log = deps.log ?? silentLog

  const model = await deps.models.find(input.profile.model, signal)
  if (!model)
    throw new AppError('LLM_UNKNOWN_MODEL', `Model not found on OpenRouter: ${input.profile.model}`)

  const glossary = parseGlossary(input.profile.glossary)
  if (glossary.invalid) log.warn(`glossary: ${glossary.invalid} invalid entries ignored`)

  const ctx = JobMemoryService.context({
    targetLang: input.targetLang,
    model: model.id,
    glossary: glossary.entries,
    lexInline: input.format.lexInline,
    sourceLang: input.sourceLang
  })

  const lookup = await deps.memory.lookupDocument(input.doc, ctx)
  const known = new Map<number, string>()
  for (const [cueId, hit] of lookup.hits) known.set(cueId, hit.translated)
  const timeline: HashedUnit[] = [...[...lookup.hits.values()].map((h) => h.unit), ...lookup.misses]
  const total = timeline.length
  const maxFailed = Math.floor(total * MAX_FAILED_RATIO)

  const session = new LlmSession(
    { llm: deps.llm, sleep: deps.sleep ?? realSleep, random: deps.random ?? Math.random, log },
    { model, temperature: input.profile.temperature, signal }
  )
  const failed: LineFailure[] = []
  let validationFailed = 0
  let done = 0
  const progress = (p: Omit<TranslateProgress, 'total' | 'cached' | 'cost'>): void =>
    onProgress?.({ ...p, total, cached: lookup.hits.size, cost: session.usage.cost })

  progress({ phase: 'lookup', done: 0 })

  const translator = new ChunkTranslator(
    session,
    {
      system: buildSystemPrompt({
        targetLang: input.targetLang,
        sourceLang: input.sourceLang,
        glossary: glossary.entries
      }),
      media: input.media,
      timeline,
      known,
      lexInline: input.format.lexInline,
      maxCompletionTokens: model.maxCompletionTokens,
      log
    },
    {
      accept: async (entries) => {
        const r = await deps.memory.commitChunk(
          ctx,
          entries.map((e) => ({ hashed: e.unit, translated: e.translated })),
          signal
        )
        done += entries.length
        if (r.rejected.length) log.warn(`memory rejected ids: ${r.rejected.join(',')}`)
      },
      fail: (f) => {
        failed.push(f)
        done++
        if (f.reason === 'UNTRANSLATED_VALIDATION_FAILED') validationFailed++
      }
    }
  )

  const chunks = planChunks(lookup.misses, { ...DEFAULT_CHUNK_LIMITS, ...input.limits })
  try {
    for (const [i, chunk] of chunks.entries()) {
      await translator.run(chunk)
      if (validationFailed > maxFailed)
        throw new AppError(
          'LLM_TOO_MANY_FAILURES',
          `${validationFailed} of ${total} lines failed validation`
        )
      progress({ phase: 'translating', done, chunk: { index: i + 1, count: chunks.length } })
    }
  } catch (err) {
    await session.settle()
    if (err instanceof CancelRequested || (err instanceof AppError && err.code === 'CANCELLED'))
      throw new TranslationCancelled({ ...session.usage })
    if (err instanceof FatalLlmError) throw new AppError(err.code, err.message)
    throw err
  }
  await session.settle()

  const units = new Map(timeline.map((u) => [u.cueId, u]))
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
    usage: { ...session.usage },
    cache: { hits: lookup.hits.size, misses: lookup.misses.length },
    status: failed.length > 0 ? 'completed-with-warnings' : 'completed'
  }
}
