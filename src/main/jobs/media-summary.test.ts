import { describe, expect, it } from 'vitest'
import { mediaSummary } from './media-summary'

describe('mediaSummary', () => {
  it('title, artwork and episode from the frozen media context', () => {
    expect(
      mediaSummary({
        source: '/a.mkv',
        media: {
          details: {
            provider: 'tmdb',
            id: 7,
            kind: 'series',
            title: 'Frieren',
            year: 2023,
            genres: [],
            synopsis: 'long text',
            backdropUrl: 'bakasub-media://tmdb/w1280/b.jpg'
          },
          episode: { season: 1, episode: 5, title: 'Phantoms', synopsis: 'x' }
        }
      })
    ).toEqual({
      title: 'Frieren',
      kind: 'series',
      year: 2023,
      backdropUrl: 'bakasub-media://tmdb/w1280/b.jpg',
      episode: { season: 1, episode: 5, title: 'Phantoms' }
    })
  })
  it('nothing without media context', () => {
    expect(mediaSummary({ source: '/a.srt' })).toBeUndefined()
    expect(mediaSummary(null)).toBeUndefined()
  })
})
