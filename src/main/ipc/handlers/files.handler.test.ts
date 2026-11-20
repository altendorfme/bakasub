import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { SubtitleInspection } from '../../../shared/ipc-contract'

type Opts = { input: { safeParse(v: unknown): { success: boolean } }; handle(p: unknown): unknown }
const registered = new Map<string, Opts>()
vi.mock('../create-handler', () => ({
  createHandler: (channel: string, opts: Opts) => registered.set(channel, opts)
}))

import { registerFileHandlers } from './files.handler'

describe('files:inspect handler', () => {
  const inspect = vi.fn()
  beforeEach(() => {
    registered.clear()
    inspect.mockReset()
    registerFileHandlers({ inspect })
  })

  it('registers the channel', () => expect(registered.has('files:inspect')).toBe(true))

  it('validates the payload at the boundary', () => {
    const { input } = registered.get('files:inspect')!
    expect(input.safeParse({ path: '/a/b.srt' }).success).toBe(true)
    expect(input.safeParse({}).success).toBe(false)
    expect(input.safeParse({ path: '' }).success).toBe(false)
    expect(input.safeParse({ path: 'x'.repeat(4097) }).success).toBe(false)
    expect(input.safeParse({ path: 42 }).success).toBe(false)
  })

  it('delegates to the inspector with the path', async () => {
    const res = { file: { name: 'b.srt' } } as SubtitleInspection
    inspect.mockResolvedValue(res)
    await expect(registered.get('files:inspect')!.handle({ path: '/a/b.srt' })).resolves.toBe(res)
    expect(inspect).toHaveBeenCalledWith('/a/b.srt')
  })

  it('propagates inspector errors to the envelope', async () => {
    inspect.mockRejectedValue(new Error('boom'))
    await expect(registered.get('files:inspect')!.handle({ path: '/a.srt' })).rejects.toThrow(
      'boom'
    )
  })
})
