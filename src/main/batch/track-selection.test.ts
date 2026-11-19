import { describe, expect, it } from 'vitest'
import type { SubtitleTrack } from '../media/mkv-probe'
import { selectExtractTracks, selectTranslationTrack } from './track-selection'

const t = (id: number, over: Partial<SubtitleTrack> = {}): SubtitleTrack => ({
  id,
  codecId: 'S_TEXT/ASS',
  format: 'ass',
  default: false,
  forced: false,
  ...over
})

describe('selectTranslationTrack', () => {
  const prefs = ['en']
  it('idioma preferido antes de tudo', () => {
    const r = selectTranslationTrack(
      [t(2, { language: 'ja' }), t(3, { language: 'en', format: 'srt' })],
      prefs
    )
    expect(r).toEqual({ trackId: 3 })
  })
  it('ordem da lista de preferência; variante regional casa com a primária', () => {
    const r = selectTranslationTrack(
      [t(2, { language: 'es' }), t(3, { language: 'en-US' })],
      ['pt', 'en', 'es']
    )
    expect(r).toEqual({ trackId: 3 })
  })
  it('ASS antes de SRT; não forced; descarta sign/song/karaoke; mais eventos', () => {
    const tracks = [
      t(2, { language: 'en', format: 'srt', codecId: 'S_TEXT/UTF8', eventCount: 900 }),
      t(3, { language: 'en', name: 'Signs & Songs', eventCount: 50 }),
      t(4, { language: 'en', forced: true, eventCount: 30 }),
      t(5, { language: 'en', eventCount: 400 }),
      t(6, { language: 'en', eventCount: 500 })
    ]
    expect(selectTranslationTrack(tracks, prefs)).toEqual({ trackId: 6 })
  })
  it('placas só como último recurso', () => {
    expect(selectTranslationTrack([t(3, { language: 'en', name: 'Karaoke' })], prefs)).toEqual({
      trackId: 3
    })
  })
  it('nenhuma suportada => motivo', () => {
    expect(
      selectTranslationTrack(
        [t(2, { format: null, unsupported: 'image-based', codecId: 'S_HDMV/PGS' })],
        prefs
      )
    ).toEqual({ reason: 'no-supported-track' })
    expect(selectTranslationTrack([], prefs)).toEqual({ reason: 'no-subtitle-track' })
  })
  it('sem idioma preferido disponível ainda escolhe a melhor', () => {
    expect(selectTranslationTrack([t(2, { language: 'ja' }), t(3)], prefs)).toEqual({ trackId: 2 })
  })
})

describe('selectExtractTracks', () => {
  it('todas as faixas de texto suportadas, em ordem', () => {
    expect(
      selectExtractTracks([
        t(4),
        t(2, { format: null, unsupported: 'image-based' }),
        t(3, { format: 'srt' })
      ])
    ).toEqual({ trackIds: [3, 4] })
  })
  it('nenhuma => motivo', () => {
    expect(selectExtractTracks([t(2, { format: null, unsupported: 'no-parser' })])).toEqual({
      reason: 'no-supported-track'
    })
  })
})
