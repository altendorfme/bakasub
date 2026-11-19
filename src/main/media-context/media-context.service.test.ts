import { describe, expect, it, vi } from 'vitest'
import type { MediaDetails, MediaSearchResult } from '../../shared/ipc-contract'
import { AppError } from '../errors'
import type { MediaProvider } from './cached-provider'
import { MediaContextService } from './media-context.service'

const r = (o: Partial<MediaSearchResult> & { id: number; title: string }): MediaSearchResult => ({
  provider: 'tmdb',
  kind: 'series',
  ...o
})
const asDetails = (x: MediaSearchResult): MediaDetails => ({ ...x, genres: [], synopsis: 'syn' })

type FakeProvider = { [K in keyof MediaProvider]: ReturnType<typeof vi.fn> }

function make(
  results: MediaSearchResult[],
  o: { hasKey?: boolean } = {}
): { svc: MediaContextService; provider: FakeProvider } {
  const provider = {
    search: vi.fn(async () => results),
    details: vi.fn(async (ref) => asDetails(results.find((x) => x.id === ref.id)!)),
    episode: vi.fn(async (_id: number, season: number, episode: number) => ({
      season,
      episode,
      title: `E${episode}`
    }))
  }
  const svc = new MediaContextService({
    provider: provider as unknown as MediaProvider,
    hasKey: async () => o.hasKey ?? true
  })
  return { svc, provider }
}

describe('MediaContextService.identify', () => {
  it('parsed title as a word prefix of the TMDB title: matched, with the episode', async () => {
    const { svc, provider } = make([
      r({ id: 209867, title: "Frieren: Beyond Journey's End", year: 2023 })
    ])
    const out = await svc.identify('Frieren.S01E05.1080p.mkv')
    expect(out.status).toBe('matched')
    expect(out.match?.id).toBe(209867)
    expect(out.episode).toEqual({ season: 1, episode: 5, title: 'E5' })
    expect(provider.search).toHaveBeenCalledWith('Frieren', undefined)
  })

  it('the year must match when the file name has one', async () => {
    const { svc } = make([r({ id: 1, kind: 'movie', title: 'Dune', year: 1984 })])
    expect((await svc.identify('Dune.2021.mkv')).status).toBe('not-found')
  })

  it('a different title is never accepted (better "not recognized" than the wrong show)', async () => {
    const { svc } = make([r({ id: 1, kind: 'movie', title: 'Arrivals', year: 2016 })])
    const out = await svc.identify('Arrival.2016.mkv')
    expect(out).toMatchObject({ status: 'not-found', match: null, episode: null })
    expect(out.release).toEqual({ title: 'Arrival', year: 2016 })
  })

  it('original title counts; accents, case and punctuation are ignored', async () => {
    const { svc } = make([
      r({
        id: 7,
        kind: 'movie',
        title: 'Amélie',
        originalTitle: "Le Fabuleux Destin d'Amélie Poulain"
      })
    ])
    expect((await svc.identify('le.fabuleux.destin.d.amelie.poulain.mkv')).status).toBe('matched')
  })

  it('with an episode marker, series win over a same-titled movie', async () => {
    const { svc } = make([
      r({ id: 1, kind: 'movie', title: 'Cosmos' }),
      r({ id: 2, kind: 'series', title: 'Cosmos' })
    ])
    expect((await svc.identify('Cosmos.S01E01.mkv')).match?.id).toBe(2)
  })

  it('a movie never gets an episode', async () => {
    const { svc, provider } = make([r({ id: 1, kind: 'movie', title: 'Arrival', year: 2016 })])
    const out = await svc.identify('Arrival.2016.mkv')
    expect(out.episode).toBeNull()
    expect(provider.episode).not.toHaveBeenCalled()
  })

  it('no TMDB key: no request at all', async () => {
    const { svc, provider } = make([], { hasKey: false })
    expect((await svc.identify('Frieren.S01E05.mkv')).status).toBe('no-key')
    expect(provider.search).not.toHaveBeenCalled()
  })

  it('offline: status offline (the job continues without context); auth errors surface', async () => {
    const { svc, provider } = make([])
    provider.search.mockRejectedValueOnce(new AppError('NETWORK', 'down'))
    expect((await svc.identify('Frieren.S01E05.mkv')).status).toBe('offline')
    provider.search.mockRejectedValueOnce(new AppError('TMDB_AUTH', 'bad'))
    await expect(svc.identify('Frieren.S01E05.mkv')).rejects.toMatchObject({ code: 'TMDB_AUTH' })
  })
})

describe('MediaContextService.lookup', () => {
  it('details plus the episode for a series when season/episode are given', async () => {
    const { svc } = make([r({ id: 2, title: 'Cosmos' })])
    const out = await svc.lookup(
      { provider: 'tmdb', id: 2, kind: 'series' },
      { season: 1, episode: 3 }
    )
    expect(out.details.id).toBe(2)
    expect(out.episode).toMatchObject({ season: 1, episode: 3 })
  })

  it('unknown id: INVALID_INPUT', async () => {
    const { svc, provider } = make([])
    provider.details.mockResolvedValueOnce(null as never)
    await expect(svc.lookup({ provider: 'tmdb', id: 99, kind: 'movie' })).rejects.toMatchObject({
      code: 'INVALID_INPUT'
    })
  })
})
