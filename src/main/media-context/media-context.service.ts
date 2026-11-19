import type {
  EpisodeDetails,
  MediaContextLookup,
  MediaIdentification,
  MediaRef,
  MediaSearchResult
} from '../../shared/ipc-contract'
import { AppError } from '../errors'
import type { MediaProvider } from './cached-provider'
import { parseReleaseName, type ReleaseInfo } from './release-name'

/**
 * Accents, case, `&` and punctuation do not count when comparing titles. Release names spell an
 * apostrophe either as nothing (`Journeys.End`) or as a separator (`d.Amelie`), so `apostrophe`
 * picks which one.
 */
export function normalizeTitle(s: string, apostrophe: '' | ' ' = ''): string {
  return s
    .normalize('NFKD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/['’`]/g, apostrophe)
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
}

function titleMatches(parsed: string, r: MediaSearchResult): boolean {
  const p = normalizeTitle(parsed)
  if (!p) return false
  return [r.title, r.originalTitle].some(
    (t) =>
      !!t &&
      (['', ' '] as const).some((ap) => {
        const n = normalizeTitle(t, ap)
        return n === p || n.startsWith(`${p} `)
      })
  )
}

/**
 * Automatic identification from the file name and manual lookups. Conservative on purpose: a
 * result is accepted on its own only when the title matches (equal, or a word prefix of the
 * title or original title) and the year matches when the name has one. Showing the synopsis and
 * artwork of the wrong work is worse than asking the user to search.
 */
export class MediaContextService {
  constructor(
    private readonly d: {
      provider: MediaProvider
      /** A TMDB key is configured (the feature is optional). */
      hasKey: () => Promise<boolean>
    }
  ) {}

  async identify(fileName: string, signal?: AbortSignal): Promise<MediaIdentification> {
    const release = parseReleaseName(fileName)
    const none = (status: MediaIdentification['status']): MediaIdentification => ({
      release,
      status,
      match: null,
      episode: null
    })
    if (!(await this.d.hasKey())) return none('no-key')

    let results: MediaSearchResult[]
    try {
      results = await this.d.provider.search(release.title, signal)
    } catch (err) {
      if (err instanceof AppError && err.code === 'NETWORK') return none('offline')
      throw err
    }

    const pick = this.pick(release, results)
    if (!pick) return none('not-found')
    const { details, episode } = await this.lookup(
      pick,
      release.season !== undefined && release.episode !== undefined
        ? { season: release.season, episode: release.episode }
        : {},
      signal
    )
    return { release, status: 'matched', match: details, episode }
  }

  search(query: string, signal?: AbortSignal): Promise<MediaSearchResult[]> {
    return this.d.provider.search(query, signal)
  }

  /** Details for a chosen result, plus the episode of a series when season/episode are given. */
  async lookup(
    ref: MediaRef,
    ep: { season?: number; episode?: number } = {},
    signal?: AbortSignal
  ): Promise<MediaContextLookup> {
    const details = await this.d.provider.details(ref, signal)
    if (!details) throw new AppError('INVALID_INPUT', `Unknown ${ref.kind} ${ref.id}`)
    let episode: EpisodeDetails | null = null
    if (ref.kind === 'series' && ep.season !== undefined && ep.episode !== undefined)
      episode = await this.d.provider.episode(ref.id, ep.season, ep.episode, signal)
    return { details, episode }
  }

  private pick(release: ReleaseInfo, results: MediaSearchResult[]): MediaSearchResult | null {
    const accepted = results.filter(
      (r) =>
        titleMatches(release.title, r) && (release.year === undefined || r.year === release.year)
    )
    const episodic = release.season !== undefined || release.absoluteEpisode !== undefined
    if (episodic) return accepted.find((r) => r.kind === 'series') ?? accepted[0] ?? null
    return accepted[0] ?? null
  }
}
