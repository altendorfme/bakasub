import { describe, expect, it } from 'vitest'
import { visibleRows, type SummaryRow } from './summary-rows'
import { initialWizard, stepsFor, wizardReducer, type WizardStep } from './wizard-state'

const rows = (trackValue: string | null): SummaryRow<WizardStep>[] => [
  { step: 'file', label: 'File', value: 'ep01.mkv' },
  { step: 'track', label: 'Track', value: trackValue },
  { step: 'preset', label: 'Preset', value: 'Series' },
  { step: 'preset', label: 'Media', value: null },
  { step: 'output', label: 'Output', value: 'Next to the source file' }
]
const labels = (r: { label: string }[]): string[] => r.map((x) => x.label)

describe('visibleRows', () => {
  it('keeps only the rows of reached steps that have a value', () => {
    const steps = stepsFor('video')
    expect(labels(visibleRows(rows(null), steps, 0))).toEqual(['File'])
    expect(labels(visibleRows(rows('English'), steps, 1))).toEqual(['File', 'Track'])
    expect(labels(visibleRows(rows('English'), steps, 2))).toEqual(['File', 'Track', 'Preset'])
    expect(labels(visibleRows(rows('English'), steps, 3))).toEqual([
      'File',
      'Track',
      'Preset',
      'Output'
    ])
  })

  it('leaves out the rows of a step the flow does not have (subtitle: no track)', () => {
    expect(labels(visibleRows(rows('English'), stepsFor('subtitle'), 2))).toEqual([
      'File',
      'Preset',
      'Output'
    ])
  })

  it('another file walks the steps again: only the file row is left', () => {
    let s = wizardReducer(initialWizard, { type: 'file', path: '/v/ep01.mkv' })
    s = wizardReducer(s, { type: 'track', trackId: 2 })
    const defaults = { model: 'a/b', targetLang: 'pt-BR' }
    for (let i = 0; i < 3; i++) s = wizardReducer(s, { type: 'next', defaults })
    expect(s.furthest).toBe(3)
    s = wizardReducer(s, { type: 'go', step: 'file' })
    expect(labels(visibleRows(rows('English'), stepsFor(s.file?.kind), s.furthest))).toHaveLength(4)
    s = wizardReducer(s, { type: 'file', path: '/v/ep02.mkv' })
    expect(s.trackId).toBeNull()
    expect(labels(visibleRows(rows(null), stepsFor(s.file?.kind), s.furthest))).toEqual(['File'])
  })
})
