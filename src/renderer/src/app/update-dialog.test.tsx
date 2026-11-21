// @vitest-environment jsdom
import { QueryClient } from '@tanstack/react-query'
import { createMemoryHistory } from '@tanstack/react-router'
import { act, cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { AppUpdateStatus, SidecarReport } from '@shared/ipc-contract'
import { onboardedSettings } from '@renderer/test/fixtures'
import { installFakeApi, ok, type FakeApi } from '@renderer/test/fake-api'
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

const available = (latest = '1.1.0', over: Partial<AppUpdateStatus> = {}): AppUpdateStatus => ({
  state: 'available',
  current: '1.0.4',
  latest,
  publishedAt: '2026-11-18T12:00:00.000Z',
  size: 90 * 1024 * 1024,
  notes: '<p>Faster <strong>merge</strong></p><script>alert(1)</script>',
  ...over
})

const downloadUpdate = vi.fn(() => ok(available()))
const installUpdate = vi.fn(() => ok({ installing: true as const }))

function setup(initial: AppUpdateStatus = { state: 'idle', current: '1.0.4' }): {
  fake: FakeApi
  router: AppRouter
} {
  const fake = installFakeApi({
    app: { getUpdateState: () => ok(initial), downloadUpdate, installUpdate },
    jobs: { list: () => ok([]) },
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

const dialogTitle = 'A new version of BakaSub is available'
const push = (fake: FakeApi, s: AppUpdateStatus): void =>
  act(() => fake.emit('app:update-state', s))

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

describe('UpdateDialog', () => {
  it('opens when the startup check reports a new version, with versions, date, size and safe notes', async () => {
    const { fake } = setup()
    await screen.findByRole('button', { name: 'Select several files' })
    expect(screen.queryByRole('dialog')).toBeNull()

    push(fake, available())
    const dialog = await screen.findByRole('dialog', { name: dialogTitle })
    expect(dialog.textContent).toContain('Version 1.0.4 → 1.1.0')
    expect(dialog.textContent).toContain('Published on')
    expect(dialog.textContent).toContain('90 MB')
    const notes = screen.getByRole('region', { name: 'Release notes' })
    expect(notes.textContent).toContain('Faster merge')
    expect(notes.querySelector('script')).toBeNull()
  })

  it('also opens when the Main already knew about the version at mount', async () => {
    setup(available())
    expect(await screen.findByRole('dialog', { name: dialogTitle })).toBeTruthy()
  })

  it('omits missing date, size and notes', async () => {
    setup(available('1.1.0', { publishedAt: '', size: undefined, notes: undefined }))
    const dialog = await screen.findByRole('dialog', { name: dialogTitle })
    expect(dialog.textContent).not.toContain('Published on')
    expect(dialog.textContent).not.toContain('Download size')
    expect(screen.queryByRole('region', { name: 'Release notes' })).toBeNull()
  })

  it.each<AppUpdateStatus>([
    { state: 'not-available', current: '1.0.4' },
    { state: 'checking', current: '1.0.4' },
    {
      state: 'unsupported',
      current: '1.0.4',
      fallbackUrl: 'https://github.com/lsilvatti/bakasub/releases'
    },
    { state: 'error', current: '1.0.4', offline: true, error: { code: 'NETWORK', message: 'x' } }
  ] as AppUpdateStatus[])('stays closed on $state', async (s) => {
    const { fake } = setup()
    await screen.findByRole('button', { name: 'Select several files' })
    push(fake, s)
    await new Promise((r) => setTimeout(r, 20))
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('"Later" closes it and the same version does not reopen in this session', async () => {
    const { fake } = setup()
    await screen.findByRole('button', { name: 'Select several files' })
    push(fake, available())
    await userEvent.click(await screen.findByRole('button', { name: 'Later' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())

    push(fake, { state: 'checking', current: '1.0.4' })
    push(fake, available())
    await new Promise((r) => setTimeout(r, 20))
    expect(screen.queryByRole('dialog')).toBeNull()

    // A newer version is a new announcement.
    push(fake, available('1.2.0'))
    expect((await screen.findByRole('dialog', { name: dialogTitle })).textContent).toContain(
      '1.2.0'
    )
  })

  it('Esc counts as "Later"', async () => {
    const { fake } = setup()
    await screen.findByRole('button', { name: 'Select several files' })
    push(fake, available())
    await screen.findByRole('dialog', { name: dialogTitle })
    await userEvent.keyboard('{Escape}')
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
  })

  it('"See details and update" goes to Settings → About without downloading anything', async () => {
    const { fake, router } = setup()
    await screen.findByRole('button', { name: 'Select several files' })
    push(fake, available())
    await userEvent.click(await screen.findByRole('button', { name: 'See details and update' }))
    await waitFor(() => expect(screen.queryByRole('dialog', { name: dialogTitle })).toBeNull())
    await waitFor(() => expect(router.state.location.pathname).toBe('/settings'))
    expect(router.state.location.search).toMatchObject({ tab: 'about' })
    expect(downloadUpdate).not.toHaveBeenCalled()
    expect(installUpdate).not.toHaveBeenCalled()
  })
})
