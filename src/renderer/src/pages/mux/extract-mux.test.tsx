// @vitest-environment jsdom
import { QueryClient } from '@tanstack/react-query'
import { createMemoryHistory } from '@tanstack/react-router'
import { cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Job, JobCreateRequest, OpenDialogKind } from '@shared/ipc-contract'
import { App } from '@renderer/app/app'
import { createAppRouter } from '@renderer/app/router'
import { installFakeApi, ok } from '@renderer/test/fake-api'
import { onboardedSettings } from '@renderer/test/fixtures'

function setup(path: string, status: Job['status'] = 'queued'): ReturnType<typeof vi.fn> {
  let lastKind: Job['kind'] = 'extract'
  const create = vi.fn(async (req: JobCreateRequest) => {
    lastKind = req.kind
    const job: Job = {
      id: 'j',
      kind: req.kind,
      batchId: null,
      status,
      step: null,
      source: 'ep01.mkv',
      progress: { step: null },
      result: null,
      error: null,
      attempt: 1,
      createdAt: '2026-11-19T10:00:00.000Z',
      updatedAt: '2026-11-19T10:00:00.000Z',
      startedAt: null,
      finishedAt: null
    }
    return { ok: true as const, data: job }
  })
  installFakeApi({
    jobs: {
      list: () => ok([]),
      create,
      get: () => create({ kind: lastKind } as JobCreateRequest)
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
    dialog: {
      openFiles: (kind: OpenDialogKind) =>
        ok({ paths: kind === 'media' ? ['/v/ep01.mkv'] : ['/s/ep01.pt-BR.ass', '/s/ep01.srt'] })
    },
    media: {
      probe: () =>
        ok({
          attachments: 0,
          subtitles: [
            {
              id: 2,
              codecId: 'S_TEXT/ASS',
              format: 'ass' as const,
              language: 'en',
              default: true,
              forced: false
            },
            {
              id: 3,
              codecId: 'S_TEXT/UTF8',
              format: 'srt' as const,
              language: 'ja',
              default: false,
              forced: false
            }
          ]
        })
    }
  })
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const router = createAppRouter({
    queryClient,
    history: createMemoryHistory({ initialEntries: [path] })
  })
  render(<App queryClient={queryClient} router={router} />)
  return create
}

afterEach(cleanup)

describe('Extract', () => {
  it('several tracks can be chosen; the preferred one starts selected', async () => {
    const create = setup('/extract')
    await userEvent.click(await screen.findByRole('button', { name: 'Browse files' }))
    const group = await screen.findByRole('group', { name: 'Pick the subtitle track' })
    const boxes = await within(group).findAllByRole('checkbox')
    expect(boxes[0].getAttribute('aria-checked')).toBe('true')
    await userEvent.click(boxes[1])
    await userEvent.click(screen.getByRole('button', { name: 'Extract' }))
    expect(create).toHaveBeenCalledWith({
      kind: 'extract',
      source: '/v/ep01.mkv',
      trackIds: [2, 3],
      options: { naming: 'player' }
    })
  })

  it('once done, the restart button speaks of extracting, not translating', async () => {
    setup('/extract', 'completed')
    await userEvent.click(await screen.findByRole('button', { name: 'Browse files' }))
    await screen.findByRole('group', { name: 'Pick the subtitle track' })
    await userEvent.click(screen.getByRole('button', { name: 'Extract' }))
    expect(await screen.findByRole('button', { name: 'Extract from another video' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Translate another file' })).toBeNull()
  })
})

describe('Mux', () => {
  it('language from the file suffix; a missing one blocks; the request carries the rows', async () => {
    const create = setup('/mux')
    await userEvent.click(await screen.findByRole('button', { name: 'Browse files' }))
    await userEvent.click(screen.getByRole('button', { name: 'Add subtitle files' }))
    expect(await screen.findByText('ep01.pt-BR.ass')).toBeTruthy()
    expect(screen.getByText('From the file name')).toBeTruthy()
    const go = screen.getByRole('button', { name: 'Create video' }) as HTMLButtonElement
    expect(go.disabled).toBe(true)

    await userEvent.click(screen.getByRole('combobox', { name: 'Language: ep01.srt' }))
    await userEvent.click(await screen.findByRole('option', { name: 'Japanese' }))
    expect(go.disabled).toBe(false)
    await userEvent.click(go)
    expect(create).toHaveBeenCalledWith({
      kind: 'mux',
      source: '/v/ep01.mkv',
      subtitles: [
        { path: '/s/ep01.pt-BR.ass', language: 'pt-BR', default: true },
        { path: '/s/ep01.srt', language: 'ja' }
      ],
      options: { setDefault: true, keepOriginalSubtitles: true }
    })
  })

  it('once done, the restart button speaks of muxing, not translating', async () => {
    setup('/mux', 'completed')
    await userEvent.click(await screen.findByRole('button', { name: 'Browse files' }))
    await userEvent.click(screen.getByRole('button', { name: 'Add subtitle files' }))
    await userEvent.click(await screen.findByRole('combobox', { name: 'Language: ep01.srt' }))
    await userEvent.click(await screen.findByRole('option', { name: 'Japanese' }))
    await userEvent.click(screen.getByRole('button', { name: 'Create video' }))
    expect(await screen.findByRole('button', { name: 'Mux another video' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Translate another file' })).toBeNull()
  })
})
