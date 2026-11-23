import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { JobManager } from '../../jobs/job-manager'

type Opts = {
  input?: { safeParse(v: unknown): { success: boolean; data?: unknown } }
  handle(p: unknown): unknown
}
const registered = new Map<string, Opts>()
vi.mock('../create-handler', () => ({
  createHandler: (channel: string, opts: Opts) => registered.set(channel, opts)
}))

import { registerJobHandlers } from './jobs.handler'

const parse = (channel: string, v: unknown): { success: boolean; data?: unknown } =>
  registered.get(channel)!.input!.safeParse(v)

describe('job handlers: memory mode', () => {
  const jobs = { retry: vi.fn(), setMemory: vi.fn(), create: vi.fn() }
  beforeEach(() => {
    registered.clear()
    for (const f of Object.values(jobs)) f.mockReset()
    registerJobHandlers({ jobs: jobs as unknown as JobManager })
  })

  it('jobs:create accepts memory on translate/pipeline and rejects unknown values', () => {
    const base = { kind: 'translate', source: '/a/b.srt' }
    expect(parse('jobs:create', { ...base, memory: 'skip' }).success).toBe(true)
    expect(parse('jobs:create', { ...base, memory: 'use' }).success).toBe(true)
    expect(parse('jobs:create', base).success).toBe(true)
    expect(parse('jobs:create', { ...base, memory: 'clear' }).success).toBe(false)
    expect(
      parse('jobs:create', { kind: 'pipeline', source: '/a/b.mkv', trackId: 2, memory: 'skip' })
        .success
    ).toBe(true)
  })

  it('jobs:retry keeps memory optional and forwards it', async () => {
    expect(parse('jobs:retry', { id: 'j1' }).success).toBe(true)
    expect(parse('jobs:retry', { id: 'j1', memory: 'skip' }).success).toBe(true)
    expect(parse('jobs:retry', { id: 'j1', memory: true }).success).toBe(false)
    await registered.get('jobs:retry')!.handle({ id: 'j1' })
    await registered.get('jobs:retry')!.handle({ id: 'j1', memory: 'skip' })
    expect(jobs.retry).toHaveBeenNthCalledWith(1, 'j1', undefined)
    expect(jobs.retry).toHaveBeenNthCalledWith(2, 'j1', 'skip')
  })

  it('jobs:set-memory requires a valid mode', async () => {
    expect(parse('jobs:set-memory', { id: 'j1', memory: 'use' }).success).toBe(true)
    expect(parse('jobs:set-memory', { id: 'j1' }).success).toBe(false)
    expect(parse('jobs:set-memory', { id: '', memory: 'skip' }).success).toBe(false)
    await registered.get('jobs:set-memory')!.handle({ id: 'j1', memory: 'skip' })
    expect(jobs.setMemory).toHaveBeenCalledWith('j1', 'skip')
  })
})
