import { describe, expect, it, vi } from 'vitest'
import type { FreeTierSetting } from '../../shared/ipc-contract'
import { FreeQuota } from './free-quota'
import { LlmError, type KeyInfo } from './openrouter-client'

const info = (used: number, limit: number): KeyInfo => ({
  isFreeTier: limit < 1000,
  freeDaily: { used, limit, remaining: limit - used }
})

const quota = (
  keyInfo: () => Promise<KeyInfo>,
  tier: FreeTierSetting = 'auto',
  now = { t: 0 }
): { q: FreeQuota; keyInfo: ReturnType<typeof vi.fn>; now: { t: number } } => {
  const fn = vi.fn(keyInfo)
  return {
    keyInfo: fn,
    now,
    q: new FreeQuota({ keyInfo: fn, tierSetting: async () => tier, now: () => now.t })
  }
}

describe('FreeQuota', () => {
  it('auto: tier and counters come from GET /key', async () => {
    const { q } = quota(async () => info(12, 1000))
    expect(await q.status()).toEqual({
      tier: 'over-10',
      source: 'auto',
      limit: 1000,
      used: 12,
      remaining: 988
    })
    const b = quota(async () => info(50, 50))
    expect(await b.q.status()).toMatchObject({ tier: 'under-10', limit: 50, remaining: 0 })
  })

  it('auto without an answer: unknown tier, conservative 50/day, no counters', async () => {
    const { q } = quota(async () => {
      throw new LlmError('network', 'down')
    })
    expect(await q.status()).toEqual({
      tier: 'unknown',
      source: 'auto',
      limit: 50,
      used: null,
      remaining: null
    })
  })

  it('override fixes the limit; usage still comes from /key when available', async () => {
    const { q } = quota(async () => info(30, 50), 'over-10')
    expect(await q.status()).toEqual({
      tier: 'over-10',
      source: 'override',
      limit: 1000,
      used: 30,
      remaining: 970
    })
  })

  it('caches /key for 30 s; invalidate() forces a new read', async () => {
    const { q, keyInfo, now } = quota(async () => info(1, 50))
    await q.status()
    now.t += 29_000
    await q.status()
    expect(keyInfo).toHaveBeenCalledTimes(1)
    now.t += 2_000
    await q.status()
    expect(keyInfo).toHaveBeenCalledTimes(2)
    q.invalidate()
    await q.status()
    expect(keyInfo).toHaveBeenCalledTimes(3)
  })
})
