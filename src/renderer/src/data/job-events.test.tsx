// @vitest-environment jsdom
import { QueryClient } from '@tanstack/react-query'
import { cleanup, renderHook } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Job } from '@shared/ipc-contract'
import { installFakeApi } from '@renderer/test/fake-api'
import { useJobEvents } from './jobs'
import { qk } from './query-keys'

afterEach(cleanup)

const job = (status: Job['status']): Job => ({
  id: 'j1',
  kind: 'pipeline',
  batchId: 'b1',
  status,
  step: 'preflight',
  source: 'a.mkv',
  progress: { step: 'preflight' },
  result: null,
  error: null,
  attempt: 1,
  createdAt: '',
  updatedAt: '',
  startedAt: null,
  finishedAt: null
})

describe('useJobEvents', () => {
  it('refetches when a job starts awaiting confirmation (the estimate is not in the event)', () => {
    const fake = installFakeApi()
    const qc = new QueryClient()
    qc.setQueryData(qk.jobs.list(), [job('running')])
    const invalidate = vi.spyOn(qc, 'invalidateQueries')
    renderHook(() => useJobEvents(qc))

    fake.emit('jobs:progress', { id: 'j1', status: 'running', progress: { step: 'preflight' } })
    expect(invalidate).not.toHaveBeenCalled()

    fake.emit('jobs:progress', {
      id: 'j1',
      status: 'awaiting-confirmation',
      progress: { step: 'preflight' }
    })
    expect(invalidate).toHaveBeenCalledWith({ queryKey: qk.jobs.all })
  })
})
