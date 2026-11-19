import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { openTestDatabase } from '../test-db'
import { BatchRepository } from './batch.repository'
import { JobRepository, type NewJob } from './job.repository'

let t: Awaited<ReturnType<typeof openTestDatabase>>
let batches: BatchRepository
let jobs: JobRepository
beforeEach(async () => {
  t = await openTestDatabase()
  batches = new BatchRepository(t.db)
  jobs = new JobRepository(t.db)
})
afterEach(() => t.close())

const batch = { id: 'b1', name: 'Temporada 1', kind: 'pipeline' as const, root: '/v', options: {} }
const job = (id: string): NewJob => ({
  id,
  kind: 'pipeline' as const,
  spec: { source: `/v/${id}.mkv` },
  status: 'queued' as const
})

describe('BatchRepository', () => {
  it('insere o batch e os jobs numa transação; contagem por status', async () => {
    await batches.insertWithJobs(batch, [job('a'), job('b')])
    await jobs.update('b', { status: 'completed' })
    expect(await batches.get('b1')).toMatchObject({ name: 'Temporada 1' })
    expect((await jobs.get('a'))!.batchId).toBe('b1')
    expect(await batches.counts('b1')).toEqual({ queued: 1, completed: 1 })
    expect((await batches.list()).map((b) => b.id)).toEqual(['b1'])
    expect((await batches.jobIds('b1')).sort()).toEqual(['a', 'b'])
  })

  it('atômico: um job inválido não deixa nem o batch nem os outros jobs', async () => {
    await jobs.insert(job('dup'))
    await expect(batches.insertWithJobs(batch, [job('x'), job('dup')])).rejects.toThrow()
    expect(await batches.get('b1')).toBeNull()
    expect(await jobs.get('x')).toBeNull()
  })

  it('delete remove o batch (os jobs são removidos pelo serviço)', async () => {
    await batches.insertWithJobs(batch, [])
    await batches.delete('b1')
    expect(await batches.get('b1')).toBeNull()
  })
})
