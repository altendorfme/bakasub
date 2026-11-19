import { describe, expect, it } from 'vitest'
import type { MediaContextLookup } from '../../shared/ipc-contract'
import { buildMediaContext } from './media-block'

const series: MediaContextLookup = {
  details: {
    provider: 'tmdb',
    id: 209867,
    kind: 'series',
    title: "Frieren: Beyond Journey's End",
    originalTitle: 'Sousou no Frieren',
    year: 2023,
    genres: ['Animation', 'Drama'],
    runtime: 24,
    synopsis: 'An elf mage outlives her party.',
    posterUrl: 'bakasub-media://tmdb/w342/p.jpg'
  },
  episode: {
    season: 1,
    episode: 5,
    title: 'Phantoms of the Dead',
    synopsis: 'Visions of the lost.'
  }
}

describe('buildMediaContext', () => {
  it('structured details, then the episode, then the user notes', () => {
    expect(buildMediaContext(series, '  Fern is formal; keep "Frieren-sama".  ')).toBe(
      [
        "Title: Frieren: Beyond Journey's End (2023), TV series",
        'Original title: Sousou no Frieren',
        'Genres: Animation, Drama',
        'Synopsis: An elf mage outlives her party.',
        'Episode S01E05 "Phantoms of the Dead": Visions of the lost.',
        '',
        'Notes from the user:',
        'Fern is formal; keep "Frieren-sama".'
      ].join('\n')
    )
  })

  it('movie without extras; artwork URLs never reach the prompt', () => {
    const text = buildMediaContext(
      {
        details: {
          provider: 'tmdb',
          id: 1,
          kind: 'movie',
          title: 'Arrival',
          genres: [],
          synopsis: '',
          backdropUrl: 'bakasub-media://tmdb/w1280/b.jpg'
        },
        episode: null
      },
      undefined
    )
    expect(text).toBe('Title: Arrival, movie')
    expect(text).not.toContain('bakasub-media')
  })

  it('episode without title or synopsis still says which episode', () => {
    expect(
      buildMediaContext({ ...series, episode: { season: 2, episode: 10, title: '' } }, undefined)
    ).toContain('Episode S02E10')
  })

  it('only notes, or nothing at all', () => {
    expect(buildMediaContext(null, 'Just notes')).toBe('Just notes')
    expect(buildMediaContext(null, '   ')).toBeUndefined()
    expect(buildMediaContext(null, undefined)).toBeUndefined()
  })
})
