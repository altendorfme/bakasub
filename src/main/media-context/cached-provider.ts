import type {
  EpisodeDetails,
  MediaDetails,
  MediaRef,
  MediaSearchResult
} from '../../shared/ipc-contract'
import type { MediaCacheRepository } from '../database/repositories/media-cache.repository'
import { AppError } from '../errors'

/** What the media-context feature needs from a metadata source (TMDB today). */
export interface MediaProvider {
  search(query: string, signal?: AbortSignal): Promise<MediaSearchResult[]>
  details(ref: MediaRef, signal?: AbortSignal): Promise<MediaDetails | null>
  episode(
    seriesId: number,
    season: number,
    episode: number,
    signal?: AbortSignal
  ): Promise<EpisodeDetails | null>
}

const DAY = 24 * 60 * 60 * 1000
const SEARCH_TTL = DAY
const DETAILS_TTL = 30 * DAY

const normalizeQuery = (q: string): string => q.trim().toLowerCase().replace(/\s+/g, ' ')

/**
 * Read-through cache in `media_cache`. Fresh entries skip the network; when the provider is
 * unreachable an expired entry is still served (a retry must not lose its context because the
 * user is offline). Auth errors always surface. "Not found" is not cached.
 */
export class CachedMediaProvider implements MediaProvider {
  private readonly now: () => number

  constructor(
    private readonly upstream: MediaProvider,
    private readonly cache: MediaCacheRepository,
    o: { now?: () => number } = {}
  ) {
    this.now = o.now ?? Date.now
  }

  search(query: string, signal?: AbortSignal): Promise<MediaSearchResult[]> {
    const q = normalizeQuery(query)
    return this.through(`tmdb:search:${q}`, SEARCH_TTL, () => this.upstream.search(q, signal))
  }

  details(ref: MediaRef, signal?: AbortSignal): Promise<MediaDetails | null> {
    const kind = ref.kind === 'movie' ? 'movie' : 'tv'
    return this.through(`tmdb:${kind}:${ref.id}`, DETAILS_TTL, () =>
      this.upstream.details(ref, signal)
    )
  }

  episode(
    seriesId: number,
    season: number,
    episode: number,
    signal?: AbortSignal
  ): Promise<EpisodeDetails | null> {
    return this.through(`tmdb:episode:${seriesId}:${season}:${episode}`, DETAILS_TTL, () =>
      this.upstream.episode(seriesId, season, episode, signal)
    )
  }

  private async through<T>(key: string, ttl: number, load: () => Promise<T>): Promise<T> {
    const hit = await this.cache.get(key)
    if (hit && this.now() - hit.fetchedAt < ttl) return hit.value as T
    try {
      const value = await load()
      if (value !== null) await this.cache.set(key, value, this.now())
      return value
    } catch (err) {
      const offline = err instanceof AppError && err.code === 'NETWORK'
      if (offline && hit) return hit.value as T
      throw err
    }
  }
}
