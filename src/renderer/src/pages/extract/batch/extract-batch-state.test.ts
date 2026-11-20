import { describe, expect, it } from 'vitest'
import type { BatchPlan, Job, SubtitleTrackInfo } from '@shared/ipc-contract'
import { extractCounts } from './extract-batch-progress'
import {
  EXTRACT_BATCH_STEPS,
  buildExtractRequest,
  buildRows,
  extractBatchReducer,
  extractCanGo,
  extractStepValid,
  failedItem,
  initialExtractBatch,
  signatureChoices,
  signatureEdits
} from './extract-batch-state'

const track = (
  id: number,
  name: string,
  format: 'ass' | 'srt' | null = 'ass',
  language = 'en'
): SubtitleTrackInfo => ({
  id,
  codecId: 'x',
  format,
  language,
  name,
  default: false,
  forced: false
})

const plan: BatchPlan = {
  kind: 'extract',
  root: '/a',
  rejected: [],
  truncated: false,
  items: [
    {
      path: '/a/s01.mkv',
      relPath: 's01.mkv',
      tracks: [track(2, 'Full'), track(3, 'Signs'), track(4, 'PGS', null)],
      selected: [2, 3]
    },
    {
      // Ids differ between releases; the signature is the same.
      path: '/a/s02.mkv',
      relPath: 's02.mkv',
      tracks: [track(5, 'Signs'), track(4, 'Full'), track(6, 'Full pt', 'ass', 'pt-BR')],
      selected: [4, 5, 6]
    },
    { path: '/a/nc.mkv', relPath: 'nc.mkv', tracks: [], selected: [], skipped: 'no-subtitle-track' }
  ]
}

describe('extract batch rows', () => {
  it('default: every supported track; skipped files are out and cannot come back', () => {
    const rows = buildRows(plan, { '/a/nc.mkv': { include: true } })
    expect(rows.map((r) => [r.include, r.trackIds])).toEqual([
      [true, [2, 3]],
      [true, [4, 5, 6]],
      [false, []]
    ])
  })

  it('edits override the selection; image tracks and unknown ids are dropped', () => {
    const rows = buildRows(plan, { '/a/s01.mkv': { trackIds: [2, 4, 99] } })
    expect(rows[0].trackIds).toEqual([2])
  })

  it('signature choices count the included files, most common first', () => {
    const rows = buildRows(plan, {})
    expect(signatureChoices(rows).map((c) => [c.track.name, c.files, c.selected])).toEqual([
      ['Full', 2, 2],
      ['Signs', 2, 2],
      ['Full pt', 1, 1]
    ])
  })

  it('unselecting a signature removes it from every file, matching by signature not id', () => {
    const rows = buildRows(plan, {})
    const sig = signatureChoices(rows).find((c) => c.track.name === 'Signs')!.signature
    const next = buildRows(plan, signatureEdits(rows, sig, false))
    expect(next.map((r) => r.trackIds)).toEqual([[2], [4, 6], []])
    // And back on.
    const back = buildRows(plan, signatureEdits(next, sig, true))
    expect(back.map((r) => r.trackIds)).toEqual([[2, 3], [4, 5, 6], []])
  })

  it('files left out do not count in the signatures', () => {
    const rows = buildRows(plan, { '/a/s02.mkv': { include: false } })
    expect(signatureChoices(rows).map((c) => c.files)).toEqual([1, 1])
  })
})

describe('extract batch validation', () => {
  it('needs an included file; an included file without tracks blocks Tracks', () => {
    expect(extractStepValid('files', null)).toBe(false)
    expect(extractStepValid('files', buildRows(plan, {}))).toBe(true)
    const none = buildRows(plan, { '/a/s01.mkv': { trackIds: [] } })
    expect(extractStepValid('tracks', none)).toBe(false)
    expect(extractStepValid('files', none)).toBe(true)
    // Leaving the file out unblocks.
    const out = buildRows(plan, {
      '/a/s01.mkv': { trackIds: [], include: false }
    })
    expect(extractStepValid('tracks', out)).toBe(true)
    expect(extractStepValid('output', null)).toBe(true)
  })

  it('forward only to a reached step with everything before it valid', () => {
    const s = { ...initialExtractBatch, step: 'files' as const, furthest: 1 }
    expect(extractCanGo(s, 'tracks', () => true)).toBe(true)
    expect(extractCanGo(s, 'output', () => true)).toBe(true)
    expect(extractCanGo(s, 'output', (x) => x !== 'tracks')).toBe(false)
    expect(extractCanGo({ ...s, furthest: 0 }, 'output', () => true)).toBe(false)
    expect(extractCanGo({ ...s, step: 'output', furthest: 2 }, 'files', () => false)).toBe(true)
  })
})

describe('extract batch reducer', () => {
  it('a new source clears the edits but keeps the output folder', () => {
    let s = extractBatchReducer(initialExtractBatch, { type: 'outputDir', dir: '/out' })
    s = extractBatchReducer(s, { type: 'edit', edits: { '/a/x.mkv': { include: false } } })
    s = extractBatchReducer(s, { type: 'go', step: 'tracks' })
    expect(s.furthest).toBe(1)
    s = extractBatchReducer(s, { type: 'source', source: { type: 'files', paths: ['/b.mkv'] } })
    expect(s).toMatchObject({ step: 'files', furthest: 0, edits: {}, outputDir: '/out' })
    expect(extractBatchReducer(s, { type: 'reset' })).toBe(initialExtractBatch)
  })

  it('edits merge per file', () => {
    let s = extractBatchReducer(initialExtractBatch, {
      type: 'edit',
      edits: { '/a': { trackIds: [1] } }
    })
    s = extractBatchReducer(s, { type: 'edit', edits: { '/a': { include: false } } })
    expect(s.edits['/a']).toEqual({ trackIds: [1], include: false })
    expect(EXTRACT_BATCH_STEPS).toEqual(['files', 'tracks', 'output'])
  })
})

describe('extract batch request', () => {
  it('included files in plan order with their tracks; root and outputDir only when set', () => {
    const rows = buildRows(plan, { '/a/s01.mkv': { trackIds: [3] } })
    expect(buildExtractRequest(plan, rows, null)).toEqual({
      kind: 'extract',
      root: '/a',
      items: [
        { path: '/a/s01.mkv', trackIds: [3] },
        { path: '/a/s02.mkv', trackIds: [4, 5, 6] }
      ]
    })
    expect(buildExtractRequest({ ...plan, root: null }, rows, '/out')).toMatchObject({
      root: null,
      outputDir: '/out'
    })
  })

  it('"item N: …" points at the Nth included file (0-based)', () => {
    const rows = buildRows(plan, { '/a/s01.mkv': { include: false } })
    expect(failedItem('item 0: file not found', rows)?.row.item.path).toBe('/a/s02.mkv')
    expect(failedItem('item 0: file not found', rows)?.reason).toBe('file not found')
    expect(failedItem('item 5: x', rows)).toBeNull()
    expect(failedItem('boom', rows)).toBeNull()
  })
})

describe('extract counts', () => {
  const job = (status: Job['status']): Job => ({ status }) as Job
  it('groups statuses', () => {
    expect(
      extractCounts([
        job('queued'),
        job('running'),
        job('completed'),
        job('completed-with-warnings'),
        job('failed'),
        job('cancelled')
      ])
    ).toEqual({ queued: 1, running: 1, done: 2, failed: 2 })
  })
})
