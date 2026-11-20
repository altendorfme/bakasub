import type { SubtitleTrackInfo } from '@shared/ipc-contract'

/**
 * Track chosen automatically: a translatable one in the first preferred language, else the
 * first translatable; forced tracks (signs only) lose to full ones.
 */
export function pickTrack(
  tracks: readonly SubtitleTrackInfo[],
  preferred: readonly string[]
): number | null {
  const ok = tracks.filter((t) => t.format !== null)
  const base = (l?: string): string => (l ?? '').toLowerCase().split('-')[0]
  for (const lang of preferred) {
    const match = ok.filter((t) => base(t.language) === base(lang))
    const full = match.find((t) => !t.forced) ?? match[0]
    if (full) return full.id
  }
  return (ok.find((t) => !t.forced) ?? ok[0])?.id ?? null
}
