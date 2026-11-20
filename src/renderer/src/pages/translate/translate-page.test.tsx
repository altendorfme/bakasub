// @vitest-environment jsdom
import { QueryClient } from '@tanstack/react-query'
import { createMemoryHistory } from '@tanstack/react-router'
import { cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type {
  CoverageReport,
  Job,
  JobCreateRequest,
  MediaIdentification,
  PreflightEstimate,
  Preset,
  SubtitleTrackInfo
} from '@shared/ipc-contract'
import { App } from '@renderer/app/app'
import { createAppRouter } from '@renderer/app/router'
import { installFakeApi, ok, type FakeApi } from '@renderer/test/fake-api'
import { onboardedSettings } from '@renderer/test/fixtures'

const preset: Preset = {
  id: 'builtin:series',
  builtin: true,
  name: 'Series',
  mediaType: 'series',
  temperature: 0.45,
  prompt: 'Natural dialogue.',
  glossary: [{ source: 'Frieren' }],
  copiedFrom: null,
  createdAt: null
}

const estimate: PreflightEstimate = {
  model: {
    id: 'a/b',
    pricing: { prompt: 1e-6, completion: 2e-6 },
    catalogFetchedAt: '2026-11-19T00:00:00.000Z'
  },
  approximate: false,
  lines: { total: 300, cached: 20, toTranslate: 280, copies: 0, chunks: 7 },
  tokens: { input: { low: 20000, high: 23000 }, output: { low: 8000, high: 9200 } },
  cost: { low: 0.036, high: 0.0414 },
  decision: 'needs-confirmation'
}

const coverage: CoverageReport = {
  totals: { cues: 301, blocks: 301, translatable: 300, skipped: 1, untranslated: 1 },
  byReason: { SKIPPED_NO_LETTERS: 1, UNTRANSLATED_KARAOKE: 1 },
  entries: [
    {
      ref: { kind: 'cue', cueId: 9 },
      status: 'untranslated',
      severity: 'warn',
      reason: 'UNTRANSLATED_KARAOKE',
      params: {},
      location: { line: 42, endLine: 42, startMs: 61_000 },
      excerpt: '{\\k20}La la la',
      outcome: 'kept-original',
      actions: []
    }
  ],
  truncated: false
}

const job = (over: Partial<Job>): Job => ({
  id: 'j1',
  kind: 'translate',
  batchId: null,
  status: 'awaiting-confirmation',
  step: 'preflight',
  source: 'ep01.en.srt',
  progress: { step: 'preflight' },
  result: null,
  error: null,
  attempt: 1,
  createdAt: '2026-11-19T10:00:00.000Z',
  updatedAt: '2026-11-19T10:00:00.000Z',
  startedAt: null,
  finishedAt: null,
  ...over
})

/** TMDB knows the show as Japanese animation (→ the Anime preset is suggested). */
const animeMedia = {
  identify: () =>
    ok({
      release: { title: 'Show' },
      status: 'matched' as const,
      match: {
        provider: 'tmdb' as const,
        id: 7,
        kind: 'series' as const,
        title: 'The Show',
        genres: ['Animation'],
        synopsis: 'Synopsis.'
      },
      episode: null
    } satisfies MediaIdentification),
  lookup: () =>
    ok({
      details: {
        provider: 'tmdb' as const,
        id: 7,
        kind: 'series' as const,
        title: 'The Show',
        genres: ['Animation'],
        genreIds: [16],
        originalLanguage: 'ja',
        synopsis: 'Synopsis.'
      },
      episode: null
    }),
  search: () => ok([])
}

function setup(
  path: string,
  tracks?: SubtitleTrackInfo[],
  media?: typeof animeMedia
): {
  fake: FakeApi
  create: ReturnType<typeof vi.fn>
  confirm: ReturnType<typeof vi.fn>
} {
  let current = job({})
  const create = vi.fn(async (req: JobCreateRequest) => {
    current = job({ kind: req.kind })
    return { ok: true as const, data: current }
  })
  const confirm = vi.fn(async () => {
    current = { ...current, status: 'queued', progress: { step: 'preflight' } }
    return { ok: true as const, data: current }
  })
  const fake = installFakeApi({
    jobs: {
      list: () => ok([]),
      create,
      confirm,
      get: () => ok(current),
      preflight: () => ok({ estimate, coverage })
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
      get: () => ok({ ...onboardedSettings, 'translation.targetLangs': ['pt-BR', 'es'] })
    },
    presets: {
      list: () =>
        ok([preset, { ...preset, id: 'builtin:anime', name: 'Anime', mediaType: 'anime' as const }])
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
    },
    dialog: { openFiles: () => ok({ paths: [path] }) },
    media: {
      ...media,
      probe: () =>
        ok({
          attachments: 2,
          subtitles: tracks ?? [
            {
              id: 1,
              codecId: 'S_HDMV/PGS',
              format: null,
              unsupported: 'image-based' as const,
              language: 'en',
              default: true,
              forced: false
            },
            {
              id: 2,
              codecId: 'S_TEXT/ASS',
              format: 'ass' as const,
              language: 'en',
              default: false,
              forced: false,
              eventCount: 310
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
  return { fake, create, confirm }
}

afterEach(cleanup)

/** Translate opens straight on the single-file wizard. */
const openSingle = async (): Promise<void> => {
  await screen.findByRole('heading', { name: 'Translate a file' })
}

const next = async (): Promise<void> =>
  userEvent.click(await screen.findByRole('button', { name: 'Continue' }))

describe('Translate a file', () => {
  it('subtitle: no track step, defaults prefilled, preflight review, confirm, live progress', async () => {
    const { fake, create, confirm } = setup('/subs/ep01.en.srt')
    await openSingle()
    await userEvent.click(await screen.findByRole('button', { name: 'Browse files' }))
    expect((await screen.findAllByText('ep01.en.srt')).length).toBeGreaterThan(0)
    const steps = screen.getByRole('list', { name: 'Steps' })
    expect(within(steps).queryByText('Track')).toBeNull()
    await next()

    expect(await screen.findByRole('heading', { name: 'How to translate' })).toBeTruthy()
    expect(await screen.findByText('Natural dialogue.')).toBeTruthy()
    expect(screen.getByText('1 glossary entry')).toBeTruthy()
    // In the selects and in the summary.
    expect(screen.getAllByText('Model AB').length).toBe(2)
    expect(screen.getAllByText('Brazilian Portuguese').length).toBe(2)
    await userEvent.type(screen.getByLabelText('Notes for the translator (optional)'), 'Elf mage')
    await next()

    expect(await screen.findByRole('heading', { name: 'Where to save' })).toBeTruthy()
    expect(screen.queryByText('Keep the original subtitles in the video')).toBeNull()
    await userEvent.click(screen.getByRole('button', { name: 'Estimate cost' }))
    expect(create).toHaveBeenCalledWith({
      kind: 'translate',
      source: '/subs/ep01.en.srt',
      notes: 'Elf mage',
      confirmBeforeTranslate: true
    })

    expect(await screen.findByText('280 to translate')).toBeTruthy()
    expect(screen.getByText('US$ 0.036 – 0.041')).toBeTruthy()
    expect(screen.getByText('1 line will stay in the original language')).toBeTruthy()
    expect(screen.getByText(/Karaoke line/)).toBeTruthy()

    await userEvent.click(screen.getByRole('button', { name: 'Translate' }))
    expect(confirm).toHaveBeenCalledWith('j1')
    fake.emit('jobs:progress', {
      id: 'j1',
      status: 'running',
      progress: {
        step: 'translate',
        translation: {
          done: 120,
          total: 280,
          cached: 20,
          chunk: { completed: 2, count: 7, inFlight: 1 }
        },
        cost: 0.012,
        waiting: { reason: 'cooldown', untilMs: Date.now() + 9000 }
      }
    })
    expect(await screen.findByText(/120 of 280 lines · 2 of 7 parts/)).toBeTruthy()
    expect(screen.getByText(/Paused after a rate limit · \d s/)).toBeTruthy()
  })

  it('video: track step preselects a translatable track; image tracks are disabled', async () => {
    const { create } = setup('/v/ep01.mkv')
    await openSingle()
    await userEvent.click(await screen.findByRole('button', { name: 'Browse files' }))
    await next()
    const group = await screen.findByRole('radiogroup')
    const radios = await within(group).findAllByRole('radio')
    expect((radios[0] as HTMLButtonElement).disabled).toBe(true)
    expect(within(radios[0]).getByText('Image subtitles are not supported')).toBeTruthy()
    expect(radios[1].getAttribute('aria-checked')).toBe('true')
    expect(screen.getByText(/2 fonts attached/)).toBeTruthy()
    await next()
    await next()
    await userEvent.click(await screen.findByText('Make the translated subtitle the default track'))
    await userEvent.click(screen.getByRole('button', { name: 'Estimate cost' }))
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: 'pipeline',
        trackId: 2,
        options: { setDefault: false, keepOriginalSubtitles: true, alsoWriteSubtitle: false }
      })
    )
  })

  it('a video that already has a subtitle in the target language asks before translating', async () => {
    const { create } = setup('/v/ep01.mkv', [
      {
        id: 2,
        codecId: 'S_TEXT/ASS',
        format: 'ass',
        language: 'en',
        default: false,
        forced: false
      },
      {
        id: 5,
        codecId: 'S_TEXT/ASS',
        format: 'ass',
        language: 'por',
        name: 'Fansub',
        default: false,
        forced: false
      }
    ])
    await openSingle()
    await userEvent.click(await screen.findByRole('button', { name: 'Browse files' }))
    await next()
    await next()
    expect(await screen.findByText('Already has a Brazilian Portuguese subtitle')).toBeTruthy()
    await next()
    await userEvent.click(await screen.findByRole('button', { name: 'Estimate cost' }))
    const dialog = await screen.findByRole('dialog')
    expect(within(dialog).getByText(/Brazilian Portuguese subtitle track \(Fansub\)/)).toBeTruthy()
    expect(create).not.toHaveBeenCalled()
    await userEvent.click(within(dialog).getByRole('button', { name: 'Translate anyway' }))
    expect(create).toHaveBeenCalled()
  })

  it('reached steps can be revisited from the step bar without Continue', async () => {
    setup('/subs/ep01.en.srt')
    await openSingle()
    await userEvent.click(await screen.findByRole('button', { name: 'Browse files' }))
    await next()
    await next()
    expect(await screen.findByRole('heading', { name: 'Where to save' })).toBeTruthy()
    const steps = screen.getByRole('list', { name: 'Steps' })
    await userEvent.click(within(steps).getByRole('button', { name: /File/ }))
    expect(await screen.findByRole('heading', { name: 'Choose what to translate' })).toBeTruthy()
    await userEvent.click(within(steps).getByRole('button', { name: /Output/ }))
    expect(await screen.findByRole('heading', { name: 'Where to save' })).toBeTruthy()
  })

  it('suggests the preset from TMDB; picking another and back follows the suggestion again', async () => {
    const { create } = setup('/subs/Show - 01.en.srt', undefined, animeMedia)
    await openSingle()
    await userEvent.click(await screen.findByRole('button', { name: 'Browse files' }))
    await next()
    expect(await screen.findByText('Suggested: Japanese animation on TMDB')).toBeTruthy()
    const presetSelect = screen.getAllByRole('combobox')[0]
    expect(within(presetSelect).getByText('Anime')).toBeTruthy()

    await userEvent.click(presetSelect)
    await userEvent.click(await screen.findByRole('option', { name: 'Series' }))
    await userEvent.click(await screen.findByRole('button', { name: /Back to the suggestion/ }))
    expect(await screen.findByText('Suggested: Japanese animation on TMDB')).toBeTruthy()

    await next()
    await userEvent.click(await screen.findByRole('button', { name: 'Estimate cost' }))
    expect(create).toHaveBeenCalledWith(expect.objectContaining({ presetId: 'builtin:anime' }))
  })

  it('keeps the wizard where it was after visiting another page', async () => {
    setup('/subs/ep01.en.srt')
    await openSingle()
    await userEvent.click(await screen.findByRole('button', { name: 'Browse files' }))
    await next()
    await userEvent.type(screen.getByLabelText('Notes for the translator (optional)'), 'Elf mage')

    const nav = screen.getByRole('navigation')
    await userEvent.click(within(nav).getByRole('link', { name: 'Extract' }))
    expect(screen.queryByRole('heading', { name: 'How to translate' })).toBeNull()
    await userEvent.click(within(nav).getByRole('link', { name: 'Translate' }))

    expect(await screen.findByRole('heading', { name: 'How to translate' })).toBeTruthy()
    expect(
      (screen.getByLabelText('Notes for the translator (optional)') as HTMLTextAreaElement).value
    ).toBe('Elf mage')
  })
})
