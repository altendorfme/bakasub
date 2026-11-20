import type { MediaRef } from '@shared/ipc-contract'

/** TMDB context picked in the media panel. Sent only when `include` is on. */
export interface MediaChoice {
  ref: MediaRef | null
  /** Recognized from the file name (vs. picked by the user). */
  auto: boolean
  season: number | null
  episode: number | null
  include: boolean
  /** The identification already seeded this file (so a user change is never overwritten). */
  seeded: boolean
}

export const noMedia: MediaChoice = {
  ref: null,
  auto: false,
  season: null,
  episode: null,
  include: true,
  seeded: false
}
