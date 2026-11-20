import { describe, expect, it } from 'vitest'
import { srtFormat } from '../../parsers'
import { describeFailures } from './translate.step'

const doc = srtFormat.parse(
  '1\n00:00:01,000 --> 00:00:02,000\nHello\n\n2\n00:01:03,500 --> 00:01:04,000\nNot this <i>one</i>\nline two\n'
)
const cue = (i: number): number => {
  const item = doc.items.filter((x) => x.kind === 'cue')[i]
  if (item.kind !== 'cue') throw new Error('no cue')
  return item.id
}

describe('describeFailures', () => {
  it('adds the original excerpt and where the line is', () => {
    const out = describeFailures(doc, [
      { cueId: cue(1), reason: 'UNTRANSLATED_VALIDATION_FAILED', issues: [] }
    ])
    expect(out).toEqual([
      {
        cueId: cue(1),
        reason: 'UNTRANSLATED_VALIDATION_FAILED',
        excerpt: 'Not this <i>one</i> ⏎ line two',
        location: { line: 5, endLine: 8, startMs: 63_500, endMs: 64_000 }
      }
    ])
  })

  it('keeps a failure whose cue is unknown, without text', () => {
    expect(
      describeFailures(doc, [{ cueId: 999, reason: 'UNTRANSLATED_CONTENT_FILTERED', issues: [] }])
    ).toEqual([{ cueId: 999, reason: 'UNTRANSLATED_CONTENT_FILTERED' }])
    expect(describeFailures(doc, [])).toEqual([])
  })
})
