import { describe, expect, it } from 'vitest'
import type { Job } from '@shared/ipc-contract'
import { batchCounts, batchFraction, batchPhase, jobFraction } from './batch-progress'

const job = (patch: Partial<Job>): Job => ({
  id: 'j',
  kind: 'pipeline',
  batchId: 'b',
  status: 'queued',
  step: null,
  source: 'a.mkv',
  progress: { step: null },
  result: null,
  error: null,
  attempt: 1,
  createdAt: '',
  updatedAt: '',
  startedAt: null,
  finishedAt: null,
  ...patch
})

const translating = (done: number): Job =>
  job({
    status: 'running',
    step: 'translate',
    progress: { step: 'translate', translation: { done, total: 100, cached: 0 } }
  })

describe('jobFraction', () => {
  it('moves through the steps and inside the translation', () => {
    const extracting = job({
      status: 'running',
      step: 'extract',
      progress: { step: 'extract', stepFraction: 0.5 }
    })
    const awaiting = job({ status: 'awaiting-confirmation', step: 'preflight' })
    const values = [
      jobFraction(job({})),
      jobFraction(extracting),
      jobFraction(awaiting),
      jobFraction(translating(10)),
      jobFraction(translating(90)),
      jobFraction(job({ status: 'completed' }))
    ]
    expect(values[0]).toBe(0)
    expect(values[5]).toBe(1)
    for (let i = 1; i < values.length; i++) expect(values[i]).toBeGreaterThan(values[i - 1])
  })

  it('averages the batch', () => {
    expect(batchFraction([job({}), job({ status: 'completed' })])).toBe(0.5)
    expect(batchFraction([])).toBe(0)
  })
})

describe('batchPhase', () => {
  it('review while estimating or awaiting, then run, then done', () => {
    expect(batchPhase([job({}), job({ status: 'running', step: 'extract' })])).toBe('review')
    expect(batchPhase([translating(5), job({ status: 'awaiting-confirmation' })])).toBe('review')
    expect(batchPhase([translating(5), job({})])).toBe('run')
    expect(batchPhase([job({ status: 'completed' }), job({ status: 'failed' })])).toBe('done')
  })

  it('counts each state', () => {
    expect(
      batchCounts([
        job({}),
        job({ status: 'awaiting-confirmation' }),
        translating(1),
        job({ status: 'completed-with-warnings' }),
        job({ status: 'cancelled' })
      ])
    ).toEqual({ estimating: 1, awaiting: 1, translating: 1, done: 1, failed: 1 })
  })
})
