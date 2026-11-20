// @vitest-environment jsdom
import { QueryClient } from '@tanstack/react-query'
import { createMemoryHistory } from '@tanstack/react-router'
import { cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type {
  Batch,
  BatchCreateRequest,
  BatchPlan,
  IpcResult,
  Job,
  SubtitleTrackInfo
} from '@shared/ipc-contract'
import { App } from '@renderer/app/app'
import { createAppRouter } from '@renderer/app/router'
import { installFakeApi, ok } from '@renderer/test/fake-api'
import { onboardedSettings } from '@renderer/test/fixtures'

const track = (id: number, name: string, format: 'ass' | null = 'ass'): SubtitleTrackInfo => ({
  id,
  codecId: 'x',
  format,
  language: 'en',
  name,
  default: false,
  forced: false,
  eventCount: 100
})

const plan: BatchPlan = {
  kind: 'extract',
  root: '/anime',
  rejected: [{ path: '/anime/notes.txt', reason: 'unsupported' }],
  truncated: true,
  items: [
    {
      path: '/anime/Show - 01.mkv',
      relPath: 'Show - 01.mkv',
      tracks: [track(2, 'Full'), track(3, 'Signs'), track(4, 'PGS', null)],
      selected: [2, 3]
    },
    {
      path: '/anime/Show - 02.mkv',
      relPath: 'Show - 02.mkv',
      tracks: [track(5, 'Signs'), track(6, 'Full')],
      selected: [5, 6]
    },
    {
      path: '/anime/NCOP.mkv',
      relPath: 'NCOP.mkv',
      tracks: [],
      selected: [],
      skipped: 'no-subtitle-track'
    }
  ]
}

const job = (id: string, source: string, status: Job['status']): Job => ({
  id,
  kind: 'extract',
  batchId: 'b1',
  status,
  step: status === 'running' ? 'extract' : null,
  source,
  progress: { step: status === 'running' ? 'extract' : null },
  result: null,
  error: null,
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
    kind: 'extract',
    root: '/anime',
    createdAt: '2026-11-20T10:00:00.000Z',
    total: 2,
    counts: { queued: 1, running: 1 },
    state: 'active'
  }
  const create = vi.fn(
    createImpl ??
      (async (req: BatchCreateRequest) => {
        const items = req.items as { path: string }[]
        jobs = [job('j0', items[0].path, 'running'), job('j1', items[1].path, 'queued')]
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
      openFiles: () => ok({ paths: ['/anime/Show - 01.mkv', '/anime/Show - 02.mkv'] })
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
    history: createMemoryHistory({ initialEntries: ['/extract'] })
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
  expect(await screen.findByText('2 ready')).toBeTruthy()
}

describe('Extract several files', () => {
  it('folder → tracks by kind → output folder → batch → progress with cancel', async () => {
    const { create, cancel, planCall } = setup()
    await toBatch()
    expect(planCall).toHaveBeenCalledWith({
      kind: 'extract',
      source: { type: 'folder', path: '/anime', recursive: true }
    })
    // Plan warnings and the skipped file with its reason.
    expect(screen.getByText(/The folder has more than 2,000 files/)).toBeTruthy()
    expect(screen.getByText('1 file was refused:')).toBeTruthy()
    expect(screen.getAllByText('1 left out')).toHaveLength(2)
    await next()

    expect(await screen.findByRole('heading', { name: 'Choose the tracks to save' })).toBeTruthy()
    // Untick the "Signs" kind for every file.
    await userEvent.click(screen.getByRole('checkbox', { name: /Signs/ }))
    expect(screen.getAllByText('0/2')).toHaveLength(1)
    await next()

    expect(await screen.findByRole('heading', { name: 'Where to save' })).toBeTruthy()
    expect(screen.getByText('2 tracks from 2 files will be saved.')).toBeTruthy()
    expect(screen.getByRole('region', { name: 'Files that will be written' })).toBeTruthy()
    await userEvent.click(screen.getByRole('radio', { name: /With the track id/ }))
    await userEvent.click(screen.getByRole('radio', { name: /Player-compatible/ }))
    await userEvent.click(screen.getByRole('button', { name: 'Extract 2 files' }))
    expect(create).toHaveBeenCalledWith({
      kind: 'extract',
      root: '/anime',
      items: [
        { path: '/anime/Show - 01.mkv', trackIds: [2] },
        { path: '/anime/Show - 02.mkv', trackIds: [6] }
      ],
      options: { extractNaming: 'player' }
    })

    // No cost step: straight to the progress.
    expect(await screen.findByText('Extracting…')).toBeTruthy()
    expect(screen.getByText('1 extracting')).toBeTruthy()
    expect(screen.getByText('1 waiting')).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Confirm all' })).toBeNull()
    const link = screen.getByRole('link', { name: /Show - 01\.mkv/ })
    expect(link.getAttribute('href')).toContain('job=j0')
    await userEvent.click(screen.getByRole('button', { name: 'Cancel all' }))
    expect(cancel).toHaveBeenCalledWith('b1')
  })

  it('a file can be left out and a file without tracks blocks the step', async () => {
    setup()
    await toBatch()
    await next()
    const card = (await screen.findByRole('button', { name: /Show - 02\.mkv/ })).closest('article')!
    await userEvent.click(within(card).getByRole('button', { name: /Show - 02\.mkv/ }))
    for (const box of within(card).getAllByRole('checkbox')) await userEvent.click(box)
    expect(within(card).getByText('Pick a track')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Continue' }).hasAttribute('disabled')).toBe(true)
    await userEvent.click(within(card).getByRole('button', { name: 'Leave out' }))
    expect(screen.getByRole('button', { name: 'Continue' }).hasAttribute('disabled')).toBe(false)
    expect(screen.getByText('1 left out')).toBeTruthy()
  })

  it('INVALID_INPUT "item N" points at the file to fix', async () => {
    setup(async () => ({
      ok: false as const,
      error: { code: 'INVALID_INPUT', message: 'item 1: file not found' }
    }))
    await toBatch()
    await next()
    await next()
    await userEvent.click(await screen.findByRole('button', { name: 'Extract 2 files' }))
    const alert = await screen.findByRole('alert')
    expect(within(alert).getByText('The batch was not created: fix Show - 02.mkv.')).toBeTruthy()
    expect(within(alert).getByText('file not found')).toBeTruthy()
    await userEvent.click(within(alert).getByRole('button', { name: 'Go to the tracks' }))
    expect(await screen.findByRole('heading', { name: 'Choose the tracks to save' })).toBeTruthy()
  })

  it('opens on the single-file form; the first step switches back to it', async () => {
    setup()
    expect(await screen.findByRole('button', { name: 'Select several files' })).toBeTruthy()
    await userEvent.click(screen.getByRole('button', { name: 'Select several files' }))
    expect(screen.getByRole('heading', { name: 'Choose the videos' })).toBeTruthy()
    await userEvent.click(screen.getByRole('button', { name: 'Extract from a single file' }))
    expect(await screen.findByRole('button', { name: 'Select several files' })).toBeTruthy()
  })

  it('several files: the dialog result is planned as a list of paths', async () => {
    const { planCall } = setup()
    await userEvent.click(await screen.findByRole('button', { name: 'Select several files' }))
    await userEvent.click(screen.getByRole('button', { name: 'Choose files' }))
    expect(await screen.findByText('2 ready')).toBeTruthy()
    expect(planCall).toHaveBeenCalledWith({
      kind: 'extract',
      source: { type: 'files', paths: ['/anime/Show - 01.mkv', '/anime/Show - 02.mkv'] }
    })
  })
})
