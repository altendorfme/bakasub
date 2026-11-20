// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Preset, PresetInput, TermConsistencyReport } from '@shared/ipc-contract'
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

function renderWith(
  presets: Preset[],
  r: TermConsistencyReport,
  calls: { update?: (...a: unknown[]) => void; create?: (...a: unknown[]) => void } = {},
  mediaTitle?: string
): void {
  installFakeApi({
    presets: {
      list: () => ok(presets),
      update: (id: string, preset: PresetInput) => {
        calls.update?.(id, preset)
        return ok({ ...mine, ...preset })
      },
      create: (preset: PresetInput) => {
        calls.create?.(preset)
        return ok({ ...mine, id: 'new', ...preset })
      }
    }
  })
  render(
    <QueryClientProvider client={new QueryClient()}>
      <TermConsistency report={r} mediaTitle={mediaTitle} />
    </QueryClientProvider>
  )
}

describe('TermConsistency', () => {
  it('own preset: adds the chosen renderings (most used by default) to its glossary', async () => {
    const update = vi.fn()
    renderWith([mine], report(), { update })
    expect(screen.getByText('2 terms translated in different ways')).toBeTruthy()
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

  it('own preset: renderings already pinned are preselected and not re-added', async () => {
    renderWith([{ ...mine, glossary: [{ source: 'Bro', target: 'mano' }] }], report())
    expect(await screen.findByText('In the glossary')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Add 1 term to the glossary' })).toBeTruthy()
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
