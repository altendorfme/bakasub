import type { PreflightEstimate, Range } from '../../shared/ipc-contract'
import {
  buildContext,
  DEFAULT_CHUNK_LIMITS,
  DEFAULT_CONTEXT_WINDOW,
  planChunks,
  type ChunkLimits
} from '../llm/chunker'
import type { ModelInfo } from '../llm/model-catalog'
import {
  buildSystemPrompt,
  buildTranslateMessage,
  parseGlossary,
  responseSchema
} from '../llm/prompt-builder'
import type { DocumentLookup } from '../memory/job-memory.service'
import type { SubtitleDocument } from '../parsers'
import { countMessageTokens, countTokens, isExactTokenizer } from './token-counter'

/** Tradução ~20% maior que a origem (pt/es a partir de en) + overhead do JSON por linha. */
const OUTPUT_RATIO = 1.2
const JSON_OVERHEAD_PER_LINE = 8
/** Reparos e retries de transporte. */
const RETRY_MARGIN = 1.15
/** Tokenizer local diferente do do modelo. */
const APPROX_LOW = 0.8
const APPROX_HIGH = 1.2

export interface EstimateInput {
  readonly doc: SubtitleDocument<unknown>
  readonly profile: { readonly glossary: readonly unknown[] }
  readonly targetLang: string
  readonly sourceLang?: string
  readonly media?: string
  readonly model: ModelInfo
  /** Resultado de `lookupDocument(..., { peek: true })`. */
  readonly lookup: DocumentLookup
  readonly catalogFetchedAt: number | null
  readonly limits?: Partial<ChunkLimits>
}

/**
 * Simula o envio com o MESMO código de produção (`planChunks`, `buildContext`, `PromptBuilder`,
 * `responseSchema`) e conta tokens localmente (o200k). Traduções ainda desconhecidas entram no
 * contexto como o próprio texto de origem (tamanho parecido). Determinístico.
 */
export function estimatePreflight(input: EstimateInput): Omit<PreflightEstimate, 'decision'> {
  const { lookup, model } = input
  const system = buildSystemPrompt({
    targetLang: input.targetLang,
    sourceLang: input.sourceLang,
    glossary: parseGlossary(input.profile.glossary).entries
  })
  const known = new Map<number, string>()
  for (const [cueId, hit] of lookup.hits) known.set(cueId, hit.translated)
  const timeline = [...[...lookup.hits.values()].map((h) => h.unit), ...lookup.misses]
  const chunks = planChunks(lookup.misses, { ...DEFAULT_CHUNK_LIMITS, ...input.limits })

  let inputTokens = 0
  let outputTokens = 0
  for (const chunk of chunks) {
    const context = buildContext(timeline, chunk, known, DEFAULT_CONTEXT_WINDOW)
    const user = buildTranslateMessage({
      media: input.media,
      context,
      targets: chunk.map((u) => ({ cueId: u.cueId, payload: u.unit.payload }))
    })
    inputTokens += countMessageTokens([
      { role: 'system', content: system },
      { role: 'user', content: user }
    ])
    if (model.structuredOutputs)
      inputTokens += countTokens(JSON.stringify(responseSchema(chunk.map((u) => u.cueId))))
    const target = chunk.reduce((n, u) => n + countTokens(u.unit.payload), 0)
    outputTokens += Math.ceil(target * OUTPUT_RATIO) + chunk.length * JSON_OVERHEAD_PER_LINE
    for (const u of chunk) known.set(u.cueId, u.unit.payload)
  }

  const approximate = !isExactTokenizer(model.tokenizer)
  const range = (base: number): Range => {
    // Um único arredondamento sobre o produto dos fatores.
    return approximate
      ? {
          low: Math.floor(base * APPROX_LOW),
          high: Math.ceil(base * RETRY_MARGIN * APPROX_HIGH)
        }
      : { low: base, high: Math.ceil(base * RETRY_MARGIN) }
  }
  const tokens = { input: range(inputTokens), output: range(outputTokens) }
  const p = model.pricing
  return {
    model: {
      id: model.id,
      pricing: p,
      catalogFetchedAt:
        input.catalogFetchedAt === null ? null : new Date(input.catalogFetchedAt).toISOString()
    },
    approximate,
    lines: {
      total: timeline.length,
      cached: lookup.hits.size,
      toTranslate: lookup.misses.length,
      chunks: chunks.length
    },
    tokens,
    cost: p
      ? {
          low: tokens.input.low * p.prompt + tokens.output.low * p.completion,
          high: tokens.input.high * p.prompt + tokens.output.high * p.completion
        }
      : null
  }
}
