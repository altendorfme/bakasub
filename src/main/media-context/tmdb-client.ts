import type {
  EpisodeDetails,
  MediaDetails,
  MediaRef,
  MediaSearchResult
} from '../../shared/ipc-contract'
import { AppError } from '../errors'

const API = 'https://api.themoviedb.org/3'
const TIMEOUT_MS = 10_000

export type ArtworkSize = 'w92' | 'w342' | 'w1280'
export const ARTWORK_SIZES: readonly ArtworkSize[] = ['w92', 'w342', 'w1280']
/** A TMDB image path: `/<name>.<ext>`, nothing else (it ends up in a URL and a cache file name). */
export const ARTWORK_FILE = /^\/([A-Za-z0-9_-]+\.(?:jpg|jpeg|png|webp))$/

/** TMDB's 32-hex "API Key" goes in the query; the "API Read Access Token" is a Bearer JWT. */
export const credentialKind = (c: string): 'v3' | 'v4' => (/^[0-9a-f]{32}$/i.test(c) ? 'v3' : 'v4')

export function artworkUrl(size: ArtworkSize, path: string | null | undefined): string | undefined {
  const m = path ? ARTWORK_FILE.exec(path) : null
  return m ? `bakasub-media://tmdb/${size}/${m[1]}` : undefined
}

const yearOf = (date: unknown): number | undefined => {
  const y = typeof date === 'string' ? Number(date.slice(0, 4)) : NaN
  return Number.isInteger(y) && y > 1800 ? y : undefined
}

const str = (v: unknown): string | undefined => (typeof v === 'string' && v.trim() ? v : undefined)

type Json = Record<string, unknown>

/** Thin TMDB v3 client. Synopses are always fetched in English, the language of the prompt. */
export class TmdbClient {
  private readonly fetch: typeof fetch

  constructor(
    private readonly o: {
      credential: () => Promise<string | null>
      fetch?: typeof fetch
    }
  ) {
    this.fetch = o.fetch ?? globalThis.fetch
  }

  /** `GET /configuration` with a candidate credential, before it is saved. */
  async validate(credential: string, signal?: AbortSignal): Promise<void> {
    await this.get('/configuration', {}, signal, credential)
  }

  async search(query: string, signal?: AbortSignal): Promise<MediaSearchResult[]> {
    const body = await this.get(
      '/search/multi',
      { query, include_adult: 'false', page: '1' },
      signal
    )
    const results = Array.isArray(body?.results) ? (body.results as Json[]) : []
    return results.flatMap((r): MediaSearchResult[] => {
      if (r.media_type !== 'movie' && r.media_type !== 'tv') return []
      const movie = r.media_type === 'movie'
      const title = str(movie ? r.title : r.name)
      if (!title || typeof r.id !== 'number') return []
      const original = str(movie ? r.original_title : r.original_name)
      const year = yearOf(movie ? r.release_date : r.first_air_date)
      const poster = artworkUrl('w342', r.poster_path as string | null)
      return [
        {
          provider: 'tmdb',
          id: r.id,
          kind: movie ? 'movie' : 'series',
          title,
          ...(original && original !== title ? { originalTitle: original } : {}),
          ...(year ? { year } : {}),
          ...(poster ? { posterUrl: poster } : {})
        }
      ]
    })
  }

  /** `null` when TMDB does not know the id. */
  async details(ref: MediaRef, signal?: AbortSignal): Promise<MediaDetails | null> {
    const movie = ref.kind === 'movie'
    const b = await this.get(movie ? `/movie/${ref.id}` : `/tv/${ref.id}`, {}, signal)
    if (!b) return null
    const title = str(movie ? b.title : b.name) ?? ''
    const original = str(movie ? b.original_title : b.original_name)
    const year = yearOf(movie ? b.release_date : b.first_air_date)
    const runtimes = movie
      ? [b.runtime]
      : Array.isArray(b.episode_run_time)
        ? b.episode_run_time
        : []
    const runtime = runtimes.find((n): n is number => typeof n === 'number' && n > 0)
    const genres = Array.isArray(b.genres)
      ? (b.genres as Json[]).map((g) => str(g.name)).filter((g): g is string => !!g)
      : []
    const genreIds = Array.isArray(b.genres)
      ? (b.genres as Json[]).map((g) => g.id).filter((n): n is number => typeof n === 'number')
      : []
    const originalLanguage = str(b.original_language)
    const countries = (
      Array.isArray(b.origin_country)
        ? (b.origin_country as unknown[])
        : Array.isArray(b.production_countries)
          ? (b.production_countries as Json[]).map((c) => c.iso_3166_1)
          : []
    ).filter((c): c is string => typeof c === 'string' && c.length > 0)
    const poster = artworkUrl('w342', b.poster_path as string | null)
    const backdrop = artworkUrl('w1280', b.backdrop_path as string | null)
    return {
      provider: 'tmdb',
      id: ref.id,
      kind: ref.kind,
      title,
      ...(original && original !== title ? { originalTitle: original } : {}),
      ...(year ? { year } : {}),
      genres,
      genreIds,
      ...(originalLanguage ? { originalLanguage } : {}),
      ...(countries.length ? { originCountries: countries } : {}),
      ...(runtime ? { runtime } : {}),
      synopsis: str(b.overview) ?? '',
      ...(poster ? { posterUrl: poster } : {}),
      ...(backdrop ? { backdropUrl: backdrop } : {})
    }
  }

  async episode(
    seriesId: number,
    season: number,
    episode: number,
    signal?: AbortSignal
  ): Promise<EpisodeDetails | null> {
    const b = await this.get(`/tv/${seriesId}/season/${season}/episode/${episode}`, {}, signal)
    if (!b) return null
    const synopsis = str(b.overview)
    return { season, episode, title: str(b.name) ?? '', ...(synopsis ? { synopsis } : {}) }
  }

  /** JSON body, or `null` on 404. */
  private async get(
    path: string,
    params: Record<string, string>,
    signal?: AbortSignal,
    override?: string
  ): Promise<Json | null> {
    const credential = override ?? (await this.o.credential())
    if (!credential) throw new AppError('TMDB_KEY_MISSING', 'No TMDB key configured')
    const url = new URL(`${API}${path}`)
    url.searchParams.set('language', 'en-US')
    for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v)
    const headers: Record<string, string> = { Accept: 'application/json' }
    if (credentialKind(credential) === 'v3') url.searchParams.set('api_key', credential)
    else headers.Authorization = `Bearer ${credential}`

    const timeout = AbortSignal.timeout(TIMEOUT_MS)
    let res: Response
    try {
      res = await this.fetch(url, {
        headers,
        signal: signal ? AbortSignal.any([signal, timeout]) : timeout
      })
    } catch (err) {
      if (signal?.aborted) throw new AppError('CANCELLED', 'TMDB request cancelled')
      throw new AppError('NETWORK', `TMDB unreachable: ${path}`, { cause: err })
    }
    if (res.status === 401) throw new AppError('TMDB_AUTH', 'TMDB rejected the credential')
    if (res.status === 404) return null
    if (!res.ok) throw new AppError('NETWORK', `TMDB ${res.status} on ${path}`)
    return (await res.json()) as Json
  }
}
