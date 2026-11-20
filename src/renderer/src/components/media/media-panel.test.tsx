// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { I18nextProvider } from 'react-i18next'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { MediaDetails, MediaIdentification, MediaRef } from '@shared/ipc-contract'
import { i18n } from '@renderer/i18n'
import { installFakeApi, ok } from '@renderer/test/fake-api'
import { noMedia, type MediaChoice } from './media-choice'
import { MediaPanel } from './media-panel'

const frieren: MediaDetails = {
  provider: 'tmdb',
  id: 7,
  kind: 'series',
  title: "Frieren: Beyond Journey's End",
  year: 2023,
  genres: ['Animation', 'Fantasy'],
  runtime: 24,
  synopsis: 'An elf mage outlives her party.',
  posterUrl: 'bakasub-media://tmdb/w342/p.jpg',
  backdropUrl: 'bakasub-media://tmdb/w1280/b.jpg'
}
const arrival: MediaDetails = { ...frieren, id: 9, kind: 'movie', title: 'Arrival', year: 2016 }

const identified = (over: Partial<MediaIdentification> = {}): MediaIdentification => ({
  release: { title: 'Frieren', season: 1, episode: 5 },
  status: 'matched',
  match: frieren,
  episode: null,
  ...over
})

function setup(id: MediaIdentification): {
  lookup: ReturnType<typeof vi.fn>
  value: () => MediaChoice
} {
  const lookup = vi.fn(async (ref: MediaRef, ep?: { season: number; episode: number }) => ({
    ok: true as const,
    data: {
      details: ref.id === 9 ? arrival : frieren,
      episode:
        ep && ep.episode === 5
          ? { season: 1, episode: 5, title: 'Phantoms of the Dead', synopsis: 'Visions of Himmel.' }
          : null
    }
  }))
  installFakeApi({
    media: {
      identify: () => ok(id),
      lookup,
      search: () =>
        ok([
          { provider: 'tmdb' as const, id: 9, kind: 'movie' as const, title: 'Arrival', year: 2016 }
        ])
    }
  })
  let current = noMedia
  function Harness(): React.JSX.Element {
    const [v, setV] = useState<MediaChoice>(noMedia)
    current = v
    return (
      <MediaPanel
        fileName="[Grp] Frieren - S01E05.mkv"
        value={v}
        onChange={(p) => setV((s) => ({ ...s, ...p }))}
      />
    )
  }
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(
    <I18nextProvider i18n={i18n}>
      <QueryClientProvider client={qc}>
        <Harness />
      </QueryClientProvider>
    </I18nextProvider>
  )
  return { lookup, value: () => current }
}

afterEach(cleanup)

describe('MediaPanel', () => {
  it('recognized series: details, episode from the file name, and its synopsis', async () => {
    const { value } = setup(identified())
    expect(await screen.findByText('An elf mage outlives her party.')).toBeTruthy()
    expect(screen.getByText('Recognized from the file name')).toBeTruthy()
    expect(screen.getByText('From the file name')).toBeTruthy()
    expect(await screen.findByText('S01E05: Phantoms of the Dead')).toBeTruthy()
    expect(screen.getByText('Metadata and images from TMDB')).toBeTruthy()
    expect(value()).toMatchObject({
      ref: { id: 7, kind: 'series' },
      season: 1,
      episode: 5,
      auto: true
    })
  })

  it('editing the episode says it changed and loads the new one', async () => {
    const { lookup } = setup(identified())
    const ep = await screen.findByLabelText('Episode')
    await userEvent.clear(ep)
    await userEvent.type(ep, '6')
    expect(await screen.findByText('Changed (file name says S01E05)')).toBeTruthy()
    await waitFor(() =>
      expect(lookup).toHaveBeenCalledWith(expect.objectContaining({ id: 7 }), {
        season: 1,
        episode: 6
      })
    )
    expect(await screen.findByText('TMDB has no episode S01E06 for this title.')).toBeTruthy()
  })

  it('not recognized: the user searches; picking a movie warns about the episode marker', async () => {
    const { value } = setup(identified({ status: 'not-found', match: null }))
    expect(await screen.findByText(/was not recognized from the file name/)).toBeTruthy()
    const input = screen.getByLabelText('Title')
    await userEvent.clear(input)
    await userEvent.type(input, 'Arri')
    await userEvent.click(await screen.findByText('Arrival', {}, { timeout: 2000 }))
    expect(
      await screen.findByText(/looks like an episode \(S01E05\), but this title is a movie/)
    ).toBeTruthy()
    expect(value()).toMatchObject({ ref: { id: 9, kind: 'movie' }, auto: false })
  })

  it('"Include" can be turned off', async () => {
    const { value } = setup(identified())
    await screen.findByText('An elf mage outlives her party.')
    await userEvent.click(screen.getByRole('checkbox'))
    expect(value().include).toBe(false)
  })

  it('without a TMDB key: one line, the guide and the key form on demand', async () => {
    setup(identified({ status: 'no-key', match: null }))
    expect(await screen.findByText(/Add a free TMDB key/)).toBeTruthy()
    await act(() => userEvent.click(screen.getByRole('button', { name: 'Add TMDB key' })))
    expect(screen.getByLabelText('TMDB key')).toBeTruthy()
  })
})
