import type { MediaContextLookup } from '../../shared/ipc-contract'

const code = (season: number, episode: number): string =>
  `S${String(season).padStart(2, '0')}E${String(episode).padStart(2, '0')}`

/**
 * Text of the prompt's `<media>` block: the frozen TMDB details (if the user kept them) and the
 * user's notes. Plain labeled lines: the model reads them as reference, not as instructions.
 * Not part of the Job Memory key, like the notes.
 */
export function buildMediaContext(
  media: MediaContextLookup | null | undefined,
  notes: string | undefined
): string | undefined {
  const lines: string[] = []
  if (media) {
    const d = media.details
    const kind = d.kind === 'series' ? 'TV series' : 'movie'
    lines.push(`Title: ${d.title}${d.year ? ` (${d.year})` : ''}, ${kind}`)
    if (d.originalTitle) lines.push(`Original title: ${d.originalTitle}`)
    if (d.genres.length) lines.push(`Genres: ${d.genres.join(', ')}`)
    if (d.synopsis) lines.push(`Synopsis: ${d.synopsis}`)
    const ep = media.episode
    if (ep) {
      const head = `Episode ${code(ep.season, ep.episode)}${ep.title ? ` "${ep.title}"` : ''}`
      lines.push(ep.synopsis ? `${head}: ${ep.synopsis}` : head)
    }
  }
  const n = notes?.trim()
  if (n) lines.push(...(lines.length ? ['', 'Notes from the user:', n] : [n]))
  return lines.length ? lines.join('\n') : undefined
}
