import { describe, expect, it, vi } from 'vitest'
import type { ModelInfo } from './model-catalog'
import { laneOf, RateLimiter, type RateLimitConfig } from './rate-limiter'

const model = (id: string, pricing: ModelInfo['pricing']): ModelInfo => ({
  id,
  name: id,
  contextLength: null,
  maxCompletionTokens: null,
  isModerated: false,
  pricing,
  structuredOutputs: false,
  responseFormat: false
})

/** Relógio virtual: `sleep` avança o tempo na hora (sem timers reais). */
function clock(): {
  now: () => number
  sleep: (ms: number, signal?: AbortSignal) => Promise<void>
  slept: number[]
} {
  let t = 1_000_000
  const slept: number[] = []
  return {
    now: () => t,
    slept,
    sleep: async (ms, signal) => {
      if (signal?.aborted) throw signal.reason
      slept.push(ms)
      t += ms
    }
  }
}

const limiter = (
  config: Partial<RateLimitConfig>,
  c = clock()
): { l: RateLimiter; c: ReturnType<typeof clock> } => ({
  c,
  l: new RateLimiter({
    config: async () => ({ freeRpm: 20, paidRpm: null, ...config }),
    now: c.now,
    sleep: c.sleep
  })
})

describe('laneOf', () => {
  it('":free" variants and zero-priced models are free; everything else is paid', () => {
    expect(laneOf(model('a/b:free', { prompt: 0.1, completion: 0.1 }))).toBe('free')
    expect(laneOf(model('a/b', { prompt: 0, completion: 0 }))).toBe('free')
    expect(laneOf(model('a/b', { prompt: 1e-6, completion: 2e-6 }))).toBe('paid')
    // Preço dinâmico (roteadores): pode ser pago.
    expect(laneOf(model('openrouter/auto', null))).toBe('paid')
  })
})

describe('RateLimiter', () => {
  it('lets `rpm` requests through, then waits until the oldest leaves the 60 s window', async () => {
    const { l, c } = limiter({ freeRpm: 3 })
    for (let i = 0; i < 3; i++) await l.acquire('free')
    expect(c.slept).toEqual([])
    await l.acquire('free')
    expect(c.slept).toEqual([60_000])
  })

  it('spaces requests across the window, not in bursts after the first minute', async () => {
    const { l, c } = limiter({ freeRpm: 2 })
    await l.acquire('free')
    c.slept.length = 0
    await c.sleep(10_000)
    await l.acquire('free')
    await l.acquire('free')
    // O 1º sai da janela em t0+60 s; agora é t0+10 s.
    expect(c.slept).toEqual([10_000, 50_000])
  })

  it('paid lane has no cap by default, and honours paidRpm when set', async () => {
    const a = limiter({})
    for (let i = 0; i < 100; i++) await a.l.acquire('paid')
    expect(a.c.slept).toEqual([])
    const b = limiter({ paidRpm: 1 })
    await b.l.acquire('paid')
    await b.l.acquire('paid')
    expect(b.c.slept).toEqual([60_000])
  })

  it('lanes are independent', async () => {
    const { l, c } = limiter({ freeRpm: 1 })
    await l.acquire('free')
    await l.acquire('paid')
    expect(c.slept).toEqual([])
  })

  it('cooldown pauses the whole lane, and reports why it waited', async () => {
    const { l, c } = limiter({})
    l.cooldown('free', c.now() + 15_000)
    const onWait = vi.fn()
    await l.acquire('free', { onWait })
    expect(c.slept).toEqual([15_000])
    expect(onWait).toHaveBeenCalledWith({ reason: 'cooldown', untilMs: c.now() })
    expect(l.cooldownUntil('free')).toBeNull()
  })

  it('a later cooldown never shortens an earlier one', async () => {
    const { l, c } = limiter({})
    l.cooldown('free', c.now() + 30_000)
    l.cooldown('free', c.now() + 5_000)
    expect(l.cooldownUntil('free')).toBe(c.now() + 30_000)
  })

  it('reports "rate-limit" when waiting for the window', async () => {
    const { l } = limiter({ freeRpm: 1 })
    await l.acquire('free')
    const onWait = vi.fn()
    await l.acquire('free', { onWait })
    expect(onWait).toHaveBeenCalledWith(expect.objectContaining({ reason: 'rate-limit' }))
  })

  it('reads the config on every acquire (changes apply to running jobs)', async () => {
    let rpm = 1
    const c = clock()
    const l = new RateLimiter({
      config: async () => ({ freeRpm: rpm, paidRpm: null }),
      now: c.now,
      sleep: c.sleep
    })
    await l.acquire('free')
    rpm = 5
    await l.acquire('free')
    expect(c.slept).toEqual([])
  })

  it('an aborted wait rejects and does not consume a slot', async () => {
    const { l, c } = limiter({ freeRpm: 1 })
    await l.acquire('free')
    const ac = new AbortController()
    ac.abort(new Error('stop'))
    await expect(l.acquire('free', { signal: ac.signal })).rejects.toThrow('stop')
    await c.sleep(60_000)
    c.slept.length = 0
    await l.acquire('free')
    expect(c.slept).toEqual([])
  })

  it('concurrent acquirers are served in order, sharing the window', async () => {
    const { l, c } = limiter({ freeRpm: 2 })
    const order: number[] = []
    await Promise.all([1, 2, 3, 4].map((n) => l.acquire('free').then(() => order.push(n))))
    expect(order).toEqual([1, 2, 3, 4])
    expect(c.slept.reduce((a, b) => a + b, 0)).toBe(60_000)
  })
})
