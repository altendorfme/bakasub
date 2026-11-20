import { describe, expect, it } from 'vitest'
import { LlmError, type RateLimitHeaders } from './openrouter-client'
import { backoffDelay, decide, DEFAULT_RETRY_CONFIG } from './retry-policy'

const e = (
  kind: ConstructorParameters<typeof LlmError>[0],
  retryAfterMs?: number,
  rateLimit?: RateLimitHeaders
): LlmError => new LlmError(kind, kind, { retryAfterMs, ...(rateLimit ? { rateLimit } : {}) })

describe('decide', () => {
  it.each([
    ['auth', 'LLM_AUTH'],
    ['credits', 'LLM_CREDITS'],
    ['bad-request', 'LLM_BAD_REQUEST'],
    ['daily-limit', 'LLM_DAILY_LIMIT']
  ] as const)('%s é fatal (%s)', (kind, code) => {
    expect(decide(e(kind), 1)).toEqual({ action: 'fatal', code })
  })
  it('moderação não repete', () => {
    expect(decide(e('moderation'), 1)).toEqual({ action: 'moderated' })
  })
  it('aborted => cancel', () => {
    expect(decide(e('aborted'), 1)).toEqual({ action: 'cancel' })
  })
  it('402 de orçamento em voo: cooldown da faixa (é da conta), respeitando Retry-After', () => {
    expect(decide(e('budget-busy', 4000), 1)).toEqual({
      action: 'retry',
      delayMs: 4000,
      scope: 'lane'
    })
    expect(decide(e('budget-busy'), DEFAULT_RETRY_CONFIG.maxThrottled)).toEqual({
      action: 'fatal',
      code: 'LLM_UNAVAILABLE'
    })
  })
  it('429: cooldown da faixa, respeitando Retry-After', () => {
    expect(decide(e('rate-limit', 7000), 1)).toEqual({
      action: 'retry',
      delayMs: 7000,
      scope: 'lane'
    })
  })
  it('429 sem Retry-After usa X-RateLimit-Reset', () => {
    expect(decide(e('rate-limit', undefined, { resetAtMs: 12_000 }), 1, { now: 2_000 })).toEqual({
      action: 'retry',
      delayMs: 10_000,
      scope: 'lane'
    })
  })
  it('503: só a requisição espera; até maxThrottled tentativas', () => {
    expect(decide(e('unavailable'), 1, { random: () => 1 })).toEqual({
      action: 'retry',
      delayMs: 1000,
      scope: 'request'
    })
    expect(decide(e('unavailable'), 4).action).toBe('retry')
    expect(decide(e('unavailable'), 5)).toEqual({ action: 'fatal', code: 'LLM_UNAVAILABLE' })
  })
  it('5xx/timeout/stream/rede: até maxTransient tentativas', () => {
    for (const k of ['server', 'timeout', 'stream-error', 'network'] as const) {
      expect(decide(e(k), 2).action).toBe('retry')
      expect(decide(e(k), 3)).toEqual({ action: 'fatal', code: 'LLM_UNAVAILABLE' })
    }
  })
  it('respeita a config', () => {
    const config = { ...DEFAULT_RETRY_CONFIG, maxThrottled: 2, maxTransient: 1 }
    expect(decide(e('rate-limit'), 2, { config }).action).toBe('fatal')
    expect(decide(e('network'), 1, { config }).action).toBe('fatal')
  })
  it('espera pedida pelo servidor é limitada a 60 s', () => {
    expect(decide(e('rate-limit', 3_600_000), 1)).toMatchObject({ delayMs: 60_000 })
  })
})

describe('backoffDelay', () => {
  it('exponencial com jitter [50%, 100%], teto configurável', () => {
    const c = DEFAULT_RETRY_CONFIG
    expect(backoffDelay(1, c, () => 0)).toBe(500)
    expect(backoffDelay(1, c, () => 1)).toBe(1000)
    expect(backoffDelay(3, c, () => 1)).toBe(4000)
    expect(backoffDelay(10, c, () => 1)).toBe(30_000)
    expect(backoffDelay(3, { baseDelayMs: 500, maxDelayMs: 1500 }, () => 1)).toBe(1500)
  })
})
