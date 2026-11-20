import type { JobMediaSummary, MediaContextLookup } from '../../shared/ipc-contract'

/**
 * What the queue shows about the media frozen in a job (title, artwork, episode). Read from the
 * persisted spec, so it never needs TMDB. `undefined` for jobs without media context.
 */
export function mediaSummary(spec: unknown): JobMediaSummary | undefined {
  const media = (spec as { media?: MediaContextLookup } | null)?.media
  const d = media?.details
  if (!d || typeof d.title !== 'string') return undefined
  const ep = media.episode
  return {
    title: d.title,
    kind: d.kind,
    ...(d.year ? { year: d.year } : {}),
    ...(d.posterUrl ? { posterUrl: d.posterUrl } : {}),
    ...(d.backdropUrl ? { backdropUrl: d.backdropUrl } : {}),
    ...(ep ? { episode: { season: ep.season, episode: ep.episode, title: ep.title } } : {})
  }
}
