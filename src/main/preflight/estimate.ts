import type { PreflightEstimate, Range } from '../../shared/ipc-contract'
import {
  buildContext,
  DEFAULT_CHUNK_LIMITS,
  DEFAULT_CONTEXT_WINDOW,
  type ChunkLimits
} from '../llm/chunker'
import type { ModelInfo } from '../llm/model-catalog'
import {
  buildSystemPrompt,
  buildTranslateMessage,
  parseGlossary,
  responseSchema
} from '../llm/prompt-builder'
import { planLanes } from '../llm/segmenter'
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
  readonly preset: { readonly glossary: readonly unknown[]; readonly prompt: string }
  readonly targetLang: string
  readonly sourceLang?: string
  readonly media?: string
  readonly model: ModelInfo
  /** Resultado de `lookupDocument(..., { peek: true })`. */
  readonly lookup: DocumentLookup
  readonly catalogFetchedAt: number | null
  readonly limits?: Partial<ChunkLimits>
  /** `llm.concurrency.perJob`: o mesmo corte em lanes da execução. Padrão 1. */
  readonly maxLanes?: number
}

/**
 * Simula o envio com o MESMO código de produção (`planLanes`, `buildContext`, `PromptBuilder`,
 * `responseSchema`) e conta tokens localmente (o200k). Traduções ainda desconhecidas entram no
 * contexto como o próprio texto de origem (tamanho parecido). Cada lane é simulada só com o
 * cache e as próprias traduções, como na execução paralela. Determinístico.
 */
export function estimatePreflight(input: EstimateInput): Omit<PreflightEstimate, 'decision'> {
  const { lookup, model } = input
  const system = buildSystemPrompt({
    targetLang: input.targetLang,
    sourceLang: input.sourceLang,
    glossary: parseGlossary(input.preset.glossary).entries,
    stylePrompt: input.preset.prompt,
    media: input.media
  })
  const cached = new Map<number, string>()
  for (const [cueId, hit] of lookup.hits) cached.set(cueId, hit.translated)
  const timeline = [...[...lookup.hits.values()].map((h) => h.unit), ...lookup.misses]
  const lanes = planLanes(lookup.misses, {
    maxLanes: input.maxLanes ?? 1,
    limits: { ...DEFAULT_CHUNK_LIMITS, ...input.limits }
  })
  const chunks = lanes.flat()

  let inputTokens = 0
  let outputTokens = 0
  for (const lane of lanes) {
    const known = new Map(cached)
    for (const chunk of lane) {
      const context = buildContext(timeline, chunk, known, DEFAULT_CONTEXT_WINDOW)
      const user = buildTranslateMessage({
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
