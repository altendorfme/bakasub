import { describe, expect, it } from 'vitest'
import type { BatchPlan, MediaIdentification, SubtitleTrackInfo } from '@shared/ipc-contract'
import {
  applyEdits,
  majorityTrack,
  seedRows,
  trackChoices,
  trackEdits,
  trackSignature
} from './batch-rows'
import {
  batchCanGo,
  batchStepValid,
  batchSteps,
  batchWizardReducer,
  buildBatchRequest,
  groupingOf,
  initialBatchWizard,
  rowProblems
} from './batch-state'
import { autoGroup, mergeWork, moveFile, patchWork, rowsOf } from './works'

const track = (
  id: number,
  name: string,
  format: 'ass' | 'srt' | null = 'ass'
): SubtitleTrackInfo => ({
  id,
  codecId: 'x',
  format,
  language: 'en',
  name,
  default: false,
  forced: false
})
const full = [track(2, 'Full'), track(3, 'Signs')]

const plan: BatchPlan = {
  kind: 'pipeline',
  root: '/a',
  rejected: [],
  truncated: false,
  items: [
    { path: '/a/s01.mkv', relPath: 's01.mkv', tracks: full, selected: [2] },
    // Track ids differ, same signature as the others' "Full".
    {
      path: '/a/s02.mkv',
      relPath: 's02.mkv',
      tracks: [track(5, 'Signs'), track(4, 'Full')],
      selected: [5]
    },
    {
      path: '/a/movie.mkv',
      relPath: 'movie.mkv',
      tracks: [track(2, 'English', 'srt')],
      selected: [2]
    },
    { path: '/a/nc.mkv', relPath: 'nc.mkv', tracks: [], selected: [], skipped: 'no-subtitle-track' }
  ]
}

const id = (
  title: string,
  match: { id: number; kind: 'movie' | 'series' } | null,
  ep?: number
): MediaIdentification => ({
  release: { title, ...(ep ? { season: 1, episode: ep } : {}) },
  status: match ? 'matched' : 'not-found',
  match: match
    ? { provider: 'tmdb', ...match, title: `TMDB ${title}`, genres: [], synopsis: '' }
    : null,
  episode: null
})
const ids = [
  id('Show', { id: 7, kind: 'series' }, 1),
  id('Show', { id: 7, kind: 'series' }, 2),
  id('Movie', { id: 9, kind: 'movie' }),
  id('NC', null)
]

describe('batch rows', () => {
  it('seeds from plan + identification; skipped files start out and cannot come back', () => {
    const rows = seedRows(plan, ids)
    expect(rows.map((r) => [r.include, r.trackId, r.title, r.season, r.episode])).toEqual([
      [true, 2, 'TMDB Show', 1, 1],
      [true, 5, 'TMDB Show', 1, 2],
      [true, 2, 'TMDB Movie', null, null],
      [false, null, 'NC', null, null]
    ])
    const edited = applyEdits(rows, {
      '/a/nc.mkv': { include: true },
      '/a/movie.mkv': { include: false }
    })
    expect(edited.map((r) => r.include)).toEqual([true, true, false, false])
  })

  it('tracks by signature: majority, choices and "use for all"', () => {
    const rows = seedRows(plan, ids).slice(0, 2)
    expect(majorityTrack(rows)).toBeDefined()
    expect(trackChoices(rows).map((c) => [c.track.name, c.count])).toEqual([
      ['Full', 2],
      ['Signs', 2]
    ])
    expect(trackEdits(rows, trackSignature(track(0, 'Full')))).toEqual({
      '/a/s01.mkv': { trackId: 2 },
      '/a/s02.mkv': { trackId: 4 }
    })
  })
})

describe('works', () => {
  const rows = seedRows(plan, ids)

  it('groups by TMDB match, else by title, in plan order', () => {
    const g = autoGroup(rows)
    // The skipped file belongs to no work.
    expect(g.works.map((w) => [w.id, w.name])).toEqual([
      ['tmdb:7', 'TMDB Show'],
      ['tmdb:9', 'TMDB Movie']
    ])
    expect(rowsOf(g, rows, 'tmdb:7')).toEqual([0, 1])
  })

  it('move to a new work, merge back; empty works disappear', () => {
    let g = moveFile(autoGroup(rows), rows[1], 'new')
    expect(g.works.map((w) => w.id)).toEqual(['tmdb:7', 'tmdb:9', 'manual:1'])
    expect(g.works[2]).toMatchObject({ name: 'TMDB Show', ref: null, manual: true })
    g = mergeWork(g, 'manual:1', 'tmdb:7')
    expect(g.works.map((w) => w.id)).toEqual(['tmdb:7', 'tmdb:9'])
    g = moveFile(g, rows[2], 'tmdb:7')
    expect(g.works.map((w) => w.id)).toEqual(['tmdb:7'])
  })

  it('problems: odd track in its work, missing episode in a series, blocking without a track', () => {
    const r = applyEdits(rows, { '/a/s01.mkv': { episode: null } })
    expect(rowProblems(autoGroup(r), r)).toEqual([
      'no-episode',
      'odd-track',
      null,
      'no-subtitle-track'
    ])
    const none = applyEdits(rows, { '/a/movie.mkv': { trackId: null } })
    expect(rowProblems(autoGroup(none), none)[2]).toBe('no-track')
  })
})

describe('batch wizard state', () => {
  it('steps: subtitle batches have no track step; a new source resets edits but keeps options', () => {
    expect(batchSteps('translate')).toEqual(['files', 'works', 'preset', 'output'])
    let s = batchWizardReducer(initialBatchWizard, { type: 'options', patch: { notes: 'n' } })
    s = batchWizardReducer(s, { type: 'edit', edits: { '/a/s01.mkv': { include: false } } })
    s = batchWizardReducer(s, { type: 'go', step: 'tracks', index: 1, draw: 0.5 })
    expect(s).toMatchObject({ step: 'tracks', furthest: 1, draw: 0.5 })
    s = batchWizardReducer(s, { type: 'source', source: { type: 'files', paths: ['/x.mkv'] } })
    expect(s).toMatchObject({ step: 'files', edits: {}, grouping: null, options: { notes: 'n' } })
  })

  it('validity and navigation', () => {
    const rows = seedRows(plan, ids)
    const ctx = {
      rows,
      grouping: autoGroup(rows),
      options: initialBatchWizard.options,
      defaults: { model: 'm', targetLang: 'pt-BR' }
    }
    expect(batchStepValid('tracks', ctx)).toBe(true)
    expect(
      batchStepValid('preset', { ...ctx, defaults: { model: null, targetLang: 'pt-BR' } })
    ).toBe(false)
    const noTrack = applyEdits(rows, { '/a/movie.mkv': { trackId: null } })
    expect(batchStepValid('tracks', { ...ctx, rows: noTrack })).toBe(false)
    const s = { ...initialBatchWizard, step: 'files' as const }
    expect(batchCanGo(s, batchSteps('pipeline'), 'tracks', () => true)).toBe(true)
    expect(batchCanGo(s, batchSteps('pipeline'), 'works', () => true)).toBe(false)
  })

  it('request: works become groups; customized ones carry their settings; series episodes', () => {
    const rows = applyEdits(seedRows(plan, ids), { '/a/s02.mkv': { trackId: 4 } })
    let g = autoGroup(rows)
    g = patchWork(g, 'tmdb:9', {
      custom: { presetId: 'p2', model: 'x/y', targetLang: 'es', notes: ' movie notes ' }
    })
    g = patchWork(g, 'tmdb:7', { includeMedia: true })
    const req = buildBatchRequest(plan, rows, g, {
      ...initialBatchWizard.options,
      presetId: 'p1',
      notes: 'batch'
    })
    expect(req).toEqual({
      kind: 'pipeline',
      root: '/a',
      items: [
        { path: '/a/s01.mkv', trackIds: [2], group: 0, season: 1, episode: 1 },
        { path: '/a/s02.mkv', trackIds: [4], group: 0, season: 1, episode: 2 },
        { path: '/a/movie.mkv', trackIds: [2], group: 1 }
      ],
      groups: [
        { name: 'TMDB Show', media: { provider: 'tmdb', id: 7, kind: 'series' } },
        {
          name: 'TMDB Movie',
          media: { provider: 'tmdb', id: 9, kind: 'movie' },
          presetId: 'p2',
          model: 'x/y',
          targetLang: 'es',
          notes: 'movie notes'
        }
      ],
      presetId: 'p1',
      notes: 'batch',
      options: { setDefault: true, keepOriginalSubtitles: true, alsoWriteSubtitle: false },
      confirmBeforeTranslate: true
    })
    // Media context off: no media and no episode numbers.
    const off = buildBatchRequest(
      plan,
      rows,
      patchWork(g, 'tmdb:7', { includeMedia: false }),
      initialBatchWizard.options
    )
    expect(off.groups?.[0]).toEqual({ name: 'TMDB Show' })
    expect(off.items[0]).toEqual({ path: '/a/s01.mkv', trackIds: [2], group: 0 })
    expect(groupingOf({ ...initialBatchWizard, grouping: g }, rows)).toBe(g)
  })
})
