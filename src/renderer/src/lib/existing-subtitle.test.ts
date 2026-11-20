import { describe, expect, it } from 'vitest'
import type { SubtitleTrackInfo } from '@shared/ipc-contract'
import { existingTarget } from './existing-subtitle'

const track = (id: number, language?: string): SubtitleTrackInfo => ({
  id,
  codecId: 'S_TEXT/ASS',
  format: 'ass',
  default: false,
  forced: false,
  ...(language ? { language } : {})
})

describe('existingTarget', () => {
  it('finds a track in the target language, whatever code mkvtoolnix used', () => {
    const tracks = [track(1, 'eng'), track(2, 'por')]
    expect(existingTarget('pt-BR', { path: '/v.mkv', kind: 'video', tracks })).toEqual({
      where: 'track',
      track: tracks[1]
    })
    expect(existingTarget('es', { path: '/v.mkv', kind: 'video', tracks })).toBeNull()
  })
  it('a subtitle file named for the target language', () => {
    expect(existingTarget('pt-BR', { path: '/s/ep01.pt.srt', kind: 'subtitle' })).toEqual({
      where: 'file'
    })
    expect(existingTarget('pt-BR', { path: '/s/ep01.en.srt', kind: 'subtitle' })).toBeNull()
    expect(existingTarget(null, { path: '/s/ep01.pt.srt', kind: 'subtitle' })).toBeNull()
  })
})
