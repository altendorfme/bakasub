import { describe, expect, it } from 'vitest'
import { pairMux } from './mux-pairing'
import type { ScannedFile } from './scan-files'

const f = (path: string): ScannedFile => ({
  path: `/lib/${path}`,
  size: 1,
  relPath: path,
  relDir: ''
})
const pair = (videos: string[], subs: string[]): ReturnType<typeof pairMux> =>
  pairMux(videos.map(f), subs.map(f))
const rel = (p: { relPath: string }): string => p.relPath

describe('pairMux: regra 1 (nome-base)', () => {
  it('ignora sufixos de idioma e flags; idioma vem do sufixo, `und` sem sufixo', () => {
    const r = pair(
      ['Show.S01E01.mkv'],
      ['Show.S01E01.pt-BR.srt', 'Show.S01E01.en.forced.ass', 'Show.S01E01.ssa']
    )
    expect(r.items).toHaveLength(1)
    expect(r.items[0].subtitles.map((s) => [s.relPath, s.language, s.matchedBy])).toEqual([
      ['Show.S01E01.pt-BR.srt', 'pt-BR', 'name'],
      ['Show.S01E01.en.forced.ass', 'en', 'name'],
      ['Show.S01E01.ssa', 'und', 'name']
    ])
    expect(r.unmatchedSubtitles).toEqual([])
    expect(r.unmatchedVideos).toEqual([])
  })

  it('comparação sem diferenciar maiúsculas; pastas diferentes não pareiam por nome', () => {
    const r = pair(['a/Ep1.mkv', 'b/Ep1.mkv'], ['a/ep1.EN.srt'])
    expect(r.items.map((i) => rel(i.video))).toEqual(['a/Ep1.mkv'])
    expect(r.unmatchedVideos.map(rel)).toEqual(['b/Ep1.mkv'])
  })

  it('Subs/Subtitles do vídeo conta como a pasta dele', () => {
    const r = pair(['s/ep1.mkv', 's/ep2.mkv'], ['s/Subs/ep1.en.srt', 's/Subtitles/ep2.pt-BR.srt'])
    expect(r.items.map((i) => i.subtitles.length)).toEqual([1, 1])
  })

  it('dois vídeos com o mesmo nome-base (ambíguo) deixam a legenda sem par', () => {
    const r = pair(['x/ep1.mkv', 'x/ep1.MKV'], ['x/ep1.en.srt'])
    expect(r.items).toEqual([])
    expect(r.unmatchedSubtitles.map(rel)).toEqual(['x/ep1.en.srt'])
    expect(r.unmatchedVideos).toHaveLength(2)
  })
})

describe('pairMux: regra 2 (temporada/episódio)', () => {
  it('SxxExx com nomes diferentes na mesma pasta', () => {
    const r = pair(
      ['Show.S01E02.1080p.WEB-DL.mkv', 'Show.S01E03.1080p.WEB-DL.mkv'],
      ['Show - 1x03 [Fansub].pt-BR.srt']
    )
    expect(r.items.map((i) => [rel(i.video), i.subtitles[0].matchedBy])).toEqual([
      ['Show.S01E03.1080p.WEB-DL.mkv', 'episode']
    ])
    expect(r.unmatchedVideos.map(rel)).toEqual(['Show.S01E02.1080p.WEB-DL.mkv'])
  })

  it('anime com numeração absoluta `Show - 28`', () => {
    const r = pair(
      ['[Grp] Show - 27 [1080p].mkv', '[Grp] Show - 28 [1080p].mkv'],
      ['Show - 28.en.ass', 'Show - 29.en.ass']
    )
    expect(r.items.map((i) => rel(i.video))).toEqual(['[Grp] Show - 28 [1080p].mkv'])
    expect(r.unmatchedSubtitles.map(rel)).toEqual(['Show - 29.en.ass'])
  })

  it('ambiguidade: dois vídeos com o mesmo episódio nunca são resolvidos sozinhos', () => {
    const r = pair(['Show.S01E01.720p.mkv', 'Show.S01E01.1080p.mkv'], ['Legenda S01E01.pt-BR.srt'])
    expect(r.items).toEqual([])
    expect(r.unmatchedSubtitles.map(rel)).toEqual(['Legenda S01E01.pt-BR.srt'])
  })

  it('o nome igual (regra 1) vence o episódio; outra pasta não pareia por episódio', () => {
    const r = pair(
      ['d/Show.S01E01.mkv', 'd/Other.S01E01.mkv', 'e/Show.S01E02.mkv'],
      ['d/Other.S01E01.en.srt', 'd/Show.S01E02.en.srt']
    )
    expect(r.items.map((i) => rel(i.video))).toEqual(['d/Other.S01E01.mkv'])
    expect(r.unmatchedSubtitles.map(rel)).toEqual(['d/Show.S01E02.en.srt'])
  })

  it('legenda sem número de episódio nem nome igual é órfã', () => {
    const r = pair(['ep1.mkv'], ['random.en.srt'])
    expect(r.items).toEqual([])
    expect(r.unmatchedSubtitles.map(rel)).toEqual(['random.en.srt'])
    expect(r.unmatchedVideos.map(rel)).toEqual(['ep1.mkv'])
  })
})

describe('pairMux: limite', () => {
  it('mais de 32 legendas para o mesmo vídeo: o excedente fica sem par', () => {
    const langs =
      'en pt es fr de it ja ko zh ru ar tr pl nl sv da fi no cs el he hu id th vi uk ro bg hr sk sl lt lv'
        .split(' ')
        .slice(0, 32)
    const r = pair(['ep1.mkv'], ['ep1.srt', ...langs.map((l) => `ep1.${l}.srt`)])
    expect(r.items[0].subtitles).toHaveLength(32)
    expect(r.unmatchedSubtitles).toHaveLength(1)
  })
})
