import type { AppErrorCode } from '../errors'
import type { LlmError } from './openrouter-client'

/** Valores ajustáveis em Settings → Avançado (`llm.retry.*`). */
export interface RetryConfig {
  /** Tentativas com 429/502/503. */
  readonly maxThrottled: number
  /** Tentativas com 5xx, timeout, erro no stream e rede. */
  readonly maxTransient: number
  readonly baseDelayMs: number
  readonly maxDelayMs: number
}

export const DEFAULT_RETRY_CONFIG: RetryConfig = {
  maxThrottled: 5,
  maxTransient: 3,
  baseDelayMs: 1000,
  maxDelayMs: 30_000
}

/** `Retry-After`/`X-RateLimit-Reset` maiores que isto são limitados (servidor exagerando). */
export const RETRY_AFTER_CAP_MS = 60_000

export type RetryDecision =
  /**
   * `lane`: 429 ou 402 de orçamento em voo; a faixa inteira entra em cooldown (todos os jobs esperam).
   * `request`: só esta requisição espera.
   */
  | { action: 'retry'; delayMs: number; scope: 'lane' | 'request' }
  | { action: 'fatal'; code: AppErrorCode }
  | { action: 'moderated' }
  | { action: 'cancel' }

/** Exponencial (base, 2×base, 4×base…) com jitter em [50%, 100%] e teto `maxDelayMs`. */
export function backoffDelay(
  attempt: number,
  config: Pick<RetryConfig, 'baseDelayMs' | 'maxDelayMs'> = DEFAULT_RETRY_CONFIG,
  random: () => number = Math.random
): number {
  const base = Math.min(config.maxDelayMs, config.baseDelayMs * 2 ** (attempt - 1))
  return Math.round(base * (0.5 + random() / 2))
}

/** Espera pedida pelo servidor (`Retry-After`, senão `X-RateLimit-Reset`), limitada. */
function serverHint(err: LlmError, now: number): number | undefined {
  const reset = err.details.rateLimit?.resetAtMs
  const hint = err.retryAfterMs ?? (reset !== undefined ? Math.max(0, reset - now) : undefined)
  return hint === undefined ? undefined : Math.min(hint, RETRY_AFTER_CAP_MS)
}

/**
 * O que fazer com um erro de transporte na tentativa `attempt` (1-based) de uma requisição.
 * Erros de conteúdo (JSON/marcadores) não passam por aqui: são do `ChunkTranslator`.
 */
export function decide(
  err: LlmError,
  attempt: number,
  o: { config?: RetryConfig; random?: () => number; now?: number } = {}
): RetryDecision {
  const config = o.config ?? DEFAULT_RETRY_CONFIG
  const random = o.random ?? Math.random
  const now = o.now ?? Date.now()
  switch (err.kind) {
    case 'auth':
      return { action: 'fatal', code: 'LLM_AUTH' }
    case 'credits':
      return { action: 'fatal', code: 'LLM_CREDITS' }
    case 'bad-request':
      return { action: 'fatal', code: 'LLM_BAD_REQUEST' }
    case 'daily-limit':
      return { action: 'fatal', code: 'LLM_DAILY_LIMIT' }
    // Determinístico: repetir igual nunca resolve. `LlmSession` rebaixa o modo de saída antes de
    // chegar aqui; este caso só vale quando não há degrau abaixo.
    case 'unsupported-params':
      return { action: 'fatal', code: 'LLM_NO_ENDPOINT' }
    case 'moderation':
      return { action: 'moderated' }
    case 'aborted':
      return { action: 'cancel' }
    case 'rate-limit':
    case 'budget-busy':
    case 'unavailable':
      if (attempt >= config.maxThrottled) return { action: 'fatal', code: 'LLM_UNAVAILABLE' }
      return {
        action: 'retry',
        delayMs: serverHint(err, now) ?? backoffDelay(attempt, config, random),
        // 503 costuma ser do modelo/provedor, não da conta: não trava a faixa.
        // 402 de orçamento em voo é da conta inteira, como o 429.
        scope: err.kind === 'unavailable' ? 'request' : 'lane'
      }
    case 'server':
    case 'timeout':
    case 'stream-error':
    case 'network':
      if (attempt >= config.maxTransient) return { action: 'fatal', code: 'LLM_UNAVAILABLE' }
      return { action: 'retry', delayMs: backoffDelay(attempt, config, random), scope: 'request' }
  }
}
