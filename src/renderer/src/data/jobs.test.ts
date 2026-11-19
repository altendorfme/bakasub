import { QueryClient } from '@tanstack/react-query'
import { describe, expect, it } from 'vitest'
import type { Job } from '@shared/ipc-contract'
import { applyJobProgress, jobCounts } from './jobs'
import { qk } from './query-keys'

const job = (id: string, over: Partial<Job> = {}): Job => ({
  id,
  kind: 'pipeline',
  batchId: null,
  status: 'queued',
  step: null,
  source: `${id}.mkv`,
  progress: { step: null },
  result: null,
  error: null,
  attempt: 1,
  createdAt: '2026-11-19T10:00:00.000Z',
  updatedAt: '2026-11-19T10:00:00.000Z',
  startedAt: null,
  finishedAt: null,
  ...over
})

describe('applyJobProgress', () => {
  it('updates the job in the list and in its own entry, without refetching', () => {
    const qc = new QueryClient()
    qc.setQueryData(qk.jobs.list(), [job('a'), job('b')])
    qc.setQueryData(qk.jobs.detail('a'), job('a'))

    const progress = {
      step: 'translate' as const,
      translation: { done: 40, total: 400, cached: 10 }
    }
    const known = applyJobProgress(qc, { id: 'a', status: 'running', progress })

    expect(known).toBe(true)
    const list = qc.getQueryData<Job[]>(qk.jobs.list())!
    expect(list[0]).toMatchObject({ status: 'running', step: 'translate', progress })
    expect(list[1]).toEqual(job('b'))
    expect(qc.getQueryData<Job>(qk.jobs.detail('a'))).toMatchObject({ status: 'running', progress })
  })

  it('a job missing from the cache returns false (caller invalidates the list)', () => {
    const qc = new QueryClient()
    qc.setQueryData(qk.jobs.list(), [job('a')])
    expect(applyJobProgress(qc, { id: 'zzz', status: 'queued', progress: { step: null } })).toBe(
      false
    )
    expect(qc.getQueryData<Job[]>(qk.jobs.list())).toHaveLength(1)
  })

  it('no cached list yet: nothing to patch, returns false', () => {
    const qc = new QueryClient()
    expect(applyJobProgress(qc, { id: 'a', status: 'running', progress: { step: 'probe' } })).toBe(
      false
    )
  })
})

describe('jobCounts', () => {
  it('counts what the status bar shows', () => {
    expect(
      jobCounts([
        job('1', { status: 'running' }),
        job('2', { status: 'running' }),
        job('3', { status: 'queued' }),
        job('4', { status: 'awaiting-confirmation' }),
        job('5', { status: 'failed' })
      ])
    ).toEqual({ running: 2, queued: 1, awaiting: 1 })
    expect(jobCounts(undefined)).toEqual({ running: 0, queued: 0, awaiting: 0 })
  })
})
