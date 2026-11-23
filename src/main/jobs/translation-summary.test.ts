import { describe, expect, it } from 'vitest'
import { translationSummary } from './translation-summary'

describe('translationSummary', () => {
  it('model, preset and languages frozen in the spec', () => {
    expect(
      translationSummary({
        kind: 'pipeline',
        source: '/a.mkv',
        preset: {
          id: 'p1',
          name: 'Frieren',
          model: 'google/gemini-2.5-flash',
          prompt: 'long',
          glossary: []
        },
        targetLang: 'pt-BR',
        sourceLang: 'ja'
      })
    ).toEqual({
      model: 'google/gemini-2.5-flash',
      preset: { id: 'p1', name: 'Frieren' },
      targetLang: 'pt-BR',
      sourceLang: 'ja'
    })
  })

  it('omits what an old or malformed spec does not have', () => {
    expect(translationSummary({ kind: 'translate', source: '/a.srt' })).toEqual({})
    expect(
      translationSummary({ kind: 'translate', preset: { id: 'p1', model: 42 }, targetLang: '' })
    ).toEqual({})
    expect(translationSummary({ kind: 'translate', preset: null, targetLang: 'en' })).toEqual({
      targetLang: 'en'
    })
  })

  it('nothing for kinds that do not translate', () => {
    expect(translationSummary({ kind: 'extract', source: '/a.mkv' })).toBeUndefined()
    expect(translationSummary({ kind: 'mux', source: '/a.mkv' })).toBeUndefined()
    expect(translationSummary(null)).toBeUndefined()
  })
})
