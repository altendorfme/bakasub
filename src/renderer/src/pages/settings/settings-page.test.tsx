// @vitest-environment jsdom
import { QueryClient } from '@tanstack/react-query'
import { createMemoryHistory } from '@tanstack/react-router'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Job, PublicSettings } from '@shared/ipc-contract'
import { App } from '@renderer/app/app'
import { createAppRouter } from '@renderer/app/router'
import { i18n } from '@renderer/i18n'
import { installFakeApi, ok } from '@renderer/test/fake-api'
import { onboardedSettings } from '@renderer/test/fixtures'

function setup(jobs: Job[] = []): {
  update: ReturnType<typeof vi.fn>
  reset: ReturnType<typeof vi.fn>
  prune: ReturnType<typeof vi.fn>
} {
  let settings: PublicSettings = { ...onboardedSettings }
  const update = vi.fn(async (patch: Partial<PublicSettings>) => {
    settings = { ...settings, ...patch }
    return { ok: true as const, data: settings }
  })
  const reset = vi.fn(async () => ({ ok: true as const, data: onboardedSettings }))
  const prune = vi.fn(async () =>
    ok({ deleted: 12, stats: { rows: 0, bytes: 0, oldestUsedAt: null } })
  )
  installFakeApi({
    jobs: { list: () => ok(jobs) },
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
      tmdbKeyStatus: () => ok({ present: false }),
      get: () => ok(settings),
      update,
      reset
    },
    presets: { list: () => ok([]) },
    memory: {
      stats: () =>
        ok({ rows: 1200, bytes: 3 * 1024 * 1024, oldestUsedAt: '2026-10-01T00:00:00.000Z' }),
      prune
    },
    models: {
      freeQuota: () =>
        ok({
          tier: 'over-10' as const,
          source: 'auto' as const,
          limit: 1000,
          used: 12,
          remaining: 988
        })
    },
    app: {
      getInfo: () =>
        ok({
          name: 'BakaSub',
          version: '0.1.0',
          platform: 'linux' as const,
          arch: 'x64',
          electron: '44',
          userDataPath: '/u'
        }),
      checkUpdate: () =>
        ok({
          current: '0.1.0',
          latest: '0.1.0',
          updateAvailable: false,
          publishedAt: '',
          offline: false
        })
    }
  })
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const router = createAppRouter({
    queryClient,
    history: createMemoryHistory({ initialEntries: ['/settings'] })
  })
  render(<App queryClient={queryClient} router={router} />)
  return { update, reset, prune }
}

afterEach(async () => {
  cleanup()
  await i18n.changeLanguage('en')
})

const tab = async (name: string): Promise<void> =>
  userEvent.click(await screen.findByRole('tab', { name }))

describe('Settings', () => {
  it('numbers save on blur only when in range', async () => {
    const { update } = setup()
    const field = await screen.findByLabelText('Jobs at the same time')
    await userEvent.clear(field)
    await userEvent.type(field, '9')
    await userEvent.tab()
    expect(update).not.toHaveBeenCalled()
    expect(screen.getByText('Use a value from 1 to 4.')).toBeTruthy()
    await userEvent.clear(field)
    await userEvent.type(field, '3')
    await userEvent.tab()
    expect(update).toHaveBeenCalledWith({ 'jobs.concurrency': 3 })
  })

  it('clearing the auto-confirm amount means "always ask"', async () => {
    const { update } = setup()
    const field = await screen.findByLabelText('Translate without asking below')
    await userEvent.type(field, '0.5')
    await userEvent.tab()
    expect(update).toHaveBeenLastCalledWith({ 'preflight.autoConfirmBelowUsd': 0.5 })
  })

  it('switching the language changes the app (and the guides)', async () => {
    const { update } = setup()
    await userEvent.click(await screen.findByRole('combobox', { name: 'Language' }))
    await userEvent.click(await screen.findByRole('option', { name: /português/i }))
    expect(update).toHaveBeenCalledWith({ 'ui.language': 'pt-BR' })
    await waitFor(() => expect(i18n.language).toBe('pt-BR'))
  })

  it('advanced: quota, seconds stored as ms, restore defaults', async () => {
    const { update, reset } = setup()
    await tab('Advanced')
    expect(await screen.findByText('12 of 1000 requests used')).toBeTruthy()
    const base = screen.getByLabelText('First wait between attempts')
    await userEvent.clear(base)
    await userEvent.type(base, '2')
    await userEvent.tab()
    expect(update).toHaveBeenCalledWith({ 'llm.retry.baseDelayMs': 2000 })
    await userEvent.click(screen.getByRole('button', { name: 'Restore defaults' }))
    expect(reset).toHaveBeenCalledWith(
      expect.arrayContaining(['llm.rateLimit.freeRpm', 'llm.retry.chunkRounds'])
    )
  })

  it('cache: size and prune; disabled while a job runs', async () => {
    const { prune } = setup()
    await tab('Translation cache')
    expect(await screen.findByText('1,200 lines', { exact: false })).toBeTruthy()
    await userEvent.click(screen.getByRole('button', { name: 'Remove' }))
    expect(prune).toHaveBeenCalledWith(30)
    cleanup()
    setup([
      {
        id: 'r',
        kind: 'translate',
        batchId: null,
        status: 'running',
        step: 'translate',
        source: 'a.srt',
        progress: { step: 'translate' },
        result: null,
        error: null,
        attempt: 1,
        createdAt: '2026-11-19T10:00:00.000Z',
        updatedAt: '2026-11-19T10:00:00.000Z',
        startedAt: null,
        finishedAt: null
      }
    ])
    await tab('Translation cache')
    expect(await screen.findByText(/Wait for the running jobs to finish/)).toBeTruthy()
    expect((screen.getByRole('button', { name: 'Remove' }) as HTMLButtonElement).disabled).toBe(
      true
    )
  })

  it('about shows the TMDB notice', async () => {
    setup()
    await tab('About')
    expect(await screen.findByText(/not endorsed or certified by TMDB/)).toBeTruthy()
    expect(screen.getByText('You have the latest version.')).toBeTruthy()
  })
})
