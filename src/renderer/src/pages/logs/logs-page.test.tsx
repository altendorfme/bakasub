// @vitest-environment jsdom
import { QueryClient } from '@tanstack/react-query'
import { createMemoryHistory } from '@tanstack/react-router'
import { act, cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Job, LogEntry, LogTailQuery } from '@shared/ipc-contract'
import { App } from '@renderer/app/app'
import { createAppRouter } from '@renderer/app/router'
import { installFakeApi, ok, type FakeApi } from '@renderer/test/fake-api'
import { onboardedSettings } from '@renderer/test/fixtures'

const line = (msg: string, over: Partial<LogEntry> = {}): LogEntry => ({
  time: '2026-11-19T10:00:00.000Z',
  level: 'info',
  scope: 'jobs',
  msg,
  ...over
})

const TAIL = [
  line('app started', { scope: 'app' }),
  line('verbose thing', { level: 'debug' }),
  line('chat failed kind=rate-limit', { level: 'warn', scope: 'llm', jobId: 'job-1234567890' }),
  line('mkvmerge exited 2', { level: 'error', scope: 'sidecar', detail: 'stderr: bad track' })
]

const JOB_ID = 'job-1234567890'
const job = (id: string, source: string): Job => ({
  id,
  kind: 'translate',
  batchId: null,
  status: 'completed',
  step: null,
  source,
  progress: { step: null },
  result: null,
  error: null,
  attempt: 1,
  createdAt: '',
  updatedAt: '',
  startedAt: null,
  finishedAt: null
})
/** Lines of an old job: not in the global tail, only what `logs:tail({ jobId })` returns. */
const JOB_TAIL = [
  line('job started', { jobId: JOB_ID }),
  line('chat ok chunk=1', { level: 'debug', scope: 'llm', jobId: JOB_ID }),
  line('mkvextract stderr', { level: 'warn', scope: 'sidecar', jobId: JOB_ID })
]

function setup(
  path = '/logs',
  opts: { jobTail?: LogEntry[]; source?: string } = {}
): {
  fake: FakeApi
  watch: ReturnType<typeof vi.fn>
  tail: ReturnType<typeof vi.fn>
} {
  const watch = vi.fn(async (on: boolean) => ({ ok: true as const, data: { watching: on } }))
  const tail = vi.fn((q?: LogTailQuery) => ok(q?.jobId ? (opts.jobTail ?? JOB_TAIL) : TAIL))
  const fake = installFakeApi({
    jobs: {
      list: () => ok([]),
      get: (id: string) =>
        opts.source
          ? ok(job(id, opts.source))
          : Promise.resolve({
              ok: false as const,
              error: { code: 'JOB_NOT_FOUND', message: 'gone' }
            })
    },
    sidecars: {
      check: () =>
        ok({
          checkedAt: '',
          manifestUpdatedAt: '',
          offline: false,
          installDir: '',
          tools: [],
          ready: true
        })
    },
    settings: {
      apiKeyStatus: () => ok({ present: true, protection: 'os' as const }),
      get: () => ok(onboardedSettings)
    },
    logs: { tail, watch }
  })
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const router = createAppRouter({
    queryClient,
    history: createMemoryHistory({ initialEntries: [path] })
  })
  render(<App queryClient={queryClient} router={router} />)
  return { fake, watch, tail }
}

afterEach(cleanup)

describe('Logs', () => {
  it('shows info and above by default, with details and a link to the job', async () => {
    setup()
    const log = await screen.findByRole('log')
    expect(await within(log).findByText('app started')).toBeTruthy()
    expect(within(log).queryByText('verbose thing')).toBeNull()
    expect(within(log).getByText('stderr: bad track')).toBeTruthy()
    expect(within(log).getByRole('link', { name: 'Job job-1234' })).toBeTruthy()
  })

  it('live lines arrive while the screen is open; leaving stops the feed', async () => {
    const { fake, watch } = setup()
    await screen.findByText('app started')
    expect(watch).toHaveBeenCalledWith(true)
    act(() => fake.emit('logs:entry', [line('new line arrived')]))
    expect(await screen.findByText('new line arrived')).toBeTruthy()
    await userEvent.click(screen.getByRole('link', { name: 'Settings' }))
    expect(watch).toHaveBeenLastCalledWith(false)
  })

  it('?job= loads the job from every rotated file, not from the global tail', async () => {
    const { tail } = setup(`/logs?job=${JOB_ID}`)
    const log = await screen.findByRole('log')
    // `job started` is not in the last 1000 global lines (TAIL); it only comes from the job query.
    expect(await within(log).findByText('job started')).toBeTruthy()
    expect(within(log).queryByText('app started')).toBeNull()
    expect(tail).toHaveBeenCalledWith({ jobId: JOB_ID, limit: 2000, minLevel: 'debug' })
    expect(tail).not.toHaveBeenCalledWith(expect.not.objectContaining({ jobId: JOB_ID }))
    expect(screen.getByText('Only job: job-1234')).toBeTruthy()
  })

  it('level and area filters work inside the job filter', async () => {
    setup(`/logs?job=${JOB_ID}`)
    const log = await screen.findByRole('log')
    await within(log).findByText('job started')
    expect(within(log).queryByText('chat ok chunk=1')).toBeNull()

    await userEvent.click(screen.getByRole('combobox', { name: 'Level' }))
    await userEvent.click(await screen.findByRole('option', { name: 'Everything' }))
    expect(within(log).getByText('chat ok chunk=1')).toBeTruthy()

    await userEvent.click(screen.getByRole('combobox', { name: 'Area' }))
    await userEvent.click(await screen.findByRole('option', { name: 'sidecar' }))
    expect(within(log).getByText('mkvextract stderr')).toBeTruthy()
    expect(within(log).queryByText('job started')).toBeNull()
    expect(within(log).queryByText('chat ok chunk=1')).toBeNull()
  })

  it('live lines of other jobs stay out of the job view', async () => {
    const { fake } = setup(`/logs?job=${JOB_ID}`)
    const log = await screen.findByRole('log')
    await within(log).findByText('job started')
    act(() =>
      fake.emit('logs:entry', [
        line('other job line', { jobId: 'job-other' }),
        line('this job line', { time: '2026-11-19T10:00:05.000Z', jobId: JOB_ID })
      ])
    )
    expect(await within(log).findByText('this job line')).toBeTruthy()
    expect(within(log).queryByText('other job line')).toBeNull()
    expect(screen.getByText('3 of 4 lines')).toBeTruthy()
  })

  it('clearing the job filter goes back to the general tail and keeps the live feed', async () => {
    const { fake, watch, tail } = setup(`/logs?job=${JOB_ID}`)
    await screen.findByText('job started')
    await userEvent.click(screen.getByRole('button', { name: 'Show all jobs' }))
    const log = screen.getByRole('log')
    expect(await within(log).findByText('app started')).toBeTruthy()
    expect(within(log).queryByText('job started')).toBeNull()
    expect(tail).toHaveBeenLastCalledWith({ limit: 1000, minLevel: 'debug' })
    expect(watch).not.toHaveBeenCalledWith(false)
    act(() => fake.emit('logs:entry', [line('after clearing', { jobId: 'job-other' })]))
    expect(await within(log).findByText('after clearing')).toBeTruthy()
  })

  it('a job without log lines says so (not "loading", not "no match")', async () => {
    setup(`/logs?job=${JOB_ID}`, { jobTail: [] })
    expect(await screen.findByText(/This job has no log lines left/)).toBeTruthy()
    expect(screen.queryByText('Reading the log…')).toBeNull()
    expect(screen.queryByText('No log lines match the filters.')).toBeNull()
  })

  it('names the job by its file while the job still exists', async () => {
    setup(`/logs?job=${JOB_ID}`, { source: '[Group] Show - 01.mkv' })
    expect(await screen.findByText('Only job: [Group] Show - 01.mkv')).toBeTruthy()
  })
})
