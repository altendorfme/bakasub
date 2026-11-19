import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createThrottle } from './throttle'

beforeEach(() => vi.useFakeTimers())
afterEach(() => vi.useRealTimers())

describe('createThrottle', () => {
  it('emite o primeiro na hora, depois no máximo 1 por janela com o último valor', () => {
    const out: number[] = []
    const t = createThrottle<number>(250, (v) => out.push(v))
    t.push(1)
    t.push(2)
    t.push(3)
    expect(out).toEqual([1])
    vi.advanceTimersByTime(250)
    expect(out).toEqual([1, 3])
    vi.advanceTimersByTime(1000)
    expect(out).toEqual([1, 3])
  })
  it('flush emite o pendente imediatamente; cancel descarta', () => {
    const out: number[] = []
    const t = createThrottle<number>(250, (v) => out.push(v))
    t.push(1)
    t.push(2)
    t.flush()
    expect(out).toEqual([1, 2])
    t.push(3)
    t.push(4)
    t.cancel()
    vi.advanceTimersByTime(500)
    expect(out).toEqual([1, 2, 3])
  })
})
