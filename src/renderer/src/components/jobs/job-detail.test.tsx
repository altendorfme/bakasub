// @vitest-environment jsdom
import { cleanup, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import '@renderer/i18n'
import type { Job, JobStatus } from '@shared/ipc-contract'
import { JobDetail } from './job-detail'

const state = vi.hoisted(() => ({ job: undefined as Job | undefined }))
const idle = { mutate: vi.fn(), isPending: false }

vi.mock('@renderer/data/jobs', async (importActual) => ({
  ...(await importActual<typeof import('@renderer/data/jobs')>()),
  useJob: () => ({ data: state.job, isError: false }),
  usePreflight: () => ({ data: undefined }),
  useJobAction: () => idle,
  useRemoveJob: () => idle,
  useSetJobMemory: () => idle
}))
vi.mock('@renderer/data/models', () => ({
  useModels: () => ({
    data: {
      models: [{ id: 'google/gemini-2.5-flash', name: 'Google: Gemini 2.5 Flash' }],
      fetchedAt: '',
      offline: false
    }
  })
}))
vi.mock('@tanstack/react-router', () => ({
  Link: ({ children }: { children: React.ReactNode }) => <a>{children}</a>
}))
// The state-specific panels are tested on their own; here only the setup block matters.
vi.mock('./job-progress', () => ({ JobProgress: () => null }))
vi.mock('./job-result', () => ({ JobResult: () => null }))
vi.mock('./preflight-review', () => ({ PreflightReview: () => null }))
vi.mock('./prompt-summary', () => ({ PromptSummary: () => null }))

const job = (status: JobStatus, over: Partial<Job> = {}): Job => ({
  id: 'j1',
  kind: 'pipeline',
  batchId: null,
  status,
  step: null,
  source: 'Frieren - 05.mkv',
  progress: { step: null },
  translation: {
    model: 'google/gemini-2.5-flash',
    preset: { id: 'p1', name: 'Frieren (custom)' },
    sourceLang: 'ja',
    targetLang: 'pt-BR'
  },
  memory: 'use',
  result: null,
  error: null,
  attempt: 1,
  createdAt: '2026-11-20T10:00:00.000Z',
  updatedAt: '2026-11-20T10:00:00.000Z',
  startedAt: null,
  finishedAt: null,
  ...over
})

beforeEach(() => {
  state.job = undefined
})
afterEach(cleanup)

describe('JobDetail translation setup', () => {
  const statuses: JobStatus[] = [
    'awaiting-confirmation',
    'queued',
    'running',
    'completed',
    'completed-with-warnings',
    'failed',
    'cancelled',
    'interrupted'
  ]

  it.each(statuses)('shows the frozen model, preset and languages while %s', (status) => {
    state.job = job(status)
    render(<JobDetail id="j1" />)
    const dl = screen.getByLabelText('Translation setup')
    const q = within(dl)
    expect(q.getByText('Google: Gemini 2.5 Flash')).toBeTruthy()
    expect(q.getByText('google/gemini-2.5-flash')).toBeTruthy()
    expect(q.getByText('Frieren (custom)')).toBeTruthy()
    expect(q.getByText('Japanese → Brazilian Portuguese')).toBeTruthy()
    expect(q.queryByText('Not recorded')).toBeNull()
  })

  it('names built-in presets in the app language and shows ids the catalog lacks', () => {
    state.job = job('completed', {
      translation: {
        model: 'acme/retired-model',
        preset: { id: 'builtin:anime', name: 'Anime' },
        targetLang: 'en'
      }
    })
    render(<JobDetail id="j1" />)
    const q = within(screen.getByLabelText('Translation setup'))
    expect(q.getByText('acme/retired-model')).toBeTruthy()
    expect(q.getByText('Anime')).toBeTruthy()
    expect(q.getByText('Detected automatically → English')).toBeTruthy()
  })

  it('opens a job created before the setup was recorded and says so', () => {
    state.job = job('completed', { translation: {} })
    render(<JobDetail id="j1" />)
    const q = within(screen.getByLabelText('Translation setup'))
    // Model, preset and target language.
    expect(q.getAllByText('Not recorded')).toHaveLength(3)
  })

  it('treats a DTO without the summary as not recorded', () => {
    state.job = job('failed', { translation: undefined })
    render(<JobDetail id="j1" />)
    expect(
      within(screen.getByLabelText('Translation setup')).getAllByText('Not recorded')
    ).toHaveLength(3)
  })

  it('is absent from jobs that do not translate', () => {
    state.job = job('completed', { kind: 'extract', translation: undefined, memory: undefined })
    render(<JobDetail id="j1" />)
    expect(screen.queryByLabelText('Translation setup')).toBeNull()
  })
})
