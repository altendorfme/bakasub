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

describe('RateLimiter: requisições em voo + AIMD', () => {
  const tick = (): Promise<void> => new Promise((r) => setTimeout(r, 0))

  it('segura além do teto de voo e libera na ordem de chegada quando uma vaga abre', async () => {
    const { l } = limiter({ paidMaxInFlight: 2 })
    const a = await l.acquire('paid')
    await l.acquire('paid')
    const order: number[] = []
    const third = l.acquire('paid').then((x) => (order.push(3), x))
    const fourth = l.acquire('paid').then((x) => (order.push(4), x))
    await tick()
    expect(order).toEqual([])
    expect(l.inFlight('paid')).toBe(2)
    a.release('ok')
    a.release('ok') // idempotente
    ;(await third).release('ok')
    await fourth
    expect(order).toEqual([3, 4])
    expect(l.inFlight('paid')).toBe(2)
  })

  it('throttled corta pela metade o que estava em voo; 5 sucessos seguidos sobem +1 até o teto', async () => {
    const { l } = limiter({ paidMaxInFlight: 8 })
    const leases = await Promise.all(Array.from({ length: 8 }, () => l.acquire('paid')))
    leases[0].release('throttled')
    expect(l.inFlightLimit('paid')).toBe(4)
    for (const x of leases.slice(1)) x.release('other')
    for (let i = 0; i < 5; i++) (await l.acquire('paid')).release('ok')
    expect(l.inFlightLimit('paid')).toBe(5)
    for (let i = 0; i < 15; i++) (await l.acquire('paid')).release('ok')
    expect(l.inFlightLimit('paid')).toBe(8)
  })

  it('rajada de 429 das requisições que já estavam em voo reduz uma vez só', async () => {
    const { l } = limiter({ paidMaxInFlight: 8 })
    const burst = await Promise.all(Array.from({ length: 8 }, () => l.acquire('paid')))
    for (const x of burst) x.release('throttled')
    expect(l.inFlightLimit('paid')).toBe(4)
    // Um 429 depois da redução (lease novo) é um evento novo.
    ;(await l.acquire('paid')).release('throttled')
    expect(l.inFlightLimit('paid')).toBe(2)
  })

  it('sem teto configurado, throttled ainda limita (metade do que estava em voo)', async () => {
    const { l } = limiter({})
    const leases = await Promise.all(Array.from({ length: 6 }, () => l.acquire('paid')))
    leases[5].release('throttled')
    expect(l.inFlightLimit('paid')).toBe(3)
    expect(l.inFlightLimit('free')).toBe(Infinity)
  })

  it('volta ao teto depois de 5 min ociosa', async () => {
    const { l, c } = limiter({ paidMaxInFlight: 8 })
    const leases = await Promise.all(Array.from({ length: 4 }, () => l.acquire('paid')))
    for (const x of leases) x.release('throttled')
    expect(l.inFlightLimit('paid')).toBe(4)
    await c.sleep(5 * 60_000 + 1)
    ;(await l.acquire('paid')).release('ok')
    expect(l.inFlightLimit('paid')).toBe(8)
  })

  it('cancelar enquanto espera vaga não ocupa vaga nem trava a fila', async () => {
    const { l } = limiter({ freeMaxInFlight: 1 })
    const a = await l.acquire('free')
    const ac = new AbortController()
    const waiting = l.acquire('free', { signal: ac.signal })
    await tick()
    ac.abort(new Error('stop'))
    await expect(waiting).rejects.toThrow('stop')
    a.release('ok')
    const b = await l.acquire('free')
    expect(l.inFlight('free')).toBe(1)
    b.release('ok')
  })

  it('esperar vaga em voo não é reportado como espera do OpenRouter', async () => {
    const { l } = limiter({ paidMaxInFlight: 1 })
    const a = await l.acquire('paid')
    const onWait = vi.fn()
    const b = l.acquire('paid', { onWait })
    await tick()
    a.release('ok')
    await b
    expect(onWait).not.toHaveBeenCalled()
  })
})
