import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import { srtFormat } from '../srt'
import { analyzeCoverage } from './coverage'
import { toTranslationUnit } from './segmentation/segmenter'
import type { Cue } from './types'

const T1 = '00:00:01,000 --> 00:00:02,000'
const T2 = '00:00:03,000 --> 00:00:04,000'
const T3 = '00:00:05,000 --> 00:00:06,000'

const doc = srtFormat.parse(
  `1\n${T1}\nOlá\n\n2\n${T2}\n♪♪\n\n3\n${T3}\ntexto <g1> quebrado\n\ncontinuação solta\nem duas linhas\n\n88\n\n4\n00:00:07,000 --> x\nlixo\n\n5\n00:00:08,000 --> 00:00:09,000\n- Oi\n- Tchau\n`
)

describe('analyzeCoverage', () => {
  const report = analyzeCoverage(doc)

  it('totais e motivos', () => {
    expect(report.totals).toEqual({
      cues: 4,
      blocks: 3,
      translatable: 2,
      skipped: 2,
      untranslated: 3
    })
    expect(report.byReason).toEqual({
      SKIPPED_NO_LETTERS: 1,
      SKIPPED_EMPTY_BLOCK: 1,
      UNTRANSLATED_MARKER_COLLISION: 1,
      UNTRANSLATED_ORPHAN_TEXT: 1,
      UNTRANSLATED_BAD_TIMING: 1
    })
    expect(report.truncated).toBe(false)
  })

  it('untranslated vem antes de skipped, na ordem do documento', () => {
    expect(report.entries.map((e) => `${e.status}:${e.reason}`)).toEqual([
      'untranslated:UNTRANSLATED_MARKER_COLLISION',
      'untranslated:UNTRANSLATED_ORPHAN_TEXT',
      'untranslated:UNTRANSLATED_BAD_TIMING',
      'skipped:SKIPPED_NO_LETTERS',
      'skipped:SKIPPED_EMPTY_BLOCK'
    ])
  })

  it('severidade: skipped = info, untranslated = warn', () => {
    expect(
      report.entries.every((e) => e.severity === (e.status === 'skipped' ? 'info' : 'warn'))
    ).toBe(true)
  })

  it('cue com colisão: localização, timecodes, causa e parâmetros', () => {
    const e = report.entries[0]
    expect(e).toMatchObject({
      ref: { kind: 'cue', cueId: 3 },
      params: { marker: '<g1>' },
      location: { line: 9, endLine: 11, startMs: 5000, endMs: 6000 },
      cause: 'SEG_MARKER_COLLISION',
      outcome: 'kept-original',
      actions: ['edit-raw', 'ignore'],
      excerpt: 'texto <g1> quebrado'
    })
  })

  it('bloco órfão: linhas, excerpt com quebras visíveis e referência por blockIndex', () => {
    const e = report.entries[1]
    expect(e).toMatchObject({
      ref: { kind: 'block', blockIndex: 3 },
      location: { line: 13, endLine: 14 },
      excerpt: 'continuação solta ⏎ em duas linhas',
      cause: 'SRT_UNPARSEABLE_BLOCK'
    })
    expect(e.location.startMs).toBeUndefined()
  })

  it('cue só com símbolos é info e só admite "ignore"', () => {
    expect(report.entries[3]).toMatchObject({
      reason: 'SKIPPED_NO_LETTERS',
      severity: 'info',
      actions: ['ignore']
    })
  })

  it('outcome reflete a opção de exportação dos blocos não parseados', () => {
    const dropped = analyzeCoverage(doc, { unparsed: 'drop' })
    const blocks = dropped.entries.filter((e) => e.ref.kind === 'block')
    expect(blocks.length).toBeGreaterThan(0)
    expect(blocks.every((e) => e.outcome === 'omitted')).toBe(true)
    expect(
      dropped.entries
        .filter((e) => e.ref.kind === 'cue')
        .every((e) => e.outcome === 'kept-original')
    ).toBe(true)
  })

  it('maxEntries corta a lista mas não os totais, mantendo os warn primeiro', () => {
    const r = analyzeCoverage(doc, { maxEntries: 2 })
    expect(r.entries).toHaveLength(2)
    expect(r.entries.every((e) => e.status === 'untranslated')).toBe(true)
    expect(r.truncated).toBe(true)
    expect(r.totals).toEqual(report.totals)
  })

  it('excerpt é truncado em 120 caracteres e mostra controles', () => {
    const long = srtFormat.parse(`1\n${T1}\n${'a'.repeat(300)} <g1>\n`)
    const e = analyzeCoverage(long).entries[0]
    expect([...e.excerpt]).toHaveLength(120)
    expect(e.excerpt.endsWith('…')).toBe(true)
    const ctrl = srtFormat.parse(`1\n${T1}\nA\u0007B <g1>\n`)
    expect(analyzeCoverage(ctrl).entries[0].excerpt).toContain('␇')
  })

  it('documento sem problemas: nenhuma entrada', () => {
    const ok = analyzeCoverage(srtFormat.parse(`1\n${T1}\nOlá\n\n2\n${T2}\nMundo\n`))
    expect(ok).toMatchObject({
      entries: [],
      truncated: false,
      totals: { translatable: 2, skipped: 0, untranslated: 0 }
    })
  })
})

describe('classificador único (Q15)', () => {
  const lineGen = fc.constantFrom(
    '1',
    T1,
    T2,
    '00:00:01,000 --> lixo',
    'Olá',
    '♪♪',
    '...',
    '<i>t</i>',
    '{\\an8}',
    'a <g1> b',
    '<br/>',
    '',
    'solto',
    '77',
    '- Oi'
  )
  const input = fc.array(lineGen, { maxLength: 30 }).map((l) => l.join('\n'))

  it('translatable do relatório == cues para os quais o segmentador gera unidade', () => {
    fc.assert(
      fc.property(input, (src) => {
        let d
        try {
          d = srtFormat.parse(src)
        } catch {
          return true
        }
        const withUnit = d.items.filter(
          (i): i is Cue<unknown> => i.kind === 'cue' && toTranslationUnit(i) !== null
        ).length
        const r = analyzeCoverage(d, { maxEntries: 10_000 })
        return (
          r.totals.translatable === withUnit &&
          r.totals.translatable + r.totals.skipped + r.totals.untranslated ===
            r.totals.cues + r.totals.blocks &&
          r.entries.length === r.totals.skipped + r.totals.untranslated
        )
      }),
      { numRuns: 500 }
    )
  })
})
