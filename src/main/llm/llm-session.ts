import type { AppErrorCode } from '../errors'
import type { ModelInfo } from './model-catalog'
import { planReasoning, type ReasoningRequest } from './reasoning'
import {
  LlmError,
  type ChatMessage,
  type ChatResult,
  type GenerationCost
} from './openrouter-client'
import { initialOutputMode, OutputModeState, requestFormat } from './output-mode'
import type { Lease, RateLane, RateLimiter, WaitInfo } from './rate-limiter'
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

/**
 * Sinal interno: outra lane falhou e o job está drenando. Só interrompe esperas e novas
 * requisições; um stream em voo nunca é abortado por isso (a resposta já está sendo paga).
 */
export class DrainRequested extends Error {
  constructor() {
    super('draining')
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
  | {
      type: 'ok'
      content: string
      finishReason: string | null
      /** Saída cobrada (inclui raciocínio); `null` sem `usage`. */
      completionTokens: number | null
      /** Parte de `completionTokens` gasta em raciocínio; `null` quando não informada. */
      reasoningTokens: number | null
    }
  | { type: 'moderated' }

/** Atraso antes de consultar `/generation` (o registro pode não estar pronto na hora). */
const COST_LOOKUP_DELAY_MS = 1500
const COST_LOOKUP_TIMEOUT_MS = 5000

export const OPENROUTER_PRIVACY_URL = 'https://openrouter.ai/settings/privacy'

/** 404 em todos os degraus: o modelo não é a única causa possível. */
export function noEndpointMessage(model: string, detail: string): string {
  return (
    `No OpenRouter endpoint accepted requests for ${model} in any output mode ` +
    `(json_schema, json_object, prompt only): ${detail.replace(/\.+$/, '')}. Besides the model itself, your ` +
    `OpenRouter account's provider restrictions (Settings → Privacy: allowed/ignored providers, ` +
    `ZDR) may be excluding every endpoint: ${OPENROUTER_PRIVACY_URL}`
  )
}

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
  private readonly outputMode: OutputModeState
  /** `reasoning` mandado em toda requisição (ver `planReasoning`); ausente = nada. */
  private readonly reasoning: ReasoningRequest | undefined

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
      /** `session_id` do OpenRouter (sticky routing: mesmo provedor, cache do prefixo). */
      sessionId?: string
      /** Drenagem (ver `DrainRequested`): corta esperas e novas requisições, não o stream. */
      drain?: AbortSignal
      /** Modo de saída do job, compartilhado entre lanes. Ausente: um só desta sessão. */
      outputMode?: OutputModeState
    }
  ) {
    this.now = deps.now ?? Date.now
    this.outputMode = params.outputMode ?? new OutputModeState(initialOutputMode(params.model))
    this.reasoning = planReasoning(params.model).request
  }

  async request(
    messages: readonly ChatMessage[],
    ids: readonly number[],
    maxTokens: number
  ): Promise<SessionResponse> {
    const { signal, lane, drain } = this.params
    // Esperas (vaga, cooldown, backoff) param com cancelamento ou drenagem; o `chat`, só com cancelamento.
    const waitSignal = drain && signal ? AbortSignal.any([signal, drain]) : (drain ?? signal)
    const interrupted = (): Error =>
      signal?.aborted || !drain?.aborted ? new CancelRequested() : new DrainRequested()
    let waited = false
    const onWait = (w: WaitInfo): void => {
      waited = true
      this.deps.onWait?.(w)
    }
    for (let attempt = 1; ; attempt++) {
      if (signal?.aborted) throw new CancelRequested()
      if (drain?.aborted) throw new DrainRequested()
      const config = (await this.deps.retryConfig?.()) ?? DEFAULT_RETRY_CONFIG
      let lease: Lease
      try {
        lease = await this.deps.limiter.acquire(lane, { signal: waitSignal, onWait })
      } catch {
        throw interrupted()
      }
      if (waited) {
        waited = false
        this.deps.onWait?.(null)
      }
      const mode = this.outputMode.current
      try {
        const res = await this.deps.llm.chat(
          {
            model: this.params.model.id,
            messages,
            temperature: this.params.temperature,
            maxTokens,
            ...requestFormat(mode, ids),
            ...(this.params.sessionId ? { sessionId: this.params.sessionId } : {}),
            ...(this.reasoning ? { reasoning: this.reasoning } : {})
          },
          signal
        )
        lease.release('ok')
        this.add(res)
        this.deps.log.info(
          `chat ok model=${this.params.model.id} ids=${ids.length} finish=${res.finishReason} ` +
            `max=${maxTokens} tokens=${res.usage?.promptTokens ?? '?'}/${res.usage?.completionTokens ?? '?'} ` +
            `reasoning=${res.usage?.reasoningTokens ?? '?'} cost=${res.usage?.cost ?? '?'}`
        )
        return {
          type: 'ok',
          content: res.content,
          finishReason: res.finishReason,
          completionTokens: res.usage?.completionTokens ?? null,
          reasoningTokens: res.usage?.reasoningTokens ?? null
        }
      } catch (err) {
        // Libera antes de qualquer espera: backoff não segura vaga em voo de outras lanes.
        lease.release(
          err instanceof LlmError && (err.kind === 'rate-limit' || err.kind === 'budget-busy')
            ? 'throttled'
            : 'other'
        )
        if (!(err instanceof LlmError)) throw err
        if (err.generationId && ['aborted', 'timeout', 'stream-error'].includes(err.kind))
          this.lookupCost(err.generationId)
        if (err.kind === 'unsupported-params') {
          // Determinístico: sem backoff nem tentativa gasta; desce um degrau (para o job todo).
          const next = this.outputMode.downgrade(mode)
          if (!next) {
            this.deps.log.warn(
              `chat failed kind=${err.kind} status=${err.status ?? '-'} mode=${mode} -> fatal: ${err.message}`
            )
            throw new FatalLlmError(
              'LLM_NO_ENDPOINT',
              noEndpointMessage(this.params.model.id, err.message)
            )
          }
          if (next.changed)
            this.deps.log.warn(
              `output mode downgraded model=${this.params.model.id} ${mode} -> ${next.mode} ` +
                `(status=${err.status ?? '-'}: ${err.message})`
            )
          attempt--
          continue
        }
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
              await this.deps.sleep(d.delayMs, waitSignal)
            } catch {
              throw interrupted()
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
