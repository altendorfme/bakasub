import { describe, expect, it } from 'vitest'
import { LlmError } from './openrouter-client'
import { backoffDelay, decide } from './retry-policy'

const e = (kind: ConstructorParameters<typeof LlmError>[0], retryAfterMs?: number): LlmError =>
  new LlmError(kind, kind, { retryAfterMs })

describe('decide', () => {
  it.each([
    ['auth', 'LLM_AUTH'],
    ['credits', 'LLM_CREDITS'],
    ['bad-request', 'LLM_BAD_REQUEST']
  ] as const)('%s é fatal (%s)', (kind, code) => {
    expect(decide(e(kind), 1)).toEqual({ action: 'fatal', code })
  })
  it('moderação não repete', () => {
    expect(decide(e('moderation'), 1)).toEqual({ action: 'moderated' })
  })
  it('aborted => cancel', () => {
    expect(decide(e('aborted'), 1)).toEqual({ action: 'cancel' })
  })
  it('429/503: até 5 tentativas, respeitando Retry-After', () => {
    expect(decide(e('rate-limit', 7000), 1)).toEqual({ action: 'retry', delayMs: 7000 })
    expect(decide(e('unavailable'), 4).action).toBe('retry')
    expect(decide(e('unavailable'), 5)).toEqual({ action: 'fatal', code: 'LLM_UNAVAILABLE' })
  })
  it('5xx/timeout/stream/rede: até 3 tentativas', () => {
    for (const k of ['server', 'timeout', 'stream-error', 'network'] as const) {
      expect(decide(e(k), 2).action).toBe('retry')
      expect(decide(e(k), 3)).toEqual({ action: 'fatal', code: 'LLM_UNAVAILABLE' })
    }
  })
  it('Retry-After absurdo é limitado a 60 s', () => {
    expect(decide(e('rate-limit', 3_600_000), 1)).toEqual({ action: 'retry', delayMs: 60_000 })
  })
})

describe('backoffDelay', () => {
  it('exponencial com jitter [50%, 100%], teto 30 s', () => {
    expect(backoffDelay(1, () => 0)).toBe(500)
    expect(backoffDelay(1, () => 1)).toBe(1000)
    expect(backoffDelay(3, () => 1)).toBe(4000)
    expect(backoffDelay(10, () => 1)).toBe(30_000)
  })
})
