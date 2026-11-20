// @vitest-environment jsdom
import { QueryClient } from '@tanstack/react-query'
import { createMemoryHistory } from '@tanstack/react-router'
import { cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it } from 'vitest'
import type { Job, SidecarReport } from '@shared/ipc-contract'
import { onboardedSettings } from '@renderer/test/fixtures'
import { installFakeApi, ok, type FakeApi } from '@renderer/test/fake-api'
import { App } from './app'
import { createAppRouter } from './router'

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
  createdAt: '2026-11-19T10:00:00.000Z',
  updatedAt: '2026-11-19T10:00:00.000Z',
  startedAt: null,
  finishedAt: null,
  ...over
})

const report = (ready: boolean): SidecarReport => ({
  checkedAt: '',
  manifestUpdatedAt: '',
  offline: false,
  installDir: '',
  tools: [],
  ready
})

function setup(path = '/', jobs: Job[] = []): FakeApi {
  const fake = installFakeApi({
    jobs: { list: () => ok(jobs) },
    sidecars: { check: () => ok(report(true)) },
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
  return fake
}

afterEach(cleanup)

describe('App shell', () => {
  it('opens on Translate, inside the sidebar layout', async () => {
    setup('/')
    expect(await screen.findByRole('button', { name: 'Select several files' })).toBeTruthy()
    const nav = screen.getByRole('navigation', { name: 'Main' })
    expect(within(nav).getByRole('link', { name: 'Translate' }).getAttribute('aria-current')).toBe(
      'page'
    )
  })

  it('sidebar navigation switches the page', async () => {
    setup('/translate')
    await userEvent.click(await screen.findByRole('link', { name: 'Models' }))
    expect(await screen.findByRole('heading', { name: 'Models' })).toBeTruthy()
  })

  it('status bar shows queue counts, tools and API key', async () => {
    setup('/translate', [
      job('a', 'running'),
      job('b', 'queued'),
      job('c', 'queued'),
      job('d', 'awaiting-confirmation'),
      job('e', 'completed')
    ])
    const bar = await screen.findByRole('contentinfo')
    expect(await within(bar).findByText(/1 running/)).toBeTruthy()
    expect(within(bar).getByText(/2 queued/)).toBeTruthy()
    expect(within(bar).getByText(/1 needs confirmation/)).toBeTruthy()
    expect(await within(bar).findByText('Tools ready')).toBeTruthy()
    expect(await within(bar).findByText('API key set')).toBeTruthy()
  })

  it('queue badge counts jobs that are active or need the user', async () => {
    setup('/translate', [
      job('a', 'running'),
      job('d', 'awaiting-confirmation'),
      job('e', 'failed')
    ])
    const link = await screen.findByRole('link', { name: /Queue/ })
    expect(await within(link).findByText('2')).toBeTruthy()
  })

  it('jobs:progress events update the status bar without refetching', async () => {
    const fake = setup('/translate', [job('a', 'queued')])
    const bar = await screen.findByRole('contentinfo')
    expect(await within(bar).findByText(/1 queued/)).toBeTruthy()
    fake.emit('jobs:progress', { id: 'a', status: 'running', progress: { step: 'probe' } })
    expect(await within(bar).findByText(/1 running/)).toBeTruthy()
  })

  it('status bar: the key status opens Settings on the Keys tab', async () => {
    setup('/translate')
    const bar = await screen.findByRole('contentinfo')
    await userEvent.click(await within(bar).findByRole('link', { name: /API key set/ }))
    const tab = await screen.findByRole('tab', { name: 'Keys' })
    expect(tab.getAttribute('aria-selected')).toBe('true')
  })
})
