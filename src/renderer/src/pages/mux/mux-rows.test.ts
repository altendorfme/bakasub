import { describe, expect, it } from 'vitest'
import { addRows, buildMuxRequest, muxReady, setDefaultRow } from './mux-rows'

describe('mux rows', () => {
  it('guesses the language from the suffix; the first one is the default; no duplicates', () => {
    let rows = addRows([], ['/s/ep01.pt-BR.ass', '/s/ep01.srt'])
    expect(rows.map((r) => [r.language, r.guessed, r.isDefault])).toEqual([
      ['pt-BR', true, true],
      ['', false, false]
    ])
    rows = addRows(rows, ['/s/ep01.pt-BR.ass', '/s/ep01.es.ass'])
    expect(rows).toHaveLength(3)
    expect(muxReady('/v.mkv', rows)).toBe(false)
  })

  it('one default at most; toggling it off leaves none', () => {
    const rows = addRows([], ['/a.en.srt', '/b.es.srt'])
    expect(setDefaultRow(rows, '/b.es.srt').map((r) => r.isDefault)).toEqual([false, true])
    expect(setDefaultRow(rows, '/a.en.srt').map((r) => r.isDefault)).toEqual([false, false])
  })

  it('request: names only when typed, default flag only on the default', () => {
    const rows = addRows([], ['/a.en.srt', '/b.es.srt']).map((r, i) =>
      i === 1 ? { ...r, name: ' Español ' } : r
    )
    expect(
      buildMuxRequest('/v.mkv', rows, {
        outputDir: null,
        setDefault: true,
        keepOriginalSubtitles: false
      })
    ).toEqual({
      kind: 'mux',
      source: '/v.mkv',
      subtitles: [
        { path: '/a.en.srt', language: 'en', default: true },
        { path: '/b.es.srt', language: 'es', name: 'Español' }
      ],
      options: { setDefault: true, keepOriginalSubtitles: false }
    })
  })
})
