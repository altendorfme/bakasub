import { readSse } from './sse'

export const OPENROUTER_BASE_URL = 'https://openrouter.ai/api/v1'

export type LlmErrorKind =
  /** 401 ou API key ausente. Fatal. */
  | 'auth'
  /** 402, ou 403 de orçamento/limite da key. Fatal. */
  | 'credits'
  /** 400. Fatal (requisição malformada: bug nosso ou modelo incompatível). */
  | 'bad-request'
  /** 403 de moderação ou `finish_reason: content_filter`. Não repete. */
  | 'moderation'
  /** 429. Repete respeitando `Retry-After` / `X-RateLimit-Reset`. */
  | 'rate-limit'
  /** 429 da cota diária de modelos free (50 ou 1000/dia). Fatal até o reset (00:00 UTC). */
  | 'daily-limit'
  /** 502/503: modelo/provedor indisponível. Repete. */
  | 'unavailable'
  /** Outros 5xx (e 404/413/422 inesperados). Repete. */
  | 'server'
  /** 408 ou inatividade do stream. Repete. */
  | 'timeout'
  /** Erro dentro do stream (HTTP 200) ou stream truncado. Repete. */
  | 'stream-error'
  /** Falha de rede/DNS/TLS. Repete. */
  | 'network'
  /** Cancelado por quem chamou. */
  | 'aborted'

/** Erro da camada LLM. A mensagem já vem sem a API key. */
export class LlmError extends Error {
  constructor(
    readonly kind: LlmErrorKind,
    message: string,
    readonly details: {
      status?: number
      retryAfterMs?: number
      /** Cabeçalhos `X-RateLimit-*` (429 gerados pelo próprio OpenRouter). */
      rateLimit?: RateLimitHeaders
      /** Para contabilizar custo de gerações interrompidas (`/generation`). */
      generationId?: string | null
    } = {}
  ) {
    super(message)
    this.name = 'LlmError'
  }
  get status(): number | undefined {
    return this.details.status
  }
  get retryAfterMs(): number | undefined {
    return this.details.retryAfterMs
  }
  get generationId(): string | null | undefined {
    return this.details.generationId
  }
}

export interface RateLimitHeaders {
  readonly limit?: number
  readonly remaining?: number
  /** Epoch ms. */
  readonly resetAtMs?: number
}

/** O que `GET /key` diz sobre a conta (o resto da resposta não nos interessa). */
export interface KeyInfo {
  /** "Nunca comprou créditos". */
  readonly isFreeTier: boolean
  /** Cota diária de modelos free (UTC). `null` se o OpenRouter não informar. */
  readonly freeDaily: { used: number; limit: number; remaining: number } | null
}

export interface ChatMessage {
  readonly role: 'system' | 'user' | 'assistant'
  readonly content: string
}

export type ResponseFormat =
  | { readonly type: 'json_schema'; readonly name: string; readonly schema: object }
  | { readonly type: 'json_object' }

export interface ChatRequest {
  readonly model: string
  readonly messages: readonly ChatMessage[]
  readonly temperature: number
  readonly maxTokens: number
  readonly responseFormat?: ResponseFormat
  /** Só provedores que suportam todos os parâmetros (ex.: `structured_outputs`). */
  readonly requireParameters?: boolean
}

export interface Usage {
  readonly promptTokens: number
  readonly completionTokens: number
  readonly cachedTokens: number
  /** Créditos OpenRouter (1 crédito = 1 USD). */
  readonly cost: number
}

export interface ChatResult {
  readonly content: string
  /** `stop` | `length` (quem chama decide dividir o chunk) | outros. */
  readonly finishReason: string | null
  readonly usage: Usage | null
  readonly generationId: string | null
}

export interface GenerationCost {
  readonly cost: number
  readonly promptTokens: number
  readonly completionTokens: number
}

export interface OpenRouterClientOptions {
  readonly fetch?: typeof fetch
  /** Lida a cada requisição (pode mudar pela UI sem reiniciar). */
  readonly apiKey: () => Promise<string | null>
  readonly baseUrl?: string
  /** Sem nenhum byte (keep-alives contam) por este tempo => `timeout`. Padrão: 60 s. */
  readonly idleTimeoutMs?: number
}

const SECRET_PATTERN = /sk-or-[A-Za-z0-9_-]+/g

/** Remove a key e qualquer token com cara de key OpenRouter. */
export function redact(s: string, key?: string | null): string {
  let out = key ? s.split(key).join('[REDACTED]') : s
  out = out.replace(SECRET_PATTERN, '[REDACTED]')
  return out
}

/** `Retry-After` em segundos ou data HTTP -> ms. */
export function parseRetryAfter(value: string | null, now = Date.now()): number | undefined {
  if (!value) return undefined
  if (/^\d+(\.\d+)?$/.test(value.trim())) return Math.round(Number(value) * 1000)
  const at = Date.parse(value)
  return Number.isNaN(at) ? undefined : Math.max(0, at - now)
}

const intHeader = (h: Headers, name: string): number | undefined => {
  const v = h.get(name)
  if (v === null || !/^\d+$/.test(v.trim())) return undefined
  return Number(v)
}

export function parseRateLimitHeaders(h: Headers): RateLimitHeaders | undefined {
  const limit = intHeader(h, 'x-ratelimit-limit')
  const remaining = intHeader(h, 'x-ratelimit-remaining')
  const resetAtMs = intHeader(h, 'x-ratelimit-reset')
  if (limit === undefined && remaining === undefined && resetAtMs === undefined) return undefined
  return {
    ...(limit !== undefined ? { limit } : {}),
    ...(remaining !== undefined ? { remaining } : {}),
    ...(resetAtMs !== undefined ? { resetAtMs } : {})
  }
}

/** Acima disto, o limite do 429 é a cota diária (50/1000), não a de 20 req/min. */
const DAILY_LIMIT_MIN = 50
/** Reset tão distante só pode ser o da cota diária. */
const DAILY_RESET_MIN_MS = 10 * 60_000

function isDailyLimit(rl: RateLimitHeaders | undefined, now = Date.now()): boolean {
  if (!rl || rl.remaining !== 0) return false
  if (rl.limit !== undefined) return rl.limit >= DAILY_LIMIT_MIN
  return rl.resetAtMs !== undefined && rl.resetAtMs - now > DAILY_RESET_MIN_MS
}

interface ErrorBody {
  error?: { code?: unknown; message?: unknown; metadata?: { limit_source?: unknown } }
}

const BUDGET_SOURCES =
  /^openrouter_(key_limit|guardrail_budget|workspace_budget|credits|in_flight_budget)$/

function kindForStatus(status: number, body: ErrorBody | null): LlmErrorKind {
  if (status === 400) return 'bad-request'
  if (status === 401) return 'auth'
  if (status === 402) return 'credits'
  if (status === 403) {
    const src = body?.error?.metadata?.limit_source
    return typeof src === 'string' && BUDGET_SOURCES.test(src) ? 'credits' : 'moderation'
  }
  if (status === 408) return 'timeout'
  if (status === 429) return 'rate-limit'
  if (status === 502 || status === 503) return 'unavailable'
  return 'server'
}

interface StreamChunk {
  error?: { code?: unknown; message?: unknown }
  choices?: { delta?: { content?: unknown }; finish_reason?: unknown }[]
  usage?: {
    prompt_tokens?: unknown
    completion_tokens?: unknown
    cost?: unknown
    prompt_tokens_details?: { cached_tokens?: unknown }
  }
}

const num = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) ? v : 0)

/**
 * Cliente mínimo de Chat Completions via SSE. Não decide retry nem valida conteúdo: só
 * transporta e classifica erros (`LlmError.kind`). O stream é obrigatório: permite cancelar
 * (provedores com suporte param de cobrar) e detectar inatividade.
 */
export class OpenRouterClient {
  private readonly fetchImpl: typeof fetch
  private readonly baseUrl: string
  private readonly idleTimeoutMs: number

  constructor(private readonly options: OpenRouterClientOptions) {
    this.fetchImpl = options.fetch ?? fetch
    this.baseUrl = options.baseUrl ?? OPENROUTER_BASE_URL
    this.idleTimeoutMs = options.idleTimeoutMs ?? 60_000
  }

  async chat(req: ChatRequest, signal?: AbortSignal): Promise<ChatResult> {
    const key = await this.options.apiKey()
    if (!key) throw new LlmError('auth', 'OpenRouter API key is not set')

    const body = {
      model: req.model,
      messages: req.messages,
      temperature: req.temperature,
      max_tokens: req.maxTokens,
      stream: true,
      ...(req.responseFormat
        ? {
            response_format:
              req.responseFormat.type === 'json_schema'
                ? {
                    type: 'json_schema',
                    json_schema: {
                      name: req.responseFormat.name,
                      strict: true,
                      schema: req.responseFormat.schema
                    }
                  }
                : { type: 'json_object' }
          }
        : {}),
      ...(req.requireParameters ? { provider: { require_parameters: true } } : {})
    }

    const local = new AbortController()
    const idle = new IdleTimer(this.idleTimeoutMs, () => local.abort(new IdleTimeout()))
    const onAbort = (): void => local.abort(signal?.reason)
    if (signal?.aborted) throw new LlmError('aborted', 'Request aborted')
    signal?.addEventListener('abort', onAbort, { once: true })

    let generationId: string | null = null
    const fail = (err: unknown): never => {
      throw this.toError(err, key, signal, generationId)
    }

    try {
      idle.reset()
      const res = await this.fetchImpl(`${this.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: this.headers(key),
        body: JSON.stringify(body),
        signal: local.signal
      }).catch(fail)
      generationId = res.headers.get('x-generation-id')

      if (!res.ok) {
        const text = await res.text().catch(() => '')
        let parsed: ErrorBody | null = null
        try {
          parsed = JSON.parse(text) as ErrorBody
        } catch {
          parsed = null
        }
        const message =
          typeof parsed?.error?.message === 'string' ? parsed.error.message : `HTTP ${res.status}`
        const rateLimit = parseRateLimitHeaders(res.headers)
        const kind = kindForStatus(res.status, parsed)
        throw new LlmError(
          kind === 'rate-limit' && isDailyLimit(rateLimit) ? 'daily-limit' : kind,
          redact(message, key),
          {
            status: res.status,
            retryAfterMs: parseRetryAfter(res.headers.get('retry-after')),
            ...(rateLimit ? { rateLimit } : {}),
            generationId
          }
        )
      }
      if (!res.body) throw new LlmError('stream-error', 'Empty response body', { generationId })

      let content = ''
      let finishReason: string | null = null
      let usage: Usage | null = null
      let done = false
      const stream = readSse(res.body as unknown as AsyncIterable<Uint8Array>, () => idle.reset())
      for await (const ev of stream) {
        if (ev.data === '[DONE]') {
          done = true
          break
        }
        let c: StreamChunk
        try {
          c = JSON.parse(ev.data) as StreamChunk
        } catch {
          continue
        }
        if (c.error) {
          const msg = typeof c.error.message === 'string' ? c.error.message : 'stream error'
          // Limite atingido no meio do stream chega como evento, não como HTTP 429.
          const kind = c.error.code === 429 ? 'rate-limit' : 'stream-error'
          throw new LlmError(kind, redact(msg, key), { generationId })
        }
        const choice = c.choices?.[0]
        if (typeof choice?.delta?.content === 'string') content += choice.delta.content
        if (typeof choice?.finish_reason === 'string') finishReason = choice.finish_reason
        if (c.usage) {
          usage = {
            promptTokens: num(c.usage.prompt_tokens),
            completionTokens: num(c.usage.completion_tokens),
            cachedTokens: num(c.usage.prompt_tokens_details?.cached_tokens),
            cost: num(c.usage.cost)
          }
        }
      }

      if (finishReason === 'error')
        throw new LlmError('stream-error', 'Provider error', { generationId })
      if (finishReason === 'content_filter')
        throw new LlmError('moderation', 'Blocked by content filter', { generationId })
      if (!done && finishReason === null)
        throw new LlmError('stream-error', 'Stream ended unexpectedly', { generationId })
      return { content, finishReason, usage, generationId }
    } catch (err) {
      return fail(err)
    } finally {
      idle.stop()
      signal?.removeEventListener('abort', onAbort)
    }
  }

  /** Custo real de uma geração (ex.: interrompida). Melhor esforço: qualquer falha => `null`. */
  async generationCost(id: string, signal?: AbortSignal): Promise<GenerationCost | null> {
    try {
      const key = await this.options.apiKey()
      if (!key) return null
      const res = await this.fetchImpl(`${this.baseUrl}/generation?id=${encodeURIComponent(id)}`, {
        headers: this.headers(key),
        signal
      })
      if (!res.ok) return null
      const json = (await res.json()) as { data?: Record<string, unknown> }
      const d = json.data
      if (!d || typeof d.total_cost !== 'number') return null
      return {
        cost: d.total_cost,
        promptTokens: num(d.tokens_prompt),
        completionTokens: num(d.tokens_completion)
      }
    } catch {
      return null
    }
  }

  /**
   * `GET /key`: patamar da conta e cota diária de modelos free. `keyOverride` testa uma key
   * candidata antes de salvá-la.
   */
  async keyInfo(signal?: AbortSignal, keyOverride?: string): Promise<KeyInfo> {
    const key = keyOverride ?? (await this.options.apiKey())
    if (!key) throw new LlmError('auth', 'OpenRouter API key is not set')
    let res: Response
    try {
      res = await this.fetchImpl(`${this.baseUrl}/key`, { headers: this.headers(key), signal })
    } catch (err) {
      throw this.toError(err, key, signal, null)
    }
    if (!res.ok)
      throw new LlmError(kindForStatus(res.status, null), `HTTP ${res.status}`, {
        status: res.status
      })
    const json = (await res.json().catch(() => null)) as {
      data?: { is_free_tier?: unknown; free_model_daily_requests?: Record<string, unknown> }
    } | null
    const d = json?.data
    const q = d?.free_model_daily_requests
    const isInt = (v: unknown): v is number =>
      typeof v === 'number' && Number.isInteger(v) && v >= 0
    return {
      isFreeTier: d?.is_free_tier === true,
      freeDaily:
        q && isInt(q.used) && isInt(q.limit) && isInt(q.remaining)
          ? { used: q.used, limit: q.limit, remaining: q.remaining }
          : null
    }
  }

  /** `GET /models` cru (`data[]`). A autenticação é opcional; envia a key se houver. */
  async listModels(signal?: AbortSignal): Promise<unknown[]> {
    const key = await this.options.apiKey()
    let res: Response
    try {
      res = await this.fetchImpl(`${this.baseUrl}/models`, {
        headers: key ? this.headers(key) : { 'X-OpenRouter-Title': 'BakaSub' },
        signal
      })
    } catch (err) {
      throw this.toError(err, key, signal, null)
    }
    if (!res.ok)
      throw new LlmError(kindForStatus(res.status, null), `HTTP ${res.status}`, {
        status: res.status
      })
    const json = (await res.json()) as { data?: unknown }
    if (!Array.isArray(json.data)) throw new LlmError('server', 'Invalid /models response')
    return json.data
  }

  private headers(key: string): Record<string, string> {
    return {
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
      'X-OpenRouter-Title': 'BakaSub'
    }
  }

  private toError(
    err: unknown,
    key: string | null,
    signal: AbortSignal | undefined,
    generationId: string | null
  ): LlmError {
    if (err instanceof LlmError) return err
    if (signal?.aborted) return new LlmError('aborted', 'Request aborted', { generationId })
    if (err instanceof IdleTimeout || (err as { cause?: unknown })?.cause instanceof IdleTimeout)
      return new LlmError('timeout', 'Stream idle timeout', { generationId })
    const message = err instanceof Error ? err.message : String(err)
    return new LlmError('network', redact(message, key), { generationId })
  }
}

class IdleTimeout extends Error {
  constructor() {
    super('idle timeout')
  }
}

class IdleTimer {
  private timer: NodeJS.Timeout | null = null
  constructor(
    private readonly ms: number,
    private readonly onIdle: () => void
  ) {}
  reset(): void {
    this.stop()
    this.timer = setTimeout(this.onIdle, this.ms)
    this.timer.unref?.()
  }
  stop(): void {
    if (this.timer) clearTimeout(this.timer)
    this.timer = null
  }
}
