// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { I18nextProvider } from 'react-i18next'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { AppUpdateStatus } from '@shared/ipc-contract'
import { TooltipProvider } from '@renderer/components/ui/popover'
import { useAppUpdateEvents } from '@renderer/data/app'
import { i18n } from '@renderer/i18n'
import { installFakeApi, ok } from '@renderer/test/fake-api'
import { onboardedSettings } from '@renderer/test/fixtures'
import { AboutSection } from './about-section'

const base: AppUpdateStatus = { state: 'idle', current: '0.1.0' }
const err = (code: string): Promise<{ ok: false; error: { code: string; message: string } }> =>
  Promise.resolve({ ok: false as const, error: { code, message: code } })

function Bridge({ qc }: { qc: QueryClient }): null {
  useAppUpdateEvents(qc)
  return null
}

function setup(
  status: AppUpdateStatus,
  extra: Record<string, unknown> = {}
): {
  app: Record<string, ReturnType<typeof vi.fn>>
  fake: ReturnType<typeof installFakeApi>
  update: ReturnType<typeof vi.fn>
} {
  const app = {
    getInfo: () =>
      ok({
        name: 'BakaSub',
        version: '0.1.0',
        platform: 'linux' as const,
        arch: 'x64',
        electron: '44',
        userDataPath: '/u'
      }),
    getUpdateState: () => ok(status),
    checkUpdate: vi.fn(() =>
      ok({
        current: '0.1.0',
        latest: '0.1.0',
        updateAvailable: false,
        publishedAt: '',
        offline: false
      })
    ),
    downloadUpdate: vi.fn(() => ok({ ...status, state: 'downloading' as const })),
    cancelUpdateDownload: vi.fn(() => ok({ cancelled: true })),
    installUpdate: vi.fn(() => ok({ installing: true as const })),
    openExternal: vi.fn(() => ok({ opened: true })),
    ...extra
  }
  const update = vi.fn(async (patch: object) => ({
    ok: true as const,
    data: { ...onboardedSettings, ...patch }
  }))
  const fake = installFakeApi({
    app: app as never,
    settings: { get: () => ok(onboardedSettings), update: update as never }
  })
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(
    <I18nextProvider i18n={i18n}>
      <QueryClientProvider client={qc}>
        <TooltipProvider>
          <Bridge qc={qc} />
          <AboutSection />
        </TooltipProvider>
      </QueryClientProvider>
    </I18nextProvider>
  )
  return { app: app as never, fake, update }
}

afterEach(async () => {
  cleanup()
  await i18n.changeLanguage('en')
})

const available: AppUpdateStatus = {
  state: 'available',
  current: '0.1.0',
  latest: '0.2.0',
  size: 84 * 1024 * 1024,
  notes:
    '<h2>Changes</h2><ul><li>Faster</li></ul><script>window.hacked=1</script><img src=x onerror="x()">'
}

describe('About → updates', () => {
  it('idle: only offers to check, and checks on click', async () => {
    const { app } = setup(base)
    expect(screen.queryByRole('button', { name: 'Download' })).toBeNull()
    await userEvent.click(await screen.findByRole('button', { name: 'Check for updates' }))
    expect(app.checkUpdate).toHaveBeenCalledOnce()
  })

  it('not-available shows the up-to-date message', async () => {
    setup({ ...base, state: 'not-available' })
    expect(await screen.findByText('You have the latest version.')).toBeTruthy()
  })

  it('available: shows version and size, never downloads by itself, then downloads on click', async () => {
    const { app } = setup(available)
    expect(await screen.findByText(/Version 0\.2\.0 is available/)).toBeTruthy()
    expect(screen.getByText('(84 MB)')).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Restart and update' })).toBeNull()
    expect(app.downloadUpdate).not.toHaveBeenCalled()
    await userEvent.click(screen.getByRole('button', { name: 'Download' }))
    expect(app.downloadUpdate).toHaveBeenCalledOnce()
  })

  it('release notes are collapsible and sanitized', async () => {
    setup(available)
    await userEvent.click(await screen.findByRole('button', { name: 'Show release notes' }))
    const notes = screen.getByTestId('release-notes')
    expect(notes.textContent).toContain('Faster')
    expect(notes.querySelector('script, img')).toBeNull()
    expect(notes.textContent).not.toContain('hacked')
    await userEvent.click(screen.getByRole('button', { name: 'Hide release notes' }))
    expect(screen.queryByTestId('release-notes')).toBeNull()
  })

  it('downloading: progress follows the event (no polling) and can be cancelled', async () => {
    const { app, fake } = setup(available)
    await screen.findByText(/Version 0\.2\.0 is available/)
    act(() =>
      fake.emit('app:update-state', {
        ...available,
        state: 'downloading',
        progress: {
          percent: 42,
          transferred: 10 * 1024 * 1024,
          total: 84 * 1024 * 1024,
          bytesPerSecond: 1
        }
      })
    )
    expect(await screen.findByRole('progressbar')).toBeTruthy()
    expect(screen.getByText(/42%/)).toBeTruthy()
    act(() =>
      fake.emit('app:update-state', {
        ...available,
        state: 'downloading',
        progress: { percent: 80, transferred: 1, total: 2, bytesPerSecond: 1 }
      })
    )
    expect(await screen.findByText(/80%/)).toBeTruthy()
    await userEvent.click(screen.getByRole('button', { name: 'Cancel download' }))
    expect(app.cancelUpdateDownload).toHaveBeenCalledOnce()
  })

  it('downloaded: install goes through without jobs', async () => {
    const { app } = setup({ ...available, state: 'downloaded' })
    expect(screen.queryByRole('button', { name: 'Download' })).toBeNull()
    await userEvent.click(await screen.findByRole('button', { name: 'Restart and update' }))
    expect(app.installUpdate).toHaveBeenCalledWith({})
  })

  it('active jobs: asks first; Back changes nothing, confirm retries with confirmJobs', async () => {
    const installUpdate = vi
      .fn()
      .mockImplementationOnce(() => err('UPDATE_JOBS_ACTIVE'))
      .mockImplementationOnce(() => err('UPDATE_JOBS_ACTIVE'))
      .mockImplementation(() => ok({ installing: true }))
    setup({ ...available, state: 'downloaded' }, { installUpdate })
    await userEvent.click(await screen.findByRole('button', { name: 'Restart and update' }))
    expect(await screen.findByText('Jobs are running')).toBeTruthy()
    await userEvent.click(screen.getByRole('button', { name: 'Back' }))
    await waitFor(() => expect(screen.queryByText('Jobs are running')).toBeNull())
    expect(installUpdate).toHaveBeenCalledTimes(1)

    await userEvent.click(screen.getByRole('button', { name: 'Restart and update' }))
    await userEvent.click(await screen.findByRole('button', { name: 'Cancel jobs and update' }))
    expect(installUpdate).toHaveBeenLastCalledWith({ confirmJobs: true })
  })

  it('unsupported: shows the release link and hides download/install', async () => {
    const { app } = setup({
      ...base,
      state: 'unsupported',
      fallbackUrl: 'https://github.com/x/y/releases'
    })
    expect(await screen.findByText(/cannot update itself/)).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Download' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Restart and update' })).toBeNull()
    await userEvent.click(screen.getByRole('button', { name: 'Open the release page' }))
    expect(app.openExternal).toHaveBeenCalledWith('https://github.com/x/y/releases')
  })

  it('error offline: non-blocking message and retry', async () => {
    const { app } = setup({
      ...base,
      state: 'error',
      offline: true,
      error: { code: 'NETWORK', message: 'x' }
    })
    expect(await screen.findByText('Could not check for updates.')).toBeTruthy()
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }))
    expect(app.checkUpdate).toHaveBeenCalledOnce()
  })

  it('toggles the automatic check', async () => {
    const { update } = setup(base)
    await userEvent.click(
      await screen.findByRole('switch', { name: 'Check for updates automatically' })
    )
    expect(update).toHaveBeenCalledWith({ 'updates.autoCheck': false })
  })

  it('speaks pt-BR', async () => {
    await i18n.changeLanguage('pt-BR')
    setup({ ...available, state: 'downloaded' })
    expect(await screen.findByRole('button', { name: 'Reiniciar e atualizar' })).toBeTruthy()
  })
})
