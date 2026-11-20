import { describe, expect, it } from 'vitest'
import type { MediaDetails } from '@shared/ipc-contract'
import { mediaFlavor, suggestPreset } from './preset-suggestion'

const d = (patch: Partial<MediaDetails>): MediaDetails => ({
  provider: 'tmdb',
  id: 1,
  kind: 'series',
  title: 'X',
  genres: [],
  synopsis: '',
  ...patch
})

describe('mediaFlavor', () => {
  it('Japanese animation is anime; other animation follows the kind', () => {
    expect(mediaFlavor(d({ genreIds: [16], originalLanguage: 'ja' }))).toBe('anime')
    expect(mediaFlavor(d({ genreIds: [16], originCountries: ['JP'] }))).toBe('anime')
    expect(mediaFlavor(d({ kind: 'movie', genreIds: [16], originalLanguage: 'ja' }))).toBe('anime')
    // Western animation (Avatar: The Last Airbender) is not anime.
    expect(
      mediaFlavor(d({ genreIds: [16], originalLanguage: 'en', originCountries: ['US'] }))
    ).toBe('series')
    // A Japanese live-action drama is not anime either.
    expect(mediaFlavor(d({ genreIds: [18], originalLanguage: 'ja' }))).toBe('series')
  })

  it('documentary, movie, series', () => {
    expect(mediaFlavor(d({ genreIds: [99] }))).toBe('documentary')
    expect(mediaFlavor(d({ kind: 'movie', genreIds: [28] }))).toBe('movie')
    expect(mediaFlavor(d({}))).toBe('series')
  })

  it('details cached before the ids existed: genre name + kana in the original title', () => {
    expect(mediaFlavor(d({ genres: ['Animation'], originalTitle: '天元突破グレンラガン' }))).toBe(
      'anime'
    )
    expect(mediaFlavor(d({ genres: ['Animation'], originalTitle: '大闹天宫' }))).toBe('series')
  })
})

describe('suggestPreset', () => {
  it('the built-in preset, only if it exists', () => {
    const anime = d({ genreIds: [16], originalLanguage: 'ja' })
    expect(suggestPreset(anime, [{ id: 'builtin:anime' }])).toEqual({
      presetId: 'builtin:anime',
      flavor: 'anime'
    })
    expect(suggestPreset(anime, [{ id: 'builtin:series' }])).toBeNull()
  })
})
