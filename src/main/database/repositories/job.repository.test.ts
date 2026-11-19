import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { openTestDatabase } from '../test-db'
import { JobRepository, type NewJob } from './job.repository'

let t: Awaited<ReturnType<typeof openTestDatabase>>
let now: number
let repo: JobRepository
beforeEach(async () => {
  t = await openTestDatabase()
  now = 1_000_000
  repo = new JobRepository(t.db, () => now)
})
afterEach(() => t.close())

const job = (id: string): NewJob => ({
  id,
  kind: 'translate',
  spec: { kind: 'translate', source: '/a.srt' },
  status: 'queued'
})

describe('JobRepository', () => {
  it('insert/get/list (mais recentes primeiro)', async () => {
    await repo.insert(job('a'))
    now += 10
    await repo.insert(job('b'))
    expect(await repo.get('a')).toMatchObject({ id: 'a', status: 'queued', attempt: 1, step: null })
    expect((await repo.list()).map((j) => j.id)).toEqual(['b', 'a'])
    expect(await repo.get('x')).toBeNull()
  })

  it('nextQueued em FIFO', async () => {
    await repo.insert(job('a'))
    now += 10
    await repo.insert(job('b'))
    expect((await repo.queued()).map((j) => j.id)).toEqual(['a', 'b'])
  })

  it('update parcial com updated_at', async () => {
    await repo.insert(job('a'))
    now += 5
    await repo.update('a', { status: 'running', step: 'translate', startedAt: new Date(now) })
    const j = (await repo.get('a'))!
    expect(j).toMatchObject({ status: 'running', step: 'translate' })
    expect(j.updatedAt.getTime()).toBe(now)
  })

  it('markInterrupted: running e awaiting viram interrupted', async () => {
    await repo.insert(job('a'))
    await repo.insert({ ...job('b'), status: 'running' })
    await repo.insert({ ...job('c'), status: 'completed' })
    expect(await repo.markInterrupted()).toBe(1)
    expect((await repo.get('b'))!.status).toBe('interrupted')
    expect((await repo.get('c'))!.status).toBe('completed')
  })

  it('delete', async () => {
    await repo.insert(job('a'))
    await repo.delete('a')
    expect(await repo.get('a')).toBeNull()
  })
})
