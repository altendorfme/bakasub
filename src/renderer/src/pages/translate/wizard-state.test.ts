import { describe, expect, it } from 'vitest'
import type { SubtitleTrackInfo } from '@shared/ipc-contract'
import {
  buildJobRequest,
  canContinue,
  initialWizard,
  pickTrack,
  stepsFor,
  wizardReducer,
  type WizardAction,
  type WizardState
} from './wizard-state'

const run = (...actions: WizardAction[]): WizardState =>
  actions.reduce(wizardReducer, initialWizard)

const track = (id: number, over: Partial<SubtitleTrackInfo> = {}): SubtitleTrackInfo => ({
  id,
  codecId: 'S_TEXT/ASS',
  format: 'ass',
  default: false,
  forced: false,
  ...over
})

describe('wizard', () => {
  it('a subtitle file skips the track step', () => {
    expect(stepsFor('subtitle')).toEqual(['file', 'preset', 'output'])
    const s = run({ type: 'file', path: '/a/ep01.en.srt' }, { type: 'next' })
    expect(s.step).toBe('preset')
    expect(s.file).toEqual({ path: '/a/ep01.en.srt', name: 'ep01.en.srt', kind: 'subtitle' })
  })

  it('a video goes through the track step and needs a track to continue', () => {
    let s = run({ type: 'file', path: 'C:\\v\\ep01.mkv' }, { type: 'next' })
    expect(s.step).toBe('track')
    expect(wizardReducer(s, { type: 'next' }).step).toBe('track')
    s = wizardReducer(s, { type: 'track', trackId: 3 })
    expect(wizardReducer(s, { type: 'next' }).step).toBe('preset')
  })

  it('unsupported files are ignored; a new file resets the track', () => {
    expect(run({ type: 'file', path: '/a/x.mp4' }).file).toBeNull()
    const s = run(
      { type: 'file', path: '/a/1.mkv' },
      { type: 'track', trackId: 2 },
      { type: 'file', path: '/a/2.mkv' }
    )
    expect(s.trackId).toBeNull()
  })

  it('preset step: model and language may come from the defaults; notes are capped', () => {
    const s = run({ type: 'file', path: '/a/x.srt' }, { type: 'next' })
    expect(canContinue(s)).toBe(false)
    expect(canContinue(s, { model: 'a/b', targetLang: 'pt-BR' })).toBe(true)
    const long = wizardReducer(s, { type: 'set', patch: { notes: 'x'.repeat(4001) } })
    expect(canContinue(long, { model: 'a/b', targetLang: 'pt-BR' })).toBe(false)
  })

  it('builds translate and pipeline requests, leaving defaults to the Main', () => {
    expect(
      buildJobRequest(
        run({ type: 'file', path: '/a/x.srt' }, { type: 'set', patch: { notes: '  hi ' } })
      )
    ).toEqual({ kind: 'translate', source: '/a/x.srt', notes: 'hi', confirmBeforeTranslate: true })
    expect(
      buildJobRequest(
        run(
          { type: 'file', path: '/a/x.mkv' },
          { type: 'track', trackId: 4 },
          { type: 'set', patch: { model: 'a/b', targetLang: 'es', outputDir: '/out' } },
          { type: 'mux', patch: { setDefault: false } }
        )
      )
    ).toEqual({
      kind: 'pipeline',
      source: '/a/x.mkv',
      trackId: 4,
      model: 'a/b',
      targetLang: 'es',
      outputDir: '/out',
      confirmBeforeTranslate: true,
      options: { setDefault: false, keepOriginalSubtitles: true, alsoWriteSubtitle: false }
    })
  })
})

describe('pickTrack', () => {
  it('prefers the preferred language, full over forced, and skips unsupported tracks', () => {
    const tracks = [
      track(1, { format: null, unsupported: 'image-based', language: 'en' }),
      track(2, { language: 'en', forced: true }),
      track(3, { language: 'en' }),
      track(4, { language: 'ja' })
    ]
    expect(pickTrack(tracks, ['en'])).toBe(3)
    expect(pickTrack(tracks, ['ja', 'en'])).toBe(4)
    expect(pickTrack(tracks, ['fr'])).toBe(3)
    expect(pickTrack([track(1, { format: null })], ['en'])).toBeNull()
  })
})

describe('next on the preset step', () => {
  it('advances with the defaults from Settings', () => {
    const s = run({ type: 'file', path: '/a/x.srt' }, { type: 'next' })
    expect(wizardReducer(s, { type: 'next' }).step).toBe('preset')
    expect(
      wizardReducer(s, { type: 'next', defaults: { model: 'a/b', targetLang: 'pt-BR' } }).step
    ).toBe('output')
  })
})

const mediaOf = (s: WizardState): unknown => (buildJobRequest(s) as { media?: unknown }).media

describe('media in the request', () => {
  const series = { provider: 'tmdb' as const, id: 7, kind: 'series' as const }
  it('sent only when included; the episode only for a series with both numbers', () => {
    const base = run({ type: 'file', path: '/a/x.srt' })
    const withMedia = wizardReducer(base, {
      type: 'media',
      patch: { ref: series, season: 1, episode: 5 }
    })
    expect(buildJobRequest(withMedia)).toMatchObject({
      media: { ref: series, season: 1, episode: 5 }
    })
    expect(mediaOf(wizardReducer(withMedia, { type: 'media', patch: { episode: null } }))).toEqual({
      ref: series
    })
    expect(
      buildJobRequest(wizardReducer(withMedia, { type: 'media', patch: { include: false } }))
    ).not.toHaveProperty('media')
    const movie = wizardReducer(withMedia, {
      type: 'media',
      patch: { ref: { ...series, kind: 'movie' } }
    })
    expect(mediaOf(movie)).toEqual({ ref: { ...series, kind: 'movie' } })
  })
  it('a new file clears the media choice', () => {
    const s = run(
      { type: 'file', path: '/a/x.srt' },
      { type: 'media', patch: { ref: series, seeded: true } },
      { type: 'file', path: '/a/y.srt' }
    )
    expect(s.media.ref).toBeNull()
    expect(s.media.seeded).toBe(false)
  })
})
