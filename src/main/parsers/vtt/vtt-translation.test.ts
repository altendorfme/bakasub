import { describe, expect, it } from 'vitest'
import { analyzeCoverage, applyTranslation, classify, cuePlainText } from '..'
import type { Cue } from '../core/types'
import type { VttCueData } from './types'
import { vttFormat } from '.'

const doc = vttFormat.parse(
  'WEBVTT\n\n00:01.000 --> 00:02.000 align:start\n<v Bob><i>Tom &amp; Jerry</i> &lt;3\n'
)
const cue = doc.items[0] as Cue<VttCueData>

describe('VTT na segmentação', () => {
  it('o payload leva o texto decodificado; a voz fica no esqueleto', () => {
    const c = classify(cue)
    expect(c.status).toBe('translatable')
    if (c.status !== 'translatable') return
    expect(c.unit.payload).toBe('<g1>Tom & Jerry</g1> <3')
    expect(cuePlainText(cue)).toBe('Tom & Jerry <3')
  })

  it('a tradução volta escapada e com tags, timing e configurações intactos', () => {
    const c = classify(cue)
    if (c.status !== 'translatable') throw new Error('not translatable')
    const r = applyTranslation(cue, c.unit, '<g1>Tom & Jerry</g1> --> amo <3', vttFormat.lexInline)
    expect(r.ok).toBe(true)
    if (!r.ok) return
    const out = vttFormat.serializeRepaired({ ...doc, items: [r.cue] })
    expect(out.text).toBe(
      'WEBVTT\n\n00:01.000 --> 00:02.000 align:start\n<v Bob><i>Tom &amp; Jerry</i> --&gt; amo &lt;3\n'
    )
    expect(out.applied).toEqual([])
    expect(vttFormat.parse(out.text).diagnostics).toEqual([])
  })

  it('tag VTT inventada pelo LLM é rejeitada', () => {
    const c = classify(cue)
    if (c.status !== 'translatable') throw new Error('not translatable')
    const r = applyTranslation(cue, c.unit, '<g1>Tom</g1> <b>x</b>', vttFormat.lexInline)
    expect(r.ok).toBe(false)
  })

  it('cobertura: timestamps internos não bloqueiam a tradução', () => {
    const d = vttFormat.parse('WEBVTT\n\n00:01.000 --> 00:02.000\nUm <00:01.500>dois\n')
    expect(analyzeCoverage(d).entries ?? []).toEqual([])
  })
})
