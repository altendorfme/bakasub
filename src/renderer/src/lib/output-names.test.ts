import { describe, expect, it } from 'vitest'
import {
  extractedNames,
  outputFolder,
  repeatedLanguages,
  stemOf,
  translateOutputNames
} from './output-names'

describe('output names (preview of the Main naming)', () => {
  it('drops a language suffix already in the name', () => {
    expect(stemOf('/v/ep01.mkv')).toBe('ep01')
    expect(stemOf('/v/ep01.en.ass')).toBe('ep01')
    expect(stemOf('/v/Show.S01E01.1080p.WEB.mkv')).toBe('Show.S01E01.1080p.WEB')
  })

  it('translation: mkv, subtitle or both', () => {
    expect(translateOutputNames('/v/Ep.mkv', 'pt-BR', 'ass', 'mux')).toEqual(['Ep.pt-BR.mkv'])
    expect(translateOutputNames('/v/Ep.mkv', 'pt-BR', 'ass', 'subtitle')).toEqual(['Ep.pt-BR.ass'])
    expect(translateOutputNames('/v/Ep.mkv', 'pt-BR', 'ass', 'both')).toEqual([
      'Ep.pt-BR.mkv',
      'Ep.pt-BR.ass'
    ])
  })

  it('extraction: player names number repeated languages, track names carry the id', () => {
    const tracks = [
      { id: 3, language: 'en', format: 'ass' },
      { id: 4, language: 'en', format: 'srt' },
      { id: 5, language: 'pt-BR', format: 'ass' },
      { id: 6, format: 'srt' }
    ]
    expect(extractedNames('/v/Ep.mkv', tracks, 'player')).toEqual([
      'Ep.en.1.ass',
      'Ep.en.2.srt',
      'Ep.pt-BR.ass',
      'Ep.und.srt'
    ])
    expect(extractedNames('/v/Ep.mkv', tracks.slice(2, 3), 'track')).toEqual(['Ep.5.pt-BR.ass'])
    expect(repeatedLanguages(tracks)).toEqual(['en'])
  })

  it('folder: the chosen one, else the source folder', () => {
    expect(outputFolder('/v/Ep.mkv', '/out')).toBe('/out')
    expect(outputFolder('/v/Ep.mkv', null)).toBe('/v')
  })
})
