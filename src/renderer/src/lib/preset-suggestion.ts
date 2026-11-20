import type { MediaDetails } from '@shared/ipc-contract'

/** What the TMDB details say the work is, for picking a built-in preset. */
export type MediaFlavor = 'anime' | 'documentary' | 'movie' | 'series'

/** TMDB genre ids (the same for movies and TV). */
const ANIMATION = 16
const DOCUMENTARY = 99

/** Hiragana/katakana: only Japanese uses them (kanji alone could be Chinese). */
const KANA = /[぀-ヿ]/

/**
 * Japanese animation = Animation genre + Japanese origin (original language `ja` or country
 * `JP`). Details cached before the genre ids/language existed fall back to the English genre
 * name and kana in the original title.
 */
export function mediaFlavor(d: MediaDetails): MediaFlavor {
  const ids = d.genreIds ?? []
  const animation = ids.includes(ANIMATION) || d.genres.includes('Animation')
  const japanese =
    d.originalLanguage === 'ja' ||
    (d.originCountries ?? []).includes('JP') ||
    (d.originalLanguage === undefined && KANA.test(d.originalTitle ?? ''))
  if (animation && japanese) return 'anime'
  if (ids.includes(DOCUMENTARY) || d.genres.includes('Documentary')) return 'documentary'
  return d.kind === 'movie' ? 'movie' : 'series'
}

export const PRESET_FOR: Record<MediaFlavor, string> = {
  anime: 'builtin:anime',
  documentary: 'builtin:documentary',
  movie: 'builtin:movie',
  series: 'builtin:series'
}

export interface PresetSuggestion {
  presetId: string
  flavor: MediaFlavor
}

/** The built-in preset for the work, if that preset exists. */
export function suggestPreset(
  d: MediaDetails,
  available: readonly { id: string }[]
): PresetSuggestion | null {
  const flavor = mediaFlavor(d)
  const presetId = PRESET_FOR[flavor]
  return available.some((p) => p.id === presetId) ? { presetId, flavor } : null
}
