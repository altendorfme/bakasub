import { describe, expect, it } from 'vitest'
import type { MediaDetails } from '@shared/ipc-contract'
import { mediaFlavor, suggestPreset, type PresetSuggestion } from './preset-suggestion'

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
      flavor: 'anime',
      source: 'flavor'
    })
    expect(suggestPreset(anime, [{ id: 'builtin:series' }])).toBeNull()
  })
})

interface TestPreset {
  id: string
  name: string
  builtin: boolean
  createdAt: string | null
}

describe('suggestPreset by name', () => {
  const mine = (id: string, name: string, createdAt = '2026-01-01T00:00:00Z'): TestPreset => ({
    id,
    name,
    builtin: false,
    createdAt
  })
  const builtin = (id: string, name: string): TestPreset => ({
    id,
    name,
    builtin: true,
    createdAt: null
  })
  const lib = [builtin('builtin:anime', 'Anime'), builtin('builtin:series', 'Series')]
  const anime = (patch: Partial<MediaDetails> = {}): MediaDetails =>
    d({ genreIds: [16], originalLanguage: 'ja', ...patch })
  const byName = (media: MediaDetails, presets: TestPreset[]): PresetSuggestion | null =>
    suggestPreset(media, [...lib, ...presets])

  it('exact match', () => {
    expect(byName(anime({ title: 'Gurren Lagann' }), [mine('u1', 'Gurren Lagann')])).toEqual({
      presetId: 'u1',
      flavor: 'anime',
      source: 'name'
    })
  })

  it('preset name contained in the title', () => {
    const r = byName(anime({ title: 'Gurren Lagann: Parallel Works' }), [
      mine('u1', 'Gurren Lagann')
    ])
    expect(r?.presetId).toBe('u1')
  })

  it('title contained in the preset name', () => {
    const r = byName(anime({ title: 'Gurren Lagann' }), [mine('u1', 'Gurren Lagann - Anime pt-BR')])
    expect(r?.presetId).toBe('u1')
  })

  it('ignores case, accents, punctuation, year and season', () => {
    expect(
      byName(anime({ title: 'Gurren Lagann (2007)' }), [mine('u1', 'gurren  lagann!')])?.presetId
    ).toBe('u1')
    expect(byName(anime({ title: 'Pokémon: Season 2' }), [mine('u1', 'POKEMON')])?.presetId).toBe(
      'u1'
    )
    expect(byName(anime({ title: 'Frieren S02' }), [mine('u1', 'Frieren')])?.presetId).toBe('u1')
  })

  it('matches the localized title and the original title', () => {
    const media = anime({ title: 'Ataque dos Titãs', originalTitle: 'Shingeki no Kyojin' })
    expect(byName(media, [mine('u1', 'Ataque dos Titas')])?.presetId).toBe('u1')
    expect(byName(media, [mine('u2', 'Shingeki no Kyojin')])?.presetId).toBe('u2')
  })

  it('the longest name wins; a tie goes to the most recent', () => {
    const media = anime({ title: 'Gurren Lagann Parallel Works' })
    expect(
      byName(media, [mine('a', 'Gurren Lagann'), mine('b', 'Gurren Lagann Parallel')])?.presetId
    ).toBe('b')
    expect(
      byName(media, [
        mine('old', 'Gurren Lagann', '2026-01-01T00:00:00Z'),
        mine('new', 'Gurren Lagann', '2026-06-01T00:00:00Z')
      ])?.presetId
    ).toBe('new')
  })

  it('names under 3 normalized characters never match', () => {
    expect(byName(anime({ title: 'Re:Zero' }), [mine('u1', 'Re')])?.presetId).toBe('builtin:anime')
    expect(byName(anime({ title: 'K' }), [mine('u1', 'K Project')])?.presetId).toBe('builtin:anime')
  })

  it('built-in presets never match by name', () => {
    const r = byName(anime({ title: 'Anime Gataris' }), [])
    expect(r).toEqual({ presetId: 'builtin:anime', flavor: 'anime', source: 'flavor' })
  })

  it('no match: falls back to the built-in for the type', () => {
    const r = byName(anime({ title: 'Naruto' }), [mine('u1', 'Bleach')])
    expect(r).toEqual({ presetId: 'builtin:anime', flavor: 'anime', source: 'flavor' })
  })
})
