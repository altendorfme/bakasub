import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { LogEntry } from '../../shared/ipc-contract'
import { LogStream, RateLimiter } from './log-stream'

const e = (msg: string): LogEntry => ({ time: '', level: 'info', scope: 'app', msg })

beforeEach(() => vi.useFakeTimers())
afterEach(() => vi.useRealTimers())

describe('LogStream', () => {
  it('drops entries while nobody watches', () => {
    const emit = vi.fn()
    const s = new LogStream(emit, { intervalMs: 250 })
    s.publish(e('a'))
    vi.advanceTimersByTime(1000)
    expect(emit).not.toHaveBeenCalled()
  })

  it('while watching, batches entries every interval (one emit per batch)', () => {
    const emit = vi.fn()
    const s = new LogStream(emit, { intervalMs: 250 })
    s.watch(true)
    s.publish(e('a'))
    s.publish(e('b'))
    expect(emit).not.toHaveBeenCalled()
    vi.advanceTimersByTime(250)
    expect(emit).toHaveBeenCalledWith([e('a'), e('b')])
    vi.advanceTimersByTime(1000)
    expect(emit).toHaveBeenCalledTimes(1)
  })

  it('caps a burst to the newest entries and stops on unwatch', () => {
    const emit = vi.fn()
    const s = new LogStream(emit, { intervalMs: 250, maxBatch: 2 })
    s.watch(true)
    s.publish(e('a'))
    s.publish(e('b'))
    s.publish(e('c'))
    vi.advanceTimersByTime(250)
    expect(emit).toHaveBeenLastCalledWith([e('b'), e('c')])
    s.publish(e('d'))
    s.watch(false)
    vi.advanceTimersByTime(250)
    expect(emit).toHaveBeenCalledTimes(1)
  })

  it('an emit that throws (window gone) never breaks logging', () => {
    const s = new LogStream(() => {
      throw new Error('destroyed')
    })
    s.watch(true)
    s.publish(e('a'))
    expect(() => vi.advanceTimersByTime(250)).not.toThrow()
  })
})

describe('RateLimiter', () => {
  it('allows N per window, then refuses until the window slides', () => {
    const r = new RateLimiter(2, 60_000, () => Date.now())
    expect(r.take()).toBe(true)
    expect(r.take()).toBe(true)
    expect(r.take()).toBe(false)
    vi.advanceTimersByTime(60_001)
    expect(r.take()).toBe(true)
  })
})
