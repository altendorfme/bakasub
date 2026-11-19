import type { AppErrorCode } from '../errors'
import type { ModelInfo } from './model-catalog'
import {
  LlmError,
  type ChatMessage,
  type ChatResult,
  type GenerationCost,
  type ResponseFormat
} from './openrouter-client'
import { responseSchema } from './prompt-builder'
import type { RateLane, RateLimiter, WaitInfo } from './rate-limiter'
import { decide, DEFAULT_RETRY_CONFIG, type RetryConfig } from './retry-policy'

export interface LlmTransport {
  chat(req: import('./openrouter-client').ChatRequest, signal?: AbortSignal): Promise<ChatResult>
  generationCost(id: string, signal?: AbortSignal): Promise<GenerationCost | null>
}

export interface LlmLog {
  info(msg: string): void
  warn(msg: string): void
  debug(msg: string): void
}

const noop = (): void => undefined
export const silentLog: LlmLog = { info: noop, warn: noop, debug: noop }

export type Sleep = (ms: number, signal?: AbortSignal) => Promise<void>

export interface UsageTotals {
  /** Respostas concluídas (tentativas falhas não contam). */
  requests: number
  promptTokens: number
  completionTokens: number
  cachedTokens: number
  /** Créditos OpenRouter (1 = 1 USD), incluindo gerações interrompidas consultadas em `/generation`. */
  cost: number
  /** Alguma geração interrompida não pôde ter o custo consultado. */
  costIncomplete: boolean
}

/** Sinal interno: o chamador cancelou. `translateDocument` converte em `TranslationCancelled`. */
export class CancelRequested extends Error {
  constructor() {
    super('cancelled')
  }
}

/** Erro fatal de transporte (já classificado). */
export class FatalLlmError extends Error {
  constructor(
    readonly code: AppErrorCode,
    message: string
  ) {
    super(message)
  }
}

export type SessionResponse =
  { type: 'ok'; content: string; finishReason: string | null } | { type: 'moderated' }

/** Atraso antes de consultar `/generation` (o registro pode não estar pronto na hora). */
const COST_LOOKUP_DELAY_MS = 1500
const COST_LOOKUP_TIMEOUT_MS = 5000

/**
 * Uma conversa de job com um modelo: aplica retry de transporte, escolhe o modo de saída
 * estruturada e acumula o uso. Gerações interrompidas (abort, inatividade, erro no stream)
 * têm o custo consultado em segundo plano; `settle()` espera essas consultas.
 */
export class LlmSession {
  readonly usage: UsageTotals = {
    requests: 0,
    promptTokens: 0,
    completionTokens: 0,
    cachedTokens: 0,
    cost: 0,
    costIncomplete: false
  }
  private readonly costLookups: Promise<void>[] = []

  private readonly now: () => number

  constructor(
    private readonly deps: {
      llm: LlmTransport
      sleep: Sleep
      random: () => number
      log: LlmLog
      /** Limitador global (compartilhado entre jobs). */
      limiter: RateLimiter
      /** Lida a cada requisição: mudanças em Settings valem para jobs em andamento. */
      retryConfig?: () => Promise<RetryConfig>
      now?: () => number
      /** Começo (`WaitInfo`) e fim (`null`) de uma espera, para a UI. */
      onWait?: (w: WaitInfo | null) => void
    },
    private readonly params: {
      model: ModelInfo
      lane: RateLane
      temperature: number
      signal?: AbortSignal
    }
  ) {
    this.now = deps.now ?? Date.now
  }

  private format(ids: readonly number[]): {
    responseFormat?: ResponseFormat
    requireParameters?: boolean
  } {
    const m = this.params.model
    if (m.structuredOutputs)
      return {
        responseFormat: { type: 'json_schema', name: 'translations', schema: responseSchema(ids) },
        requireParameters: true
      }
    if (m.responseFormat) return { responseFormat: { type: 'json_object' } }
    return {}
  }

  async request(
    messages: readonly ChatMessage[],
    ids: readonly number[],
    maxTokens: number
  ): Promise<SessionResponse> {
    const { signal, lane } = this.params
    let waited = false
    const onWait = (w: WaitInfo): void => {
      waited = true
      this.deps.onWait?.(w)
    }
    for (let attempt = 1; ; attempt++) {
      if (signal?.aborted) throw new CancelRequested()
      const config = (await this.deps.retryConfig?.()) ?? DEFAULT_RETRY_CONFIG
      try {
        await this.deps.limiter.acquire(lane, { signal, onWait })
      } catch {
        throw new CancelRequested()
      }
      if (waited) {
        waited = false
        this.deps.onWait?.(null)
      }
      try {
        const res = await this.deps.llm.chat(
          {
            model: this.params.model.id,
            messages,
            temperature: this.params.temperature,
            maxTokens,
            ...this.format(ids)
          },
          signal
        )
        this.add(res)
        this.deps.log.info(
          `chat ok model=${this.params.model.id} ids=${ids.length} finish=${res.finishReason} ` +
            `tokens=${res.usage?.promptTokens ?? '?'}/${res.usage?.completionTokens ?? '?'} cost=${res.usage?.cost ?? '?'}`
        )
        return { type: 'ok', content: res.content, finishReason: res.finishReason }
      } catch (err) {
        if (!(err instanceof LlmError)) throw err
        if (err.generationId && ['aborted', 'timeout', 'stream-error'].includes(err.kind))
          this.lookupCost(err.generationId)
        const d = decide(err, attempt, { config, random: this.deps.random, now: this.now() })
        this.deps.log.warn(
          `chat failed kind=${err.kind} status=${err.status ?? '-'} attempt=${attempt} -> ${d.action}: ${err.message}`
        )
        switch (d.action) {
          case 'cancel':
            throw new CancelRequested()
          case 'fatal': {
            const reset = err.details.rateLimit?.resetAtMs
            throw new FatalLlmError(
              d.code,
              d.code === 'LLM_DAILY_LIMIT' && reset
                ? `${err.message} (resets at ${new Date(reset).toISOString()})`
                : err.message
            )
          }
          case 'moderated':
            return { type: 'moderated' }
          case 'retry':
            if (d.scope === 'lane') {
              // 429: a faixa inteira espera; o próximo `acquire` (deste e de outros jobs) segura.
              this.deps.limiter.cooldown(lane, this.now() + d.delayMs)
              break
            }
            onWait({ reason: 'backoff', untilMs: this.now() + d.delayMs })
            try {
              await this.deps.sleep(d.delayMs, signal)
            } catch {
              throw new CancelRequested()
            }
            if (signal?.aborted) throw new CancelRequested()
        }
      }
    }
  }

  /** Espera as consultas de custo pendentes (cada uma tem teto próprio). */
  async settle(): Promise<void> {
    await Promise.allSettled(this.costLookups)
  }

  private add(res: ChatResult): void {
    this.usage.requests++
    if (!res.usage) return
    this.usage.promptTokens += res.usage.promptTokens
    this.usage.completionTokens += res.usage.completionTokens
    this.usage.cachedTokens += res.usage.cachedTokens
    this.usage.cost += res.usage.cost
  }

  private lookupCost(id: string): void {
    this.costLookups.push(
      (async () => {
        await this.deps.sleep(COST_LOOKUP_DELAY_MS).catch(() => undefined)
        const c = await this.deps.llm.generationCost(
          id,
          AbortSignal.timeout(COST_LOOKUP_TIMEOUT_MS)
        )
        if (c) {
          this.usage.cost += c.cost
          this.usage.promptTokens += c.promptTokens
          this.usage.completionTokens += c.completionTokens
        } else this.usage.costIncomplete = true
      })().catch(() => {
        this.usage.costIncomplete = true
      })
    )
  }
}

/** `sleep` real, abortável. */
export const realSleep: Sleep = (ms, signal) =>
  new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(signal.reason)
    const t = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort)
      resolve()
    }, ms)
    const onAbort = (): void => {
      clearTimeout(t)
      reject(signal?.reason)
    }
    signal?.addEventListener('abort', onAbort, { once: true })
  })
