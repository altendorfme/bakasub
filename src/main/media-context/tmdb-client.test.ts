import { describe, expect, it, vi } from 'vitest'
import { artworkUrl, credentialKind, TmdbClient } from './tmdb-client'

const V3 = '0123456789abcdef0123456789abcdef'
const V4 = 'eyJhbGciOiJIUzI1NiJ9.eyJhdWQiOiJ4In0.c2lnbmF0dXJlLXRva2Vu'

type Call = { url: URL; headers: Record<string, string> }

function fakeFetch(routes: Record<string, { status?: number; body?: unknown }>): {
  fetch: typeof fetch
  calls: Call[]
} {
  const calls: Call[] = []
  const f = vi.fn(async (input: string | URL, init?: RequestInit) => {
    const url = new URL(String(input))
    calls.push({ url, headers: (init?.headers ?? {}) as Record<string, string> })
    const r = routes[url.pathname]
    if (!r) return new Response('{}', { status: 404 })
    return new Response(JSON.stringify(r.body ?? {}), { status: r.status ?? 200 })
  })
  return { fetch: f as unknown as typeof fetch, calls }
}

const client = (
  routes: Record<string, { status?: number; body?: unknown }>,
  credential: string | null = V3
): { tmdb: TmdbClient; calls: Call[] } => {
  const { fetch, calls } = fakeFetch(routes)
  return { tmdb: new TmdbClient({ credential: async () => credential, fetch }), calls }
}

describe('credentials', () => {
  it('32 hex chars = v3 API key (query param); anything else = v4 token (Bearer)', async () => {
    expect(credentialKind(V3)).toBe('v3')
    expect(credentialKind(V4)).toBe('v4')

    const a = client({ '/3/configuration': {} }, V3)
    await a.tmdb.validate(V3)
    expect(a.calls[0].url.searchParams.get('api_key')).toBe(V3)
    expect(a.calls[0].headers.Authorization).toBeUndefined()

    const b = client({ '/3/configuration': {} }, V4)
    await b.tmdb.validate(V4)
    expect(b.calls[0].url.searchParams.has('api_key')).toBe(false)
    expect(b.calls[0].headers.Authorization).toBe(`Bearer ${V4}`)
  })

  it('401 is TMDB_AUTH; no credential is TMDB_KEY_MISSING; other failures are NETWORK', async () => {
    await expect(
      client({ '/3/configuration': { status: 401 } }).tmdb.validate(V3)
    ).rejects.toMatchObject({ code: 'TMDB_AUTH' })
    await expect(client({}, null).tmdb.search('x')).rejects.toMatchObject({
      code: 'TMDB_KEY_MISSING'
    })
    await expect(
      client({ '/3/search/multi': { status: 503 } }).tmdb.search('x')
    ).rejects.toMatchObject({ code: 'NETWORK' })
  })
})

describe('search', () => {
  it('multi search, movies and TV only, English, normalized', async () => {
    const { tmdb, calls } = client({
      '/3/search/multi': {
        body: {
          results: [
            {
              media_type: 'tv',
              id: 209867,
              name: "Frieren: Beyond Journey's End",
              original_name: '葬送のフリーレン',
              first_air_date: '2023-09-29',
              poster_path: '/p.jpg'
            },
            { media_type: 'person', id: 1, name: 'Someone' },
            { media_type: 'movie', id: 693134, title: 'Dune: Part Two', release_date: '' }
          ]
        }
      }
    })
    expect(await tmdb.search('frieren')).toEqual([
      {
        provider: 'tmdb',
        id: 209867,
        kind: 'series',
        title: "Frieren: Beyond Journey's End",
        originalTitle: '葬送のフリーレン',
        year: 2023,
        posterUrl: 'bakasub-media://tmdb/w342/p.jpg'
      },
      { provider: 'tmdb', id: 693134, kind: 'movie', title: 'Dune: Part Two' }
    ])
    const q = calls[0].url.searchParams
    expect(q.get('query')).toBe('frieren')
    expect(q.get('language')).toBe('en-US')
    expect(q.get('include_adult')).toBe('false')
  })
})

describe('details', () => {
  it('movie: genres, runtime, synopsis, artwork', async () => {
    const { tmdb } = client({
      '/3/movie/693134': {
        body: {
          id: 693134,
          title: 'Dune: Part Two',
          original_title: 'Dune: Part Two',
          release_date: '2024-02-27',
          runtime: 167,
          genres: [
            { id: 878, name: 'Science Fiction' },
            { id: 12, name: 'Adventure' }
          ],
          original_language: 'en',
          production_countries: [{ iso_3166_1: 'US', name: 'United States of America' }],
          overview: 'Paul Atreides unites with Chani.',
          poster_path: '/a.jpg',
          backdrop_path: '/b.jpg'
        }
      }
    })
    expect(await tmdb.details({ provider: 'tmdb', id: 693134, kind: 'movie' })).toEqual({
      provider: 'tmdb',
      id: 693134,
      kind: 'movie',
      title: 'Dune: Part Two',
      year: 2024,
      genres: ['Science Fiction', 'Adventure'],
      genreIds: [878, 12],
      originalLanguage: 'en',
      originCountries: ['US'],
      runtime: 167,
      synopsis: 'Paul Atreides unites with Chani.',
      posterUrl: 'bakasub-media://tmdb/w342/a.jpg',
      backdropUrl: 'bakasub-media://tmdb/w1280/b.jpg'
    })
  })

  it('series: name fields, typical episode runtime; unknown id is null', async () => {
    const { tmdb } = client({
      '/3/tv/209867': {
        body: {
          id: 209867,
          name: 'Frieren',
          original_name: 'Sousou no Frieren',
          first_air_date: '2023-09-29',
          episode_run_time: [24],
          genres: [{ id: 16, name: 'Animation' }],
          original_language: 'ja',
          origin_country: ['JP'],
          overview: 'An elf mage.'
        }
      }
    })
    expect(await tmdb.details({ provider: 'tmdb', id: 209867, kind: 'series' })).toMatchObject({
      kind: 'series',
      title: 'Frieren',
      originalTitle: 'Sousou no Frieren',
      year: 2023,
      runtime: 24,
      genreIds: [16],
      originalLanguage: 'ja',
      originCountries: ['JP']
    })
    expect(await tmdb.details({ provider: 'tmdb', id: 1, kind: 'series' })).toBeNull()
  })

  it('episode by season/number; missing episode is null', async () => {
    const { tmdb } = client({
      '/3/tv/209867/season/1/episode/5': {
        body: { name: 'Phantoms of the Dead', overview: 'Visions of the lost.' }
      }
    })
    expect(await tmdb.episode(209867, 1, 5)).toEqual({
      season: 1,
      episode: 5,
      title: 'Phantoms of the Dead',
      synopsis: 'Visions of the lost.'
    })
    expect(await tmdb.episode(209867, 9, 99)).toBeNull()
  })
})

describe('artworkUrl', () => {
  it('only a plain TMDB file path becomes a bakasub-media URL', () => {
    expect(artworkUrl('w342', '/abc_DEF-1.jpg')).toBe('bakasub-media://tmdb/w342/abc_DEF-1.jpg')
    expect(artworkUrl('w342', null)).toBeUndefined()
    expect(artworkUrl('w342', '/../etc/passwd')).toBeUndefined()
  })
})
