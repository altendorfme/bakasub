// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Job, Preset, PresetInput, TermConsistencyReport } from '@shared/ipc-contract'
import '@renderer/i18n'
import { installFakeApi, ok } from '@renderer/test/fake-api'
import { TermConsistency } from './term-consistency'

afterEach(cleanup)

const mine: Preset = {
  id: 'p1',
  builtin: false,
  name: 'My anime',
  mediaType: 'anime',
  temperature: 0.4,
  prompt: '',
  glossary: [{ source: 'Simon', rule: 'keep' }],
  copiedFrom: null,
  createdAt: ''
}

const builtin: Preset = {
  ...mine,
  id: 'builtin:movie',
  builtin: true,
  name: 'Movie',
  mediaType: 'movie',
  temperature: 0.5,
  prompt: 'Cinematic tone.',
  glossary: [],
  createdAt: null
}

const example = (
  translation: string
): TermConsistencyReport['terms'][0]['variants'][0]['examples'][0] => ({
  cueId: 1,
  line: 3,
  startMs: 61_000,
  source: 'Thanks, Bro.',
  translation
})

const report = (presetId = 'p1'): TermConsistencyReport => ({
  analyzedCues: 120,
  candidates: 8,
  preset: { id: presetId, name: 'My anime' },
  terms: [
    {
      term: 'Bro',
      cues: 46,
      unmatched: 2,
      variants: [
        { text: 'mano', cues: 40, kept: false, examples: [example('Valeu, mano.')] },
        { text: 'Bro', cues: 4, kept: true, examples: [example('Valeu, Bro.')] }
      ]
    },
    {
      term: 'Shire',
      cues: 12,
      unmatched: 0,
      variants: [
        { text: 'Condado', cues: 9, kept: false, examples: [] },
        { text: 'Shire', cues: 3, kept: true, examples: [] }
      ]
    }
  ]
})

let presetsListed = false

type Calls = {
  update?: (...a: unknown[]) => void
  create?: (...a: unknown[]) => void
  dismiss?: (id: string) => void
}

function renderWith(
  presets: Preset[],
  r: TermConsistencyReport,
  calls: Calls = {},
  mediaTitle?: string
): void {
  renderWithContainer(presets, r, calls, mediaTitle)
}

function renderWithContainer(
  presets: Preset[],
  r: TermConsistencyReport,
  calls: Calls = {},
  mediaTitle?: string
): { container: HTMLElement } {
  presetsListed = false
  installFakeApi({
    presets: {
      list: () => {
        presetsListed = true
        return ok(presets)
      },
      update: (id: string, preset: PresetInput) => {
        calls.update?.(id, preset)
        return ok({ ...mine, ...preset })
      },
      create: (preset: PresetInput) => {
        calls.create?.(preset)
        return ok({ ...mine, id: 'new', ...preset })
      }
    },
    jobs: {
      dismissConsistency: (id: string) => {
        calls.dismiss?.(id)
        return ok({ id } as Job)
      }
    }
  })
  return render(
    <QueryClientProvider client={new QueryClient()}>
      <TermConsistency jobId="job-1" report={r} mediaTitle={mediaTitle} />
    </QueryClientProvider>
  )
}

describe('TermConsistency', () => {
  it('own preset: adds the chosen renderings (most used by default) to its glossary', async () => {
    const update = vi.fn()
    renderWith([mine], report(), { update })
    expect(await screen.findByText('2 terms translated in different ways')).toBeTruthy()
    expect(screen.getByText('in 46 lines')).toBeTruthy()
    expect(screen.getByText('2 lines rephrased it')).toBeTruthy()
    expect(screen.getByText('00:01:01 · Valeu, mano.')).toBeTruthy()

    // Bro → keep "Bro" instead of the most used; Shire → left out (click the chosen one again).
    await userEvent.click(screen.getByRole('button', { name: 'Use “Bro” for “Bro”' }))
    await userEvent.click(screen.getByRole('button', { name: 'Use “Condado” for “Shire”' }))
    await userEvent.click(await screen.findByRole('button', { name: 'Add 1 term to the glossary' }))
    await vi.waitFor(() => expect(update).toHaveBeenCalled())
    expect(update).toHaveBeenCalledWith('p1', {
      name: 'My anime',
      mediaType: 'anime',
      temperature: 0.4,
      prompt: '',
      glossary: [
        { source: 'Simon', rule: 'keep' },
        { source: 'Bro', target: 'Bro' }
      ]
    })
  })

  it('own preset: terms already in the glossary are not suggested (with or without target)', async () => {
    renderWith(
      [
        {
          ...mine,
          glossary: [
            { source: 'bro', target: 'mano' },
            { source: ' Simon ', target: 'Simon' }
          ]
        }
      ],
      {
        ...report(),
        terms: [
          ...report().terms,
          {
            term: 'Simon',
            cues: 20,
            unmatched: 0,
            variants: [
              { text: 'Simon', cues: 18, kept: true, examples: [] },
              { text: 'Simão', cues: 2, kept: false, examples: [] }
            ]
          }
        ]
      }
    )
    expect(await screen.findByText('1 term translated in different ways')).toBeTruthy()
    expect(screen.getByRole('group', { name: 'Shire' })).toBeTruthy()
    expect(screen.queryByRole('group', { name: 'Bro' })).toBeNull()
    expect(screen.queryByRole('group', { name: 'Simon' })).toBeNull()
    expect(screen.getByRole('button', { name: 'Add 1 term to the glossary' })).toBeTruthy()
  })

  it('hides the section when every term is in the glossary (entry without target too)', async () => {
    const { container } = renderWithContainer(
      [
        {
          ...mine,
          glossary: [
            { source: 'Bro', target: 'mano' },
            { source: 'shire', rule: 'keep as in the original' }
          ]
        }
      ],
      report()
    )
    await vi.waitFor(() => expect(presetsListed).toBe(true))
    await new Promise((r) => setTimeout(r, 0))
    expect(container.textContent).toBe('')
  })

  it('pinned terms the model still varied show only as a warning, without adding', async () => {
    const r = report()
    renderWith([{ ...mine, glossary: [{ source: 'Bro', target: 'mano' }] }], {
      ...r,
      terms: [{ ...r.terms[0], glossaryTarget: 'mano' }]
    })
    expect(await screen.findByText('The AI did not follow the glossary for 1 term')).toBeTruthy()
    expect(screen.getByText('Glossary says “mano”')).toBeTruthy()
    expect(screen.getByText('mano ×40, Bro ×4')).toBeTruthy()
    expect(screen.queryByText(/translated in different ways/)).toBeNull()
    expect(screen.queryByRole('button', { name: /Add .* to the glossary/ })).toBeNull()
  })

  it('own preset: "Do not add" on one of two terms saves only the other', async () => {
    const update = vi.fn()
    renderWith([mine], report(), { update })
    const skipBro = await screen.findByRole('button', { name: 'Do not add “Bro” to the glossary' })
    expect(skipBro.getAttribute('aria-pressed')).toBe('false')
    await userEvent.click(skipBro)
    expect(skipBro.getAttribute('aria-pressed')).toBe('true')
    expect(
      screen.getByRole('button', { name: 'Use “mano” for “Bro”' }).getAttribute('aria-pressed')
    ).toBe('false')

    // Another rendering undoes "Do not add", and "Do not add" again undoes it.
    await userEvent.click(screen.getByRole('button', { name: 'Use “Bro” for “Bro”' }))
    expect(skipBro.getAttribute('aria-pressed')).toBe('false')
    await userEvent.click(skipBro)

    await userEvent.click(screen.getByRole('button', { name: 'Add 1 term to the glossary' }))
    await vi.waitFor(() => expect(update).toHaveBeenCalled())
    expect((update.mock.calls[0][1] as PresetInput).glossary).toEqual([
      { source: 'Simon', rule: 'keep' },
      { source: 'Shire', target: 'Condado' }
    ])
  })

  it('own preset: every term on "Do not add" disables adding', async () => {
    renderWith([mine], report())
    await userEvent.click(
      await screen.findByRole('button', { name: 'Do not add “Bro” to the glossary' })
    )
    await userEvent.click(
      screen.getByRole('button', { name: 'Do not add “Shire” to the glossary' })
    )
    const add = screen.getByRole('button', { name: 'Add 0 terms to the glossary' })
    expect((add as HTMLButtonElement).disabled).toBe(true)
    expect(screen.getByText('No rendering chosen.')).toBeTruthy()
  })

  it('dismiss hides the section for the job without touching the preset', async () => {
    const update = vi.fn()
    const dismiss = vi.fn()
    const { container } = renderWithContainer([mine], report(), { update, dismiss })
    await userEvent.click(await screen.findByRole('button', { name: 'Dismiss' }))
    await vi.waitFor(() => expect(dismiss).toHaveBeenCalledWith('job-1'))
    await vi.waitFor(() => expect(container.textContent).toBe(''))
    expect(update).not.toHaveBeenCalled()
  })

  it('built-in preset: "Do not add" and dismiss work there too', async () => {
    const create = vi.fn()
    const dismiss = vi.fn()
    renderWith([builtin], report('builtin:movie'), { create, dismiss }, 'Gurren Lagann')
    await userEvent.click(
      await screen.findByRole('button', { name: 'Do not add “Shire” to the glossary' })
    )
    await userEvent.click(screen.getByRole('button', { name: 'Create preset with 1 term' }))
    await vi.waitFor(() => expect(create).toHaveBeenCalled())
    expect((create.mock.calls[0][0] as PresetInput).glossary).toEqual([
      { source: 'Bro', target: 'mano' }
    ])
  })

  it('built-in preset: dismiss is offered next to "Create preset"', async () => {
    const dismiss = vi.fn()
    renderWith([builtin], report('builtin:movie'), { dismiss })
    await userEvent.click(await screen.findByRole('button', { name: 'Dismiss' }))
    await vi.waitFor(() => expect(dismiss).toHaveBeenCalledWith('job-1'))
  })

  it('built-in preset: suggests a new preset named after the media, same type and style', async () => {
    const create = vi.fn()
    renderWith([builtin, mine], report('builtin:movie'), { create }, 'The Lord of the Rings')
    expect(await screen.findByText(/is a built-in preset and cannot be edited/)).toBeTruthy()
    const name = screen.getByRole('textbox', { name: 'New preset name' }) as HTMLInputElement
    expect(name.value).toBe('The Lord of the Rings')
    expect(screen.getByText(/Media type “Movie”/)).toBeTruthy()

    await userEvent.click(screen.getByRole('button', { name: 'Create preset with 2 terms' }))
    await vi.waitFor(() => expect(create).toHaveBeenCalled())
    expect(create).toHaveBeenCalledWith({
      name: 'The Lord of the Rings',
      mediaType: 'movie',
      temperature: 0.5,
      prompt: 'Cinematic tone.',
      glossary: [
        { source: 'Bro', target: 'mano' },
        { source: 'Shire', target: 'Condado' }
      ]
    })
  })

  it('built-in preset without media: suggests a free copy name', async () => {
    renderWith([builtin], report('builtin:movie'))
    const name = (await screen.findByRole('textbox', {
      name: 'New preset name'
    })) as HTMLInputElement
    expect(name.value).not.toBe('')
    expect(name.value).not.toBe('Movie')
  })

  it('says when the preset no longer exists', async () => {
    renderWith([], report())
    expect(
      await screen.findByText('The preset of this job (“My anime”) no longer exists.')
    ).toBeTruthy()
  })
})
