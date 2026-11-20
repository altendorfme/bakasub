// @vitest-environment jsdom
import { QueryClient } from '@tanstack/react-query'
import { createMemoryHistory } from '@tanstack/react-router'
import { cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Batch, BatchCreateRequest, BatchMuxPlan, IpcResult, Job } from '@shared/ipc-contract'
import { App } from '@renderer/app/app'
import { createAppRouter } from '@renderer/app/router'
import { installFakeApi, ok } from '@renderer/test/fake-api'
import { onboardedSettings } from '@renderer/test/fixtures'

const file = (p: string): { path: string; relPath: string } => ({ path: `/anime/${p}`, relPath: p })
const sub = (p: string, language: string): { path: string; relPath: string; language: string } => ({
  ...file(p),
  language
})

const plan: BatchMuxPlan = {
  kind: 'mux',
  root: '/anime',
  items: [
    {
      video: file('Show - 01.mkv'),
      subtitles: [
        { ...sub('Show - 01.pt-BR.srt', 'pt-BR'), matchedBy: 'name' },
        { ...sub('Show - 01.en.srt', 'en'), matchedBy: 'name' }
      ]
    },
    {
      video: file('Show - 02.mkv'),
      subtitles: [{ ...sub('Show - 02.ass', 'und'), matchedBy: 'episode' }]
    }
  ],
  unmatchedVideos: [file('NCOP.mkv')],
  unmatchedSubtitles: [sub('Show - 03.srt', 'es')],
  rejected: [{ path: '/anime/notes.txt', reason: 'unsupported' }],
  truncated: true
}

const job = (id: string, source: string, status: Job['status'], error?: Job['error']): Job => ({
  id,
  kind: 'mux',
  batchId: 'b1',
  status,
  step: status === 'running' ? 'mux' : null,
  source,
  progress: { step: status === 'running' ? 'mux' : null },
  result: null,
  error: error ?? null,
  attempt: 1,
  createdAt: '2026-11-20T10:00:00.000Z',
  updatedAt: '2026-11-20T10:00:00.000Z',
  startedAt: null,
  finishedAt: null
})

function setup(createImpl?: (req: BatchCreateRequest) => Promise<IpcResult<Batch>>): {
  create: ReturnType<typeof vi.fn>
  cancel: ReturnType<typeof vi.fn>
  planCall: ReturnType<typeof vi.fn>
} {
  let jobs: Job[] = []
  const batch: Batch = {
    id: 'b1',
    name: 'anime',
    kind: 'mux',
    root: '/anime',
    createdAt: '2026-11-20T10:00:00.000Z',
    total: 2,
    counts: { queued: 1, failed: 1 },
    state: 'active'
  }
  const create = vi.fn(
    createImpl ??
      (async (req: BatchCreateRequest) => {
        const items = req.items as { video: string }[]
        jobs = [
          job('j0', items[0].video, 'queued'),
          job('j1', items[1].video, 'failed', {
            code: 'INVALID_SUBTITLE',
            message: 'bad subtitle'
          })
        ]
        return { ok: true as const, data: batch }
      })
  )
  const cancel = vi.fn(async () => ok({ ...batch, state: 'finished' as const }))
  const planCall = vi.fn(async () => ok(plan))
  installFakeApi({
    jobs: { list: () => ok(jobs) },
    batches: { plan: planCall as never, create, get: () => ok(batch), cancel },
    dialog: {
      openFolder: () => ok({ path: '/anime' }),
      openFiles: () => ok({ paths: ['/anime/Show - 01.mkv', '/anime/Show - 01.en.srt'] })
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
    }
  })
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const router = createAppRouter({
    queryClient,
    history: createMemoryHistory({ initialEntries: ['/mux'] })
  })
  render(<App queryClient={queryClient} router={router} />)
  return { create, cancel, planCall }
}

afterEach(cleanup)

const next = async (): Promise<void> =>
  userEvent.click(await screen.findByRole('button', { name: 'Continue' }))

const toBatch = async (): Promise<void> => {
  await userEvent.click(await screen.findByRole('button', { name: 'Select several files' }))
  await userEvent.click(screen.getByRole('button', { name: 'Choose a folder' }))
  expect(await screen.findByText('2 videos with subtitles')).toBeTruthy()
}

const pick = async (combobox: string, option: string | RegExp): Promise<void> => {
  await userEvent.click(screen.getByRole('combobox', { name: combobox }))
  await userEvent.click(await screen.findByRole('option', { name: option }))
}

describe('Mux several files', () => {
  it('opens on the single-file form, which still works; the first step switches back', async () => {
    setup()
    expect(await screen.findByRole('button', { name: 'Browse files' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Create video' })).toBeTruthy()
    await userEvent.click(screen.getByRole('button', { name: 'Select several files' }))
    expect(screen.getByRole('heading', { name: 'Choose the videos and subtitles' })).toBeTruthy()
    await userEvent.click(screen.getByRole('button', { name: 'Mux a single video' }))
    expect(await screen.findByRole('button', { name: 'Create video' })).toBeTruthy()
  })

  it('folder → pairing (an unpaired subtitle blocks) → output → batch with a failed job', async () => {
    const { create, cancel, planCall } = setup()
    await toBatch()
    expect(planCall).toHaveBeenCalledWith({
      kind: 'mux',
      source: { type: 'folder', path: '/anime', recursive: true }
    })
    expect(screen.getByText(/The folder has more than 2,000 files/)).toBeTruthy()
    expect(screen.getByText('1 file was refused:')).toBeTruthy()
    expect(screen.getByText('1 subtitle needs a video')).toBeTruthy()
    expect(screen.getByText('1 video without subtitles')).toBeTruthy()
    await next()

    expect(await screen.findByRole('heading', { name: 'Check the pairing' })).toBeTruthy()
    // The unpaired subtitle blocks until it has a video.
    expect(screen.getByText('Solve 1 subtitle to continue.')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Continue' }).hasAttribute('disabled')).toBe(true)
    await pick('Video for Show - 03.srt', 'NCOP.mkv')
    expect(screen.getByRole('button', { name: 'Continue' }).hasAttribute('disabled')).toBe(false)
    expect(screen.getByText('3 videos will be created')).toBeTruthy()

    // Language, name and default of a subtitle.
    const card = screen.getByRole('button', { name: /Show - 01\.mkv/ }).closest('article')!
    await userEvent.click(within(card).getByRole('button', { name: /Show - 01\.mkv/ }))
    await userEvent.click(
      within(card).getByRole('checkbox', { name: 'Default track: Show - 01.en.srt' })
    )
    await userEvent.type(
      within(card).getByRole('textbox', { name: 'Track name: Show - 01.en.srt' }),
      'English'
    )
    // Leave the second video out.
    const card2 = screen.getByRole('button', { name: /Show - 02\.mkv/ }).closest('article')!
    await userEvent.click(within(card2).getByRole('button', { name: /Show - 02\.mkv/ }))
    await userEvent.click(within(card2).getByRole('button', { name: 'Leave out' }))
    await next()

    expect(await screen.findByRole('heading', { name: 'Where to save' })).toBeTruthy()
    expect(screen.getByText('2 videos with 3 subtitles will be created.')).toBeTruthy()
    await userEvent.click(screen.getByRole('checkbox', { name: /Keep the subtitles/ }))
    await userEvent.click(screen.getByRole('button', { name: 'Create 2 videos' }))
    expect(create).toHaveBeenCalledWith({
      kind: 'mux',
      root: '/anime',
      items: [
        {
          video: '/anime/Show - 01.mkv',
          subtitles: [
            { path: '/anime/Show - 01.pt-BR.srt', language: 'pt-BR' },
            { path: '/anime/Show - 01.en.srt', language: 'en', name: 'English', default: true }
          ]
        },
        {
          video: '/anime/NCOP.mkv',
          subtitles: [{ path: '/anime/Show - 03.srt', language: 'es', default: true }]
        }
      ],
      options: { setDefault: true, keepOriginalSubtitles: false }
    })

    // No cost step: straight to progress; the failed job shows its reason.
    expect(await screen.findByText('Muxing…')).toBeTruthy()
    expect(screen.getByText('1 waiting')).toBeTruthy()
    expect(screen.getByText('1 failed or cancelled')).toBeTruthy()
    expect(screen.getByText('This subtitle file could not be read.')).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Confirm all' })).toBeNull()
    expect(screen.getByRole('link', { name: /Show - 01\.mkv/ }).getAttribute('href')).toContain(
      'job=j0'
    )
    await userEvent.click(screen.getByRole('button', { name: 'Cancel all' }))
    expect(cancel).toHaveBeenCalledWith('b1')
  })

  it('a subtitle can be ignored instead of paired, and restored', async () => {
    setup()
    await toBatch()
    await next()
    await userEvent.click(await screen.findByRole('button', { name: 'Ignore' }))
    expect(screen.getByRole('button', { name: 'Continue' }).hasAttribute('disabled')).toBe(false)
    await userEvent.click(screen.getByText('2 items left out'))
    await userEvent.click(screen.getByRole('button', { name: 'Restore' }))
    expect(screen.getByRole('button', { name: 'Continue' }).hasAttribute('disabled')).toBe(true)
  })

  it('INVALID_INPUT "item N" points at the video to fix', async () => {
    setup(async () => ({
      ok: false as const,
      error: { code: 'INVALID_INPUT', message: 'item 1: file not found' }
    }))
    await toBatch()
    await next()
    await userEvent.click(await screen.findByRole('button', { name: 'Ignore' }))
    await next()
    await userEvent.click(await screen.findByRole('button', { name: 'Create 2 videos' }))
    const alert = await screen.findByRole('alert')
    expect(within(alert).getByText('The batch was not created: fix Show - 02.mkv.')).toBeTruthy()
    await userEvent.click(within(alert).getByRole('button', { name: 'Go to the pairing' }))
    expect(await screen.findByRole('heading', { name: 'Check the pairing' })).toBeTruthy()
  })
})
