import { z } from 'zod'
import type { SettingsService } from '../settings/settings.service'

export const MODELS_TTL_MS = 24 * 3_600_000

/** Visão normalizada de um item de `/api/v1/models` (só o que o pipeline/UI usam). */
export interface ModelInfo {
  readonly id: string
  readonly name: string
  readonly contextLength: number | null
  readonly maxCompletionTokens: number | null
  /** `top_provider.is_moderated`: o provedor principal aplica moderação. */
  readonly isModerated: boolean
  /** USD por token; `null` para preço dinâmico (roteadores, `-1`). */
  readonly pricing: { readonly prompt: number; readonly completion: number } | null
  /** `response_format: json_schema` (suporte é por endpoint: usar com `require_parameters`). */
  readonly structuredOutputs: boolean
  /** `response_format: json_object`. */
  readonly responseFormat: boolean
}

const price = z.union([z.string(), z.number()]).transform(Number)
const RawModel = z.looseObject({
  id: z.string().min(1),
  name: z.string().optional(),
  context_length: z.number().nullish(),
  pricing: z.looseObject({ prompt: price, completion: price }).optional(),
  supported_parameters: z.array(z.string()).optional(),
  top_provider: z
    .looseObject({
      max_completion_tokens: z.number().nullish(),
      is_moderated: z.boolean().optional()
    })
    .optional()
})

export function parseModel(raw: unknown): ModelInfo | null {
  const r = RawModel.safeParse(raw)
  if (!r.success) return null
  const m = r.data
  const params = new Set(m.supported_parameters ?? [])
  const p = m.pricing
  const validPrice =
    p && p.prompt >= 0 && p.completion >= 0 && !Number.isNaN(p.prompt + p.completion)
  return {
    id: m.id,
    name: m.name ?? m.id,
    contextLength: m.context_length ?? null,
    maxCompletionTokens: m.top_provider?.max_completion_tokens ?? null,
    isModerated: m.top_provider?.is_moderated ?? false,
    pricing: validPrice ? { prompt: p.prompt, completion: p.completion } : null,
    structuredOutputs: params.has('structured_outputs'),
    responseFormat: params.has('response_format')
  }
}

const CachedModel = z.object({
  id: z.string(),
  name: z.string(),
  contextLength: z.number().nullable(),
  maxCompletionTokens: z.number().nullable(),
  isModerated: z.boolean(),
  pricing: z.object({ prompt: z.number(), completion: z.number() }).nullable(),
  structuredOutputs: z.boolean(),
  responseFormat: z.boolean()
})

export interface CatalogSnapshot {
  readonly models: readonly ModelInfo[]
  readonly fetchedAt: number
  /** `true` quando o refresh falhou e o cache (vencido) foi usado. */
  readonly offline: boolean
}

export interface ModelSource {
  listModels(signal?: AbortSignal): Promise<unknown[]>
}

/**
 * Catálogo de modelos com cache em `settings` (`models.cache`, TTL 24 h). Falha de rede com
 * cache vencido devolve o cache com `offline: true` (mesmo padrão dos manifestos de sidecars).
 */
export class ModelCatalog {
  private readonly now: () => number
  constructor(
    private readonly source: ModelSource,
    private readonly settings: SettingsService,
    options: { now?: () => number } = {}
  ) {
    this.now = options.now ?? Date.now
  }

  async get(options: { force?: boolean; signal?: AbortSignal } = {}): Promise<CatalogSnapshot> {
    const cached = await this.cached()
    if (!options.force && cached && this.now() - cached.fetchedAt < MODELS_TTL_MS)
      return { ...cached, offline: false }
    try {
      const raw = await this.source.listModels(options.signal)
      const models = raw.map(parseModel).filter((m): m is ModelInfo => m !== null)
      const fetchedAt = this.now()
      await this.settings.set('models.cache', { fetchedAt, models: [...models] })
      return { models, fetchedAt, offline: false }
    } catch (err) {
      if (cached) return { ...cached, offline: true }
      throw err
    }
  }

  /** Modelo por id; ausente no cache força um refresh antes de responder `null`. */
  async find(id: string, signal?: AbortSignal): Promise<ModelInfo | null> {
    const snap = await this.get({ signal })
    const hit = snap.models.find((m) => m.id === id)
    if (hit || snap.offline) return hit ?? null
    const fresh = await this.get({ force: true, signal })
    return fresh.models.find((m) => m.id === id) ?? null
  }

  private async cached(): Promise<{ models: ModelInfo[]; fetchedAt: number } | null> {
    const v = await this.settings.get('models.cache')
    if (!v) return null
    const models = z.array(CachedModel).safeParse(v.models)
    return models.success ? { models: models.data, fetchedAt: v.fetchedAt } : null
  }
}
