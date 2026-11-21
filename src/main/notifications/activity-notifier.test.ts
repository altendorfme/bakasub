import { describe, expect, it, vi } from 'vitest'
import type { Batch, JobProgressEvent, JobStatus } from '../../shared/ipc-contract'
import { ActivityNotifier } from './activity-notifier'
import type { NotificationRequest } from './notification.service'

type BatchView = Pick<Batch, 'id' | 'name' | 'total' | 'counts' | 'state'>

const ev = (id: string, status: JobStatus): JobProgressEvent => ({
  id,
  status,
  progress: { step: null } as unknown as JobProgressEvent['progress']
})

function setup(
  o: {
    jobs?: Record<string, string | null>
    batch?: () => BatchView
    lang?: 'en' | 'pt-BR'
  } = {}
): { notifier: ActivityNotifier; sent: NotificationRequest[]; warn: ReturnType<typeof vi.fn> } {
  const sent: NotificationRequest[] = []
  const warn = vi.fn()
  const notifier = new ActivityNotifier({
    notify: async (r) => {
      sent.push(r)
      return true
    },
    getJob: async (id) => ({ id, source: `${id}.mkv`, batchId: o.jobs?.[id] ?? null }),
    getBatch: async () => o.batch!(),
    language: async () => o.lang ?? 'en',
    log: { warn }
  })
  return { notifier, sent, warn }
}

describe('ActivityNotifier: single jobs', () => {
  it('notifies the states that need the user, once per transition', async () => {
    const { notifier, sent } = setup()
    notifier.onJobEvent(ev('a', 'running'))
    notifier.onJobEvent(ev('a', 'running'))
    notifier.onJobEvent(ev('a', 'completed'))
    notifier.onJobEvent(ev('a', 'completed'))
    notifier.onJobEvent(ev('b', 'failed'))
    notifier.onJobEvent(ev('c', 'awaiting-confirmation'))
    notifier.onJobEvent(ev('d', 'cancelled'))
    await notifier.idle()
    expect(sent).toEqual([
      { kind: 'job', title: 'Job finished', body: 'a.mkv', target: { kind: 'job', id: 'a' } },
      { kind: 'job', title: 'Job failed', body: 'b.mkv', target: { kind: 'job', id: 'b' } },
      {
        kind: 'job',
        title: 'Confirm the cost to translate',
        body: 'c.mkv',
        target: { kind: 'job', id: 'c' }
      }
    ])
  })

  it('a retried job notifies again', async () => {
    const { notifier, sent } = setup()
    notifier.onJobEvent(ev('a', 'failed'))
    notifier.onJobEvent(ev('a', 'queued'))
    notifier.onJobEvent(ev('a', 'completed-with-warnings'))
    await notifier.idle()
    expect(sent.map((s) => s.title)).toEqual(['Job failed', 'Finished, with warnings'])
  })

  it('uses the app language', async () => {
    const { notifier, sent } = setup({ lang: 'pt-BR' })
    notifier.onJobEvent(ev('a', 'completed'))
    await notifier.idle()
    expect(sent[0].title).toBe('Job concluído')
  })

  it('a failing lookup is logged and does not stop later events', async () => {
    const sent: NotificationRequest[] = []
    const warn = vi.fn()
    const notifier = new ActivityNotifier({
      notify: async (r) => {
        sent.push(r)
        return true
      },
      getJob: async (id) => {
        if (id === 'gone') throw new Error('JOB_NOT_FOUND')
        return { id, source: 'x.mkv', batchId: null }
      },
      getBatch: async () => {
        throw new Error('unused')
      },
      language: async () => 'en',
      log: { warn }
    })
    notifier.onJobEvent(ev('gone', 'completed'))
    notifier.onJobEvent(ev('ok', 'completed'))
    await notifier.idle()
    expect(warn).toHaveBeenCalledOnce()
    expect(sent).toHaveLength(1)
  })
})

describe('ActivityNotifier: batches', () => {
  it('one aggregated notification when the batch finishes, none per file', async () => {
    let batch: BatchView = {
      id: 'b1',
      name: 'Season 1',
      total: 3,
      counts: { running: 1, completed: 2 },
      state: 'active'
    }
    const { notifier, sent } = setup({
      jobs: { a: 'b1', b: 'b1', c: 'b1' },
      batch: () => batch
    })
    notifier.onJobEvent(ev('a', 'completed'))
    notifier.onJobEvent(ev('b', 'completed'))
    await notifier.idle()
    expect(sent).toEqual([])

    batch = { ...batch, counts: { completed: 2, failed: 1 }, state: 'finished' }
    notifier.onJobEvent(ev('c', 'failed'))
    // A second job finishing right after (same snapshot) must not repeat it.
    notifier.onJobEvent(ev('a', 'queued'))
    await notifier.idle()
    expect(sent).toEqual([
      {
        kind: 'batch',
        title: 'Batch finished with failures',
        body: 'Season 1: 2 of 3 done, 1 failed',
        target: { kind: 'batch', id: 'b1' }
      }
    ])
  })

  it('jobs finishing together notify the batch once', async () => {
    const batch: BatchView = {
      id: 'b1',
      name: 'S1',
      total: 2,
      counts: { completed: 2 },
      state: 'finished'
    }
    const { notifier, sent } = setup({ jobs: { a: 'b1', b: 'b1' }, batch: () => batch })
    notifier.onJobEvent(ev('a', 'completed'))
    notifier.onJobEvent(ev('b', 'completed'))
    await notifier.idle()
    expect(sent.map((s) => s.title)).toEqual(['Batch finished'])
  })

  it('notifies again after a retry finishes the batch a second time', async () => {
    let batch: BatchView = {
      id: 'b1',
      name: 'S1',
      total: 1,
      counts: { failed: 1 },
      state: 'finished'
    }
    const { notifier, sent } = setup({ jobs: { a: 'b1' }, batch: () => batch })
    notifier.onJobEvent(ev('a', 'failed'))
    await notifier.idle()
    notifier.onJobEvent(ev('a', 'queued'))
    batch = { ...batch, counts: { completed: 1 } }
    notifier.onJobEvent(ev('a', 'completed'))
    await notifier.idle()
    expect(sent.map((s) => s.title)).toEqual(['Batch finished with failures', 'Batch finished'])
  })

  it('a batch the user cancelled entirely is not notified', async () => {
    const { notifier, sent } = setup({
      jobs: { a: 'b1' },
      batch: () => ({ id: 'b1', name: 'S1', total: 1, counts: { cancelled: 1 }, state: 'finished' })
    })
    notifier.onJobEvent(ev('a', 'cancelled'))
    await notifier.idle()
    expect(sent).toEqual([])
  })

  it('one notification when the whole batch waits for confirmation', async () => {
    let batch: BatchView = {
      id: 'b1',
      name: 'S1',
      total: 2,
      counts: { 'awaiting-confirmation': 1, running: 1 },
      state: 'active'
    }
    const { notifier, sent } = setup({ jobs: { a: 'b1', b: 'b1' }, batch: () => batch })
    notifier.onJobEvent(ev('a', 'awaiting-confirmation'))
    await notifier.idle()
    expect(sent).toEqual([])
    batch = { ...batch, counts: { 'awaiting-confirmation': 2 } }
    notifier.onJobEvent(ev('b', 'awaiting-confirmation'))
    await notifier.idle()
    expect(sent).toEqual([
      {
        kind: 'batch',
        title: 'Confirm the batch cost',
        body: 'S1: 2 files wait for you',
        target: { kind: 'batch', id: 'b1' }
      }
    ])
  })
})

describe('ActivityNotifier: updates', () => {
  it('notifies a new version once, pointing to Settings → About', async () => {
    const { notifier, sent } = setup()
    notifier.onUpdateStatus({ state: 'checking', current: '1.0.4' })
    notifier.onUpdateStatus({ state: 'available', current: '1.0.4', latest: '1.1.0' })
    notifier.onUpdateStatus({ state: 'available', current: '1.0.4', latest: '1.1.0' })
    await notifier.idle()
    expect(sent).toEqual([
      {
        kind: 'update',
        title: 'Update available',
        body: 'BakaSub 1.1.0 is available. Open Settings → About to update.',
        target: { kind: 'settings', tab: 'about' }
      }
    ])
  })
})
