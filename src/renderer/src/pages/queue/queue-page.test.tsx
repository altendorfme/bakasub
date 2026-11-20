// @vitest-environment jsdom
import { QueryClient } from '@tanstack/react-query'
import { createMemoryHistory } from '@tanstack/react-router'
import { cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Job } from '@shared/ipc-contract'
import { App } from '@renderer/app/app'
import { createAppRouter } from '@renderer/app/router'
import { cooldownUntil, sessionCost } from '@renderer/data/jobs'
import { installFakeApi, ok } from '@renderer/test/fake-api'
import { onboardedSettings } from '@renderer/test/fixtures'

const now = new Date().toISOString()
const job = (id: string, status: Job['status'], over: Partial<Job> = {}): Job => ({
  id,
  kind: 'pipeline',
  batchId: null,
  status,
  step: null,
  source: `${id}.mkv`,
  progress: { step: null },
  result: null,
  error: null,
  attempt: 1,
  createdAt: now,
  updatedAt: now,
  startedAt: null,
  finishedAt: null,
  ...over
})

const JOBS: Job[] = [
  job('run', 'running', {
    step: 'translate',
    progress: {
      step: 'translate',
      translation: { done: 10, total: 100, cached: 0 },
      cost: 0.01,
      waiting: { reason: 'cooldown', untilMs: Date.now() + 20_000 }
    }
  }),
  job('daily', 'failed', {
    error: { code: 'LLM_DAILY_LIMIT', message: 'free-models-per-day (resets at …)' }
  }),
  job('done', 'completed', {
    result: {
      outputs: ['/out/done.pt-BR.mkv'],
      warnings: [],
      usage: {
        requests: 9,
        promptTokens: 1,
        completionTokens: 1,
        cachedTokens: 0,
        cost: 0.04,
        costIncomplete: false
      }
    }
  }),
  job('cut', 'interrupted')
]

function setup(path: string): {
  retry: ReturnType<typeof vi.fn>
  remove: ReturnType<typeof vi.fn>
} {
  const byId = new Map(JOBS.map((j) => [j.id, j]))
  const retry = vi.fn(async (id: string) => ({
    ok: true as const,
    data: { ...byId.get(id)!, status: 'queued' as const, error: null }
  }))
  const remove = vi.fn(async () => ({ ok: true as const, data: { removed: true as const } }))
  installFakeApi({
    jobs: { list: () => ok(JOBS), get: (id: string) => ok(byId.get(id)!), retry, remove },
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
    }
  })
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const router = createAppRouter({
    queryClient,
    history: createMemoryHistory({ initialEntries: [path] })
  })
  render(<App queryClient={queryClient} router={router} />)
  return { retry, remove }
}

afterEach(cleanup)

describe('Queue', () => {
  it('lists jobs with live state and filters them; "Needs you" counts failures', async () => {
    setup('/queue')
    const list = await screen.findByRole('list', { name: 'Jobs' })
    expect(within(list).getAllByRole('button')).toHaveLength(4)
    expect(within(list).getByText(/Paused after a rate limit/)).toBeTruthy()
    const tab = screen.getByRole('tab', { name: /Needs you/ })
    expect(tab.textContent).toContain('2')
    await userEvent.click(tab)
    expect(within(screen.getByRole('list', { name: 'Jobs' })).getAllByRole('button')).toHaveLength(
      2
    )
    await userEvent.click(screen.getByRole('tab', { name: /^Active/ }))
    expect(within(screen.getByRole('list', { name: 'Jobs' })).getByText('run.mkv')).toBeTruthy()
  })

  it('?job= opens the inspector; a daily-limit failure explains when it resets and can retry', async () => {
    const { retry } = setup('/queue?job=daily')
    expect(await screen.findByRole('heading', { name: 'daily.mkv' })).toBeTruthy()
    expect(screen.getByText(/Daily limit for free models reached/)).toBeTruthy()
    expect(screen.getByText(/Free models reset at .* \(00:00 UTC\)/)).toBeTruthy()
    await userEvent.click(screen.getByRole('button', { name: 'Retry' }))
    expect(retry).toHaveBeenCalledWith('daily')
  })

  it('finished jobs show outputs and cost, and can be removed', async () => {
    const { remove } = setup('/queue?job=done')
    expect(await screen.findByText('/out/done.pt-BR.mkv')).toBeTruthy()
    expect(screen.getByText('Cost: US$ 0.040')).toBeTruthy()
    await userEvent.click(screen.getByRole('button', { name: 'Remove' }))
    expect(remove).toHaveBeenCalledWith('done')
    expect(await screen.findByText('Select a job to see its details.')).toBeTruthy()
  })

  it('interrupted jobs invite a retry', async () => {
    setup('/queue?job=cut')
    expect(await screen.findByText(/BakaSub closed while this job ran/)).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Retry' })).toBeTruthy()
  })

  it('status bar shows the lane cooldown and the session cost', async () => {
    setup('/queue')
    const bar = await screen.findByRole('contentinfo')
    expect(await within(bar).findByText(/Rate limited · \d+ s/)).toBeTruthy()
    expect(within(bar).getByText('US$ 0.050 this session')).toBeTruthy()
  })
})

describe('status helpers', () => {
  it('session cost counts only jobs created since the app opened', () => {
    const old = job('old', 'completed', {
      createdAt: '2020-01-01T00:00:00.000Z',
      progress: { step: null, cost: 5 }
    })
    expect(sessionCost([old, ...JOBS], Date.parse(now))).toBeCloseTo(0.05)
  })
  it('cooldown is the latest future one', () => {
    expect(cooldownUntil(JOBS)).toBe(JOBS[0].progress.waiting!.untilMs)
    expect(cooldownUntil([job('x', 'queued')])).toBeUndefined()
  })
})
