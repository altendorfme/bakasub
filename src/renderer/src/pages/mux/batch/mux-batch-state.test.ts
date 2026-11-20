import { describe, expect, it } from 'vitest'
import type { BatchMuxPlan } from '@shared/ipc-contract'
import {
  MAX_SUBS_PER_VIDEO,
  MUX_BATCH_STEPS,
  buildMuxBatchRequest,
  buildView,
  failedItem,
  initialMuxBatch,
  muxBatchReducer,
  muxCanGo,
  muxStepValid,
  outputCollisions,
  type MuxBatchAction,
  type MuxBatchState
} from './mux-batch-state'

const file = (p: string): { path: string; relPath: string } => ({ path: `/s/${p}`, relPath: p })
const sub = (p: string, language = 'und'): { path: string; relPath: string; language: string } => ({
  ...file(p),
  language
})

const plan: BatchMuxPlan = {
  kind: 'mux',
  root: '/s',
  items: [
    {
      video: file('ep1.mkv'),
      subtitles: [
        { ...sub('ep1.pt-BR.srt', 'pt-BR'), matchedBy: 'name' },
        { ...sub('ep1.en.srt', 'en'), matchedBy: 'name' }
      ]
    },
    { video: file('ep2.mkv'), subtitles: [{ ...sub('ep2.srt'), matchedBy: 'episode' }] }
  ],
  unmatchedVideos: [file('ep3.mkv')],
  unmatchedSubtitles: [sub('extra.srt')],
  rejected: [],
  truncated: false
}

const run = (...actions: MuxBatchAction[]): MuxBatchState =>
  actions.reduce(muxBatchReducer, initialMuxBatch)

describe('mux batch view', () => {
  it('plan as is: pairs kept, first subtitle default, the unpaired ones listed', () => {
    const v = buildView(plan, initialMuxBatch)
    expect(v.rows.map((r) => [r.video.relPath, r.include, r.subs.length])).toEqual([
      ['ep1.mkv', true, 2],
      ['ep2.mkv', true, 1],
      ['ep3.mkv', false, 0]
    ])
    expect(v.rows[0].subs.map((s) => [s.language, s.isDefault])).toEqual([
      ['pt-BR', true],
      ['en', false]
    ])
    expect(v.rows[1].subs[0].matchedBy).toBe('episode')
    expect(v.unresolved.map((s) => s.relPath)).toEqual(['extra.srt'])
  })

  it('moving a subtitle: marked manual, kept in plan order; ignoring takes it out', () => {
    const v = buildView(
      plan,
      run(
        { type: 'assign', sub: '/s/ep1.en.srt', video: '/s/ep2.mkv' },
        { type: 'assign', sub: '/s/extra.srt', video: '/s/ep3.mkv' },
        { type: 'assign', sub: '/s/ep1.pt-BR.srt', video: null }
      )
    )
    expect(v.rows[0].subs.map((s) => s.file.relPath)).toEqual([])
    expect(v.rows[0].include).toBe(false)
    expect(v.rows[1].subs.map((s) => [s.file.relPath, s.matchedBy])).toEqual([
      ['ep1.en.srt', 'manual'],
      ['ep2.srt', 'episode']
    ])
    expect(v.rows[2].include).toBe(true)
    expect(v.unresolved).toEqual([])
    expect(v.ignored.map((s) => s.relPath)).toEqual(['ep1.pt-BR.srt'])
  })

  it('restoring an edit goes back to what the plan said', () => {
    const v = buildView(
      plan,
      run(
        { type: 'assign', sub: '/s/ep1.en.srt', video: null },
        { type: 'assign', sub: '/s/ep1.en.srt', video: undefined }
      )
    )
    expect(v.rows[0].subs).toHaveLength(2)
  })

  it('language, name and default are per subtitle; the default is one per video', () => {
    const s = run(
      { type: 'sub', path: '/s/ep2.srt', patch: { language: 'ja', name: ' Raw ' } },
      { type: 'default', video: '/s/ep1.mkv', sub: '/s/ep1.en.srt' }
    )
    const v = buildView(plan, s)
    expect(v.rows[0].subs.map((x) => x.isDefault)).toEqual([false, true])
    expect(v.rows[1].subs[0]).toMatchObject({ language: 'ja', name: ' Raw ' })
    const none = buildView(plan, run({ type: 'default', video: '/s/ep1.mkv', sub: null }))
    expect(none.rows[0].subs.some((x) => x.isDefault)).toBe(false)
  })

  it('a video can be left out and brought back', () => {
    const off = run({ type: 'include', video: '/s/ep2.mkv', include: false })
    expect(buildView(plan, off).rows[1].include).toBe(false)
    expect(
      buildView(plan, muxBatchReducer(off, { type: 'include', video: '/s/ep2.mkv', include: true }))
        .rows[1].include
    ).toBe(true)
  })
})

describe('mux batch validation', () => {
  const solved = run({ type: 'assign', sub: '/s/extra.srt', video: '/s/ep3.mkv' })

  it('a subtitle without a video blocks Pairing until assigned or ignored', () => {
    expect(muxStepValid('files', buildView(plan, initialMuxBatch))).toBe(true)
    expect(muxStepValid('pairing', buildView(plan, initialMuxBatch))).toBe(false)
    expect(muxStepValid('pairing', buildView(plan, solved))).toBe(true)
    const ignored = run({ type: 'assign', sub: '/s/extra.srt', video: null })
    expect(muxStepValid('pairing', buildView(plan, ignored))).toBe(true)
  })

  it('needs at least one video to create; no plan blocks everything', () => {
    const none = run(
      { type: 'assign', sub: '/s/extra.srt', video: null },
      { type: 'include', video: '/s/ep1.mkv', include: false },
      { type: 'include', video: '/s/ep2.mkv', include: false }
    )
    expect(muxStepValid('pairing', buildView(plan, none))).toBe(false)
    expect(muxStepValid('files', null)).toBe(false)
    const empty: BatchMuxPlan = { ...plan, items: [], unmatchedSubtitles: [], unmatchedVideos: [] }
    expect(muxStepValid('files', buildView(empty, initialMuxBatch))).toBe(false)
  })

  it('more than 32 subtitles for one video blocks', () => {
    const many: BatchMuxPlan = {
      ...plan,
      unmatchedSubtitles: Array.from({ length: MAX_SUBS_PER_VIDEO }, (_, i) => sub(`x${i}.srt`))
    }
    const s = many.unmatchedSubtitles.reduce<MuxBatchState>(
      (acc, x) => muxBatchReducer(acc, { type: 'assign', sub: x.path, video: '/s/ep1.mkv' }),
      initialMuxBatch
    )
    expect(muxStepValid('pairing', buildView(many, s))).toBe(false)
  })

  it('forward only to a reached step with everything before it valid', () => {
    const at = (step: (typeof MUX_BATCH_STEPS)[number], furthest: number): MuxBatchState => ({
      ...initialMuxBatch,
      step,
      furthest
    })
    const valid = (s: string): boolean => s !== 'pairing'
    expect(muxCanGo(at('files', 0), 'pairing', valid)).toBe(true)
    expect(muxCanGo(at('files', 0), 'output', valid)).toBe(false)
    expect(muxCanGo(at('pairing', 1), 'output', valid)).toBe(false)
    expect(muxCanGo(at('output', 2), 'files', valid)).toBe(true)
  })
})

describe('mux batch reducer', () => {
  it('a new source clears the edits but keeps options and output folder', () => {
    const s = run(
      { type: 'options', patch: { keepOriginalSubtitles: false } },
      { type: 'outputDir', dir: '/out' },
      { type: 'assign', sub: '/s/a.srt', video: null },
      { type: 'go', step: 'pairing' },
      { type: 'source', source: { type: 'folder', path: '/other' } }
    )
    expect(s).toMatchObject({
      step: 'files',
      assign: {},
      outputDir: '/out',
      options: { setDefault: true, keepOriginalSubtitles: false }
    })
  })
})

describe('mux batch request', () => {
  it('included videos in plan order; names only when typed; default only on the default', () => {
    const s = run(
      { type: 'assign', sub: '/s/extra.srt', video: '/s/ep3.mkv' },
      { type: 'sub', path: '/s/ep1.en.srt', patch: { name: ' English ' } },
      { type: 'include', video: '/s/ep2.mkv', include: false },
      { type: 'outputDir', dir: '/out' }
    )
    const v = buildView(plan, s)
    expect(buildMuxBatchRequest(plan, v.rows, s)).toEqual({
      kind: 'mux',
      root: '/s',
      items: [
        {
          video: '/s/ep1.mkv',
          subtitles: [
            { path: '/s/ep1.pt-BR.srt', language: 'pt-BR', default: true },
            { path: '/s/ep1.en.srt', language: 'en', name: 'English' }
          ]
        },
        {
          video: '/s/ep3.mkv',
          subtitles: [{ path: '/s/extra.srt', language: 'und', default: true }]
        }
      ],
      outputDir: '/out',
      options: { setDefault: true, keepOriginalSubtitles: true }
    })
  })

  it('"item N: …" points at the Nth included video and the subtitle the reason names', () => {
    const s = run({ type: 'include', video: '/s/ep1.mkv', include: false })
    const rows = buildView(plan, s).rows
    const hit = failedItem('item 0: bad subtitle /s/ep2.srt: empty', rows)
    expect(hit?.row.video.relPath).toBe('ep2.mkv')
    expect(hit?.sub).toBe('/s/ep2.srt')
    expect(failedItem('item 5: x', rows)).toBeNull()
    expect(failedItem('nope', rows)).toBeNull()
  })
})

describe('output collisions', () => {
  it('only with an output folder; mirrors the structure for a folder, flat for loose files', () => {
    const rows = buildView(
      {
        ...plan,
        items: [
          {
            video: { path: '/s/a/ep1.mkv', relPath: 'a/ep1.mkv' },
            subtitles: plan.items[0].subtitles
          },
          {
            video: { path: '/s/b/ep1.mkv', relPath: 'b/ep1.mkv' },
            subtitles: plan.items[1].subtitles
          }
        ]
      },
      initialMuxBatch
    ).rows
    expect(outputCollisions(rows, '/s', null)).toEqual([])
    expect(outputCollisions(rows, '/s', '/out')).toEqual([])
    expect(outputCollisions(rows, null, '/out')).toEqual(['ep1.mkv'])
  })
})
