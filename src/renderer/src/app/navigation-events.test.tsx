// @vitest-environment jsdom
import { QueryClient } from '@tanstack/react-query'
import { createMemoryHistory } from '@tanstack/react-router'
import { act, cleanup, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Batch, SidecarReport } from '@shared/ipc-contract'
import { onboardedSettings } from '@renderer/test/fixtures'
import { installFakeApi, ok, type FakeApi } from '@renderer/test/fake-api'
import { resetPageState } from '@renderer/lib/page-state'
import { App } from './app'
import { createAppRouter, type AppRouter } from './router'

const report: SidecarReport = {
  checkedAt: '',
  manifestUpdatedAt: '',
  offline: false,
  installDir: '',
  tools: [],
  ready: true
}
const batch: Batch = {
  id: 'b1',
  name: 'Season 1',
  kind: 'translate',
  root: null,
  createdAt: '2026-11-21T00:00:00.000Z',
  total: 0,
  counts: {},
  state: 'finished'
}
const getBatch = vi.fn(() => ok(batch))

function setup(): { fake: FakeApi; router: AppRouter } {
  const fake = installFakeApi({
    app: { getUpdateState: () => ok({ state: 'idle' as const, current: '1.0.4' }) },
    jobs: { list: () => ok([]) },
    batches: { get: getBatch, jobs: () => ok([]), list: () => ok([batch]) },
    sidecars: { check: () => ok(report) },
    settings: {
      apiKeyStatus: () => ok({ present: true, protection: 'os' as const }),
      get: () => ok(onboardedSettings)
    }
  })
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const router = createAppRouter({
    queryClient,
    history: createMemoryHistory({ initialEntries: ['/translate'] })
  })
  render(<App queryClient={queryClient} router={router} />)
  return { fake, router }
}

afterEach(() => {
  cleanup()
  resetPageState()
  vi.clearAllMocks()
})

describe('app:navigate (native notification click)', () => {
  it('a job opens it in the queue', async () => {
    const { fake, router } = setup()
    await screen.findByRole('button', { name: 'Select several files' })
    act(() => fake.emit('app:navigate', { kind: 'job', id: 'j1' }))
    await waitFor(() => expect(router.state.location.pathname).toBe('/queue'))
    expect(router.state.location.search).toEqual({ job: 'j1' })
  })

  it('an update opens Settings → About', async () => {
    const { fake, router } = setup()
    await screen.findByRole('button', { name: 'Select several files' })
    act(() => fake.emit('app:navigate', { kind: 'settings', tab: 'about' }))
    await waitFor(() => expect(router.state.location.pathname).toBe('/settings'))
    expect(router.state.location.search).toEqual({ tab: 'about' })
  })

  it('a batch opens its progress on Translate and clears the search', async () => {
    const { fake, router } = setup()
    act(() => fake.emit('app:navigate', { kind: 'job', id: 'j1' }))
    await waitFor(() => expect(router.state.location.pathname).toBe('/queue'))
    act(() => fake.emit('app:navigate', { kind: 'batch', id: 'b1' }))
    await waitFor(() => expect(getBatch).toHaveBeenCalledWith('b1'))
    await waitFor(() => expect(router.state.location.search).toEqual({}))
    expect(router.state.location.pathname).toBe('/translate')
  })
})
