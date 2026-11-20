// @vitest-environment jsdom
import { QueryClient } from '@tanstack/react-query'
import { createMemoryHistory } from '@tanstack/react-router'
import { act, cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { LogEntry } from '@shared/ipc-contract'
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

function setup(path = '/logs'): { fake: FakeApi; watch: ReturnType<typeof vi.fn> } {
  const watch = vi.fn(async (on: boolean) => ({ ok: true as const, data: { watching: on } }))
  const fake = installFakeApi({
    jobs: { list: () => ok([]) },
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
    logs: { tail: () => ok(TAIL), watch }
  })
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const router = createAppRouter({
    queryClient,
    history: createMemoryHistory({ initialEntries: [path] })
  })
  render(<App queryClient={queryClient} router={router} />)
  return { fake, watch }
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

  it('?job= filters to one job', async () => {
    setup('/logs?job=job-1234567890')
    const log = await screen.findByRole('log')
    expect(await within(log).findByText('chat failed kind=rate-limit')).toBeTruthy()
    expect(within(log).queryByText('app started')).toBeNull()
  })
})
