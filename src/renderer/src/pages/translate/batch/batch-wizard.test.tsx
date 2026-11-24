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
  result:
    status === 'awaiting-confirmation'
      ? {
          outputs: [],
          warnings: [],
          preflight: {
            model: { id: 'm', pricing: { prompt: 1e-6, completion: 1e-6 }, catalogFetchedAt: null },
            approximate: false,
            lines: { total: 300, cached: 0, toTranslate: 300, copies: 0, chunks: 3 },
            tokens: { input: { low: 1, high: 2 }, output: { low: 1, high: 2 } },
            cost: { low: 0.03, high: 0.04 },
            decision: 'needs-confirmation'
          }
        }
      : null,
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
    jobs = req.items.map((it, i) =>
      batchJob(`j${i}`, 'path' in it ? it.path : it.video, 'awaiting-confirmation')
    )
    return { ok: true as const, data: batch }
  })
  const confirm = vi.fn(async () => ok({ ...batch, preflight: undefined, counts: { queued: 3 } }))
  const planCall = vi.fn(async (req: { kind: string }) =>
    ok(req.kind === 'pipeline' ? plan : { ...plan, kind: 'translate' as const, items: [] })
  )
  installFakeApi({
    jobs: { list: () => ok(jobs) },
    batches: { plan: planCall as never, create, get: () => ok(batch), confirm },
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
            genreIds: [16],
            // The show is Japanese animation (→ Anime preset); the movie is not (→ Movie).
            originalLanguage: ref.id === 7 ? 'ja' : 'en',
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
    presets: {
      list: () =>
        ok([
          preset,
          { ...preset, id: 'builtin:anime', name: 'Anime', mediaType: 'anime' },
          { ...preset, id: 'builtin:movie', name: 'Movie', mediaType: 'movie' }
        ])
    },
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

/** The summary's row labels, in order. */
const summaryRows = (): string[] =>
  within(screen.getByRole('complementary', { name: 'Summary' }))
    .queryAllByRole('button')
    .map((b) => b.firstElementChild?.textContent ?? '')

const next = async (): Promise<void> =>
  userEvent.click(await screen.findByRole('button', { name: 'Continue' }))

describe('Translate several files', () => {
  it('folder → works grouped by TMDB → one work customized → batch with groups → confirm all', async () => {
    const { create, confirm, planCall } = setup()
    await userEvent.click(await screen.findByRole('button', { name: 'Select several files' }))
    expect(screen.getByRole('heading', { name: 'Choose the files' })).toBeTruthy()
    expect(screen.getByText('Choose a folder or files to get started.')).toBeTruthy()
    expect(summaryRows()).toEqual([])
    await userEvent.click(screen.getByRole('button', { name: 'Choose a folder' }))

    // Both kinds are planned (the folder has only videos, so no choice is offered).
    expect(await screen.findByText('3 ready')).toBeTruthy()
    expect(planCall).toHaveBeenCalledTimes(2)
    expect(screen.getByText('1 left out')).toBeTruthy()
    expect(screen.getByText('2 works recognized')).toBeTruthy()
    expect(screen.queryByText(/This folder has videos and subtitle files/)).toBeNull()
    // Only the first step's rows: no tracks, works or defaults not seen yet.
    expect(summaryRows()).toEqual(['Source', 'Files'])
    await next()

    expect(await screen.findByRole('heading', { name: 'Check the subtitle tracks' })).toBeTruthy()
    expect(summaryRows()).toEqual(['Source', 'Files', 'Tracks'])
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
    // One preset per work, suggested from TMDB; there is no batch-wide preset.
    const showCard = screen.getByRole('button', { name: /^The Show/ }).closest('article')!
    const movieCard = screen.getByRole('button', { name: /^The Movie/ }).closest('article')!
    expect(await within(showCard).findByText('Suggested: Japanese animation on TMDB')).toBeTruthy()
    expect(within(movieCard).getByText('Suggested: a movie on TMDB')).toBeTruthy()
    await userEvent.click(within(movieCard).getByRole('button', { name: 'Customize this work' }))
    await userEvent.type(
      within(movieCard).getByLabelText('Notes for this work (optional)'),
      'Body swap'
    )
    await next()

    expect(await screen.findByRole('heading', { name: 'Where to save' })).toBeTruthy()
    expect(summaryRows()).toEqual([
      'Source',
      'Files',
      'Tracks',
      'Works',
      'Preset',
      'Model',
      'Into',
      'Write',
      'Output'
    ])
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
        {
          name: 'The Show',
          media: { provider: 'tmdb', id: 7, kind: 'series' },
          presetId: 'builtin:anime'
        },
        {
          name: 'The Movie',
          media: { provider: 'tmdb', id: 9, kind: 'movie' },
          presetId: 'builtin:movie',
          notes: 'Body swap'
        }
      ],
      options: { outputMode: 'mux', setDefault: true, keepOriginalSubtitles: true },
      confirmBeforeTranslate: true
    })

    expect(await screen.findByText(/^3 files are waiting for your confirmation\./)).toBeTruthy()
    expect(screen.getByRole('heading', { name: 'Review the cost before translating' })).toBeTruthy()
    // Each file's estimate, then the total.
    expect(screen.getAllByText('US$ 0.030 – 0.040')).toHaveLength(3)
    expect(screen.getAllByText(/^300 lines to translate/)).toHaveLength(3)
    expect(screen.getByRole('button', { name: /Review cost/ }).getAttribute('aria-current')).toBe(
      'step'
    )
    expect(screen.getByText('Estimated total: US$ 0.100 – 0.120')).toBeTruthy()
    await userEvent.click(screen.getByRole('button', { name: 'Confirm all' }))
    expect(confirm).toHaveBeenCalledWith('b1')
  })

  it('the first step switches back to single-file mode', async () => {
    setup()
    await userEvent.click(await screen.findByRole('button', { name: 'Select several files' }))
    await userEvent.click(screen.getByRole('button', { name: 'Translate a single file' }))
    expect(await screen.findByRole('button', { name: 'Select several files' })).toBeTruthy()
  })
})
