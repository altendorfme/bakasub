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
  /** What the work is, whichever way the preset was picked. */
  flavor: MediaFlavor
  /** `name`: a user preset whose name matches the work; `flavor`: the built-in for its type. */
  source: 'name' | 'flavor'
}

/** Shorter names would match almost any title. */
const MIN_NAME_LENGTH = 3

/**
 * Lowercase, no accents or punctuation, collapsed spaces, without a trailing "(2007)" year or
 * season marker ("Season 2", "S02", "2nd Season", "Temporada 2").
 */
export function normalizeName(raw: string): string {
  return raw
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\(\s*(19|20)\d{2}\s*\)/g, ' ')
    .replace(/\b(season|temporada|saison)\s*\d+\b/g, ' ')
    .replace(/\b\d+(st|nd|rd|th)\s+season\b/g, ' ')
    .replace(/\bs\d{1,2}\b/g, ' ')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
}

/** Contained in either direction, on word boundaries. */
function nameMatches(preset: string, title: string): boolean {
  if (preset === title) return true
  return ` ${title} `.includes(` ${preset} `) || ` ${preset} `.includes(` ${title} `)
}

type Candidate = { id: string; name?: string; builtin?: boolean; createdAt?: string | null }

/** The user's own preset whose name matches the work's title or original title. */
function presetByName(d: MediaDetails, available: readonly Candidate[]): string | null {
  const titles = [d.title, d.originalTitle]
    .map((t) => normalizeName(t ?? ''))
    .filter((t) => t.length >= MIN_NAME_LENGTH)
  if (titles.length === 0) return null
  let best: { id: string; len: number; at: string } | null = null
  for (const p of available) {
    if (p.builtin !== false || !p.name) continue
    const name = normalizeName(p.name)
    if (name.length < MIN_NAME_LENGTH || !titles.some((t) => nameMatches(name, t))) continue
    const at = p.createdAt ?? ''
    if (!best || name.length > best.len || (name.length === best.len && at > best.at))
      best = { id: p.id, len: name.length, at }
  }
  return best?.id ?? null
}

/**
 * The user's preset named like the work if any, else the built-in preset for its type
 * (if that preset exists).
 */
export function suggestPreset(
  d: MediaDetails,
  available: readonly Candidate[]
): PresetSuggestion | null {
  const flavor = mediaFlavor(d)
  const byName = presetByName(d, available)
  if (byName) return { presetId: byName, flavor, source: 'name' }
  const presetId = PRESET_FOR[flavor]
  return available.some((p) => p.id === presetId) ? { presetId, flavor, source: 'flavor' } : null
}
