import { describe, expect, it } from 'vitest'
import { guessSubtitleLanguage } from './subtitle-lang'

describe('guessSubtitleLanguage', () => {
  it.each([
    ['/a/ep01.pt-BR.ass', 'pt-BR'],
    ['C:\\subs\\Show.S01E01.en.forced.srt', 'en'],
    ['ep01.PT-br.srt', 'pt-BR'],
    ['movie.zh-Hant.sdh.vtt', 'zh-Hant'],
    ['ep01.ass', null],
    ['Show.S01E01.1080p.srt', null],
    ['Show.Name.2024.srt', null],
    ['Dr.Who.srt', null]
  ])('%s -> %s', (path, lang) => {
    expect(guessSubtitleLanguage(path)).toBe(lang)
  })
})
