import { describe, expect, it } from 'vitest'
import { parseReleaseName } from './release-name'

describe('parseReleaseName', () => {
  it.each([
    ['Frieren.S01E05.1080p.BluRay.x264-GROUP.mkv', { title: 'Frieren', season: 1, episode: 5 }],
    [
      'Frieren.S01E05.Phantoms.of.the.Dead.1080p.WEB-DL.mkv',
      { title: 'Frieren', season: 1, episode: 5 }
    ],
    ['Dune.Part.Two.2024.2160p.WEB-DL.DDP5.1.Atmos.mkv', { title: 'Dune Part Two', year: 2024 }],
    [
      'Show.Name.2019.S02E10.720p.HDTV.x265.mkv',
      { title: 'Show Name', year: 2019, season: 2, episode: 10 }
    ],
    ['The.Office.US.S01E01.mkv', { title: 'The Office US', season: 1, episode: 1 }],
    ['Arrival (2016).srt', { title: 'Arrival', year: 2016 }],
    ['Blade.Runner.2049.2017.1080p.mkv', { title: 'Blade Runner 2049', year: 2017 }],
    ['2001.A.Space.Odyssey.1968.mkv', { title: '2001 A Space Odyssey', year: 1968 }],
    ['1917.2019.BluRay.mkv', { title: '1917', year: 2019 }],
    ['show_name_1x05_hdtv.mkv', { title: 'show name', season: 1, episode: 5 }],
    ['Cosmos.S01E01.mkv', { title: 'Cosmos', season: 1, episode: 1 }]
  ])('%s', (file, expected) => {
    expect(parseReleaseName(file)).toEqual(expected)
  })

  it('anime: fansub group, absolute episode number, CRC and quality in brackets', () => {
    expect(parseReleaseName('[SubsPlease] Sousou no Frieren - 28 (1080p) [ABCD1234].mkv')).toEqual({
      title: 'Sousou no Frieren',
      absoluteEpisode: 28
    })
    expect(parseReleaseName('[Group] Some Show - 05v2 [720p].mkv')).toEqual({
      title: 'Some Show',
      absoluteEpisode: 5
    })
  })

  it('subtitle files: the language (and forced/sdh) suffix is not part of the title', () => {
    expect(parseReleaseName('Frieren.S01E05.1080p.BluRay.x264-GROUP.en.ass')).toEqual({
      title: 'Frieren',
      season: 1,
      episode: 5
    })
    expect(parseReleaseName('Arrival.2016.pt-BR.forced.srt')).toEqual({
      title: 'Arrival',
      year: 2016
    })
    expect(parseReleaseName('Movie.Title.en.sdh.vtt')).toEqual({ title: 'Movie Title' })
  })

  it('full paths are reduced to the file name', () => {
    expect(parseReleaseName('/videos/Season 1/Frieren.S01E05.mkv')).toEqual({
      title: 'Frieren',
      season: 1,
      episode: 5
    })
    expect(parseReleaseName('C:\\Videos\\Arrival (2016).mkv')).toEqual({
      title: 'Arrival',
      year: 2016
    })
  })

  it('nothing recognizable: the cleaned name is the title', () => {
    expect(parseReleaseName('my home video.mkv')).toEqual({ title: 'my home video' })
  })
})
