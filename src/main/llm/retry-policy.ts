import type { AppErrorCode } from '../errors'
import type { LlmError } from './openrouter-client'

export type RetryDecision =
  | { action: 'retry'; delayMs: number }
  | { action: 'fatal'; code: AppErrorCode }
  | { action: 'moderated' }
  | { action: 'cancel' }

const MAX_THROTTLED = 5
const MAX_TRANSIENT = 3
const BACKOFF_CAP_MS = 30_000
const RETRY_AFTER_CAP_MS = 60_000

/** Exponencial (1 s, 2 s, 4 s…) com jitter em [50%, 100%] e teto de 30 s. */
export function backoffDelay(attempt: number, random: () => number = Math.random): number {
  const base = Math.min(BACKOFF_CAP_MS, 1000 * 2 ** (attempt - 1))
  return Math.round(base * (0.5 + random() / 2))
}

/**
 * O que fazer com um erro de transporte na tentativa `attempt` (1-based) de uma requisição.
 * Erros de conteúdo (JSON/marcadores) não passam por aqui: são do `ChunkTranslator`.
 */
export function decide(
  err: LlmError,
  attempt: number,
  random: () => number = Math.random
): RetryDecision {
  switch (err.kind) {
    case 'auth':
      return { action: 'fatal', code: 'LLM_AUTH' }
    case 'credits':
      return { action: 'fatal', code: 'LLM_CREDITS' }
    case 'bad-request':
      return { action: 'fatal', code: 'LLM_BAD_REQUEST' }
    case 'moderation':
      return { action: 'moderated' }
    case 'aborted':
      return { action: 'cancel' }
    case 'rate-limit':
    case 'unavailable':
      if (attempt >= MAX_THROTTLED) return { action: 'fatal', code: 'LLM_UNAVAILABLE' }
      return {
        action: 'retry',
        delayMs:
          err.retryAfterMs !== undefined
            ? Math.min(err.retryAfterMs, RETRY_AFTER_CAP_MS)
            : backoffDelay(attempt, random)
      }
    case 'server':
    case 'timeout':
    case 'stream-error':
    case 'network':
      if (attempt >= MAX_TRANSIENT) return { action: 'fatal', code: 'LLM_UNAVAILABLE' }
      return { action: 'retry', delayMs: backoffDelay(attempt, random) }
  }
}
