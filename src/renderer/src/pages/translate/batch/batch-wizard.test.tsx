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
  Job,
  MediaIdentification,
  MediaRef,
  Preset,
  SubtitleTrackInfo
} from '@shared/ipc-contract'
import { App } from '@renderer/app/app'
import { createAppRouter } from '@renderer/app/router'
import { installFakeApi, ok } from '@renderer/test/fake-api'
import { onboardedSettings } from '@renderer/test/fixtures'

const preset: Preset = {
  id: 'builtin:series',
  builtin: true,
  name: 'Series',
  mediaType: 'series',
  temperature: 0.45,
  prompt: 'Natural dialogue.',
  glossary: [],
  copiedFrom: null,
  createdAt: null
}

const track = (id: number, name: string): SubtitleTrackInfo => ({
  id,
  codecId: 'S_TEXT/ASS',
  format: 'ass',
  language: 'en',
  name,
  default: false,
  forced: false,
  eventCount: 300
})

const plan: BatchPlan = {
  kind: 'pipeline',
  root: '/anime',
  rejected: [],
  truncated: false,
  items: [
    {
      path: '/anime/Show - 01.mkv',
      relPath: 'Show - 01.mkv',
      tracks: [track(2, 'Full')],
      selected: [2]
    },
    {
      path: '/anime/Show - 02.mkv',
      relPath: 'Show - 02.mkv',
      tracks: [track(2, 'Full')],
      selected: [2]
    },
    {
      path: '/anime/Movie.2016.mkv',
      relPath: 'Movie.2016.mkv',
      tracks: [track(3, 'English')],
      selected: [3]
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

const identify = (name: string): MediaIdentification => {
  const series = name.startsWith('Show')
  const movie = name.startsWith('Movie')
  const ep = series ? Number(/(\d+)\.mkv$/.exec(name)![1]) : undefined
  const ref = series
    ? { id: 7, kind: 'series' as const }
    : movie
      ? { id: 9, kind: 'movie' as const }
      : null
  return {
    release: {
      title: series ? 'Show' : movie ? 'Movie' : 'NCOP',
      ...(ep ? { absoluteEpisode: ep } : {})
    },
    status: ref ? 'matched' : 'not-found',
    match: ref
      ? {
          provider: 'tmdb',
          ...ref,
          title: series ? 'The Show' : 'The Movie',
          genres: ['Animation'],
          synopsis: 'Synopsis.'
        }
      : null,
    episode: null
  }
}

const batchJob = (id: string, source: string, status: Job['status']): Job => ({
  id,
  kind: 'pipeline',
  batchId: 'b1',
  status,
  step: 'preflight',
  source,
  progress: { step: 'preflight' },
  result: null,
  error: null,
  attempt: 1,
  createdAt: '2026-11-20T10:00:00.000Z',
  updatedAt: '2026-11-20T10:00:00.000Z',
  startedAt: null,
  finishedAt: null
})

function setup(): {
  create: ReturnType<typeof vi.fn>
  confirm: ReturnType<typeof vi.fn>
  planCall: ReturnType<typeof vi.fn>
} {
  let jobs: Job[] = []
  const batch: Batch = {
    id: 'b1',
    name: 'anime',
    kind: 'pipeline',
    root: '/anime',
    createdAt: '2026-11-20T10:00:00.000Z',
    total: 3,
    counts: { 'awaiting-confirmation': 3 },
    state: 'active',
    preflight: { awaiting: 3, toTranslate: 900, cost: { low: 0.1, high: 0.12 }, approximate: false }
  }
  const create = vi.fn(async (req: BatchCreateRequest) => {
    jobs = req.items.map((it, i) => batchJob(`j${i}`, it.path, 'awaiting-confirmation'))
    return { ok: true as const, data: batch }
  })
  const confirm = vi.fn(async () => ok({ ...batch, preflight: undefined, counts: { queued: 3 } }))
  const planCall = vi.fn(async (req: { kind: string }) =>
    ok(req.kind === 'pipeline' ? plan : { ...plan, kind: 'translate' as const, items: [] })
  )
  installFakeApi({
    jobs: { list: () => ok(jobs) },
    batches: { plan: planCall, create, get: () => ok(batch), confirm },
    dialog: { openFolder: () => ok({ path: '/anime' }) },
    media: {
      identify: (name: string) => ok(identify(name)),
      lookup: (ref: MediaRef) =>
        ok({
          details: {
            provider: 'tmdb',
            id: ref.id,
            kind: ref.kind,
            title: ref.id === 7 ? 'The Show' : 'The Movie',
            genres: ['Animation'],
            synopsis: 'Synopsis.'
          },
          episode: null
        }),
      search: () => ok([])
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
    presets: { list: () => ok([preset]) },
    models: {
      list: () =>
        ok({
          fetchedAt: '',
          offline: false,
          models: [
            {
              id: 'a/b',
              name: 'Model AB',
              contextLength: null,
              maxCompletionTokens: null,
              isModerated: false,
              pricing: null,
              structuredOutputs: true,
              responseFormat: true
            }
          ]
        })
    }
  })
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const router = createAppRouter({
    queryClient,
    history: createMemoryHistory({ initialEntries: ['/translate'] })
  })
  render(<App queryClient={queryClient} router={router} />)
  return { create, confirm, planCall }
}

afterEach(cleanup)

const next = async (): Promise<void> =>
  userEvent.click(await screen.findByRole('button', { name: 'Continue' }))

describe('Translate several files', () => {
  it('folder → works grouped by TMDB → one work customized → batch with groups → confirm all', async () => {
    const { create, confirm, planCall } = setup()
    await userEvent.click(await screen.findByRole('button', { name: /^Several files or a folder/ }))
    expect(screen.getByRole('heading', { name: 'Choose the files' })).toBeTruthy()
    await userEvent.click(screen.getByRole('button', { name: 'Choose a folder' }))

    // Both kinds are planned (the folder has only videos, so no choice is offered).
    expect(await screen.findByText('3 ready')).toBeTruthy()
    expect(planCall).toHaveBeenCalledTimes(2)
    expect(screen.getByText('1 left out')).toBeTruthy()
    expect(screen.getByText('2 works recognized')).toBeTruthy()
    expect(screen.queryByText(/This folder has videos and subtitle files/)).toBeNull()
    await next()

    expect(await screen.findByRole('heading', { name: 'Check the subtitle tracks' })).toBeTruthy()
    expect(screen.getByText('1 left out')).toBeTruthy()
    await next()

    expect(await screen.findByRole('heading', { name: 'Check the works' })).toBeTruthy()
    const show = screen.getByRole('article', { name: 'The Show' })
    // Absolute numbering (`Show - 02`) read as season 1.
    expect(
      within(show)
        .getAllByLabelText('Episode')
        .map((e) => (e as HTMLInputElement).value)
    ).toEqual(['1', '2'])
    expect(
      within(show)
        .getAllByLabelText('Season')
        .map((e) => (e as HTMLInputElement).value)
    ).toEqual(['1', '1'])
    await next()

    expect(await screen.findByRole('heading', { name: 'How to translate each work' })).toBeTruthy()
    await userEvent.click(screen.getByRole('button', { name: /^The Movie/ }))
    await userEvent.click(screen.getByRole('button', { name: 'Customize this work' }))
    await userEvent.type(screen.getByLabelText('Notes for this work (optional)'), 'Body swap')
    await next()

    expect(await screen.findByRole('heading', { name: 'Where to save' })).toBeTruthy()
    await userEvent.click(screen.getByRole('button', { name: 'Translate 3 files' }))
    expect(create).toHaveBeenCalledWith({
      kind: 'pipeline',
      root: '/anime',
      items: [
        { path: '/anime/Show - 01.mkv', trackIds: [2], group: 0, season: 1, episode: 1 },
        { path: '/anime/Show - 02.mkv', trackIds: [2], group: 0, season: 1, episode: 2 },
        { path: '/anime/Movie.2016.mkv', trackIds: [3], group: 1 }
      ],
      groups: [
        { name: 'The Show', media: { provider: 'tmdb', id: 7, kind: 'series' } },
        { name: 'The Movie', media: { provider: 'tmdb', id: 9, kind: 'movie' }, notes: 'Body swap' }
      ],
      options: { setDefault: true, keepOriginalSubtitles: true, alsoWriteSubtitle: false },
      confirmBeforeTranslate: true
    })

    expect(await screen.findByText('3 files are waiting for your confirmation.')).toBeTruthy()
    expect(screen.getByText('Estimated total: US$ 0.100 – 0.120')).toBeTruthy()
    await userEvent.click(screen.getByRole('button', { name: 'Confirm all' }))
    expect(confirm).toHaveBeenCalledWith('b1')
  })

  it('back from the first step returns to the one/several choice', async () => {
    setup()
    await userEvent.click(await screen.findByRole('button', { name: /^Several files or a folder/ }))
    await userEvent.click(screen.getByRole('button', { name: 'One file or several' }))
    expect(await screen.findByRole('button', { name: /^One file/ })).toBeTruthy()
  })
})
