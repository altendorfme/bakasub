import { describe, expect, it } from 'vitest'
import { freePresetName, isPinned, pinTerm, pinTerms } from './glossary-pin'

describe('pinTerm', () => {
  it('appends a new entry', () => {
    expect(pinTerm([{ source: 'Simon', rule: 'keep' }], 'Bro', 'mano')).toEqual([
      { source: 'Simon', rule: 'keep' },
      { source: 'Bro', target: 'mano' }
    ])
  })

  it('replaces the target of the same term, keeping its rule', () => {
    expect(pinTerm([{ source: 'bro', target: 'irmão', rule: 'informal' }], 'Bro', 'mano')).toEqual([
      { source: 'bro', target: 'mano', rule: 'informal' }
    ])
  })
})

describe('isPinned', () => {
  it('matches term and target ignoring case', () => {
    const g = [{ source: 'Bro', target: 'Mano' }]
    expect(isPinned(g, 'bro', 'mano')).toBe(true)
    expect(isPinned(g, 'Bro', 'Bro')).toBe(false)
    expect(isPinned([{ source: 'Bro', rule: 'keep' }], 'Bro', 'mano')).toBe(false)
  })
})

describe('pinTerms', () => {
  it('pins every chosen term without duplicating', () => {
    expect(
      pinTerms(
        [{ source: 'bro', target: 'irmão' }],
        [
          { term: 'Bro', target: 'mano' },
          { term: 'Gunmen', target: 'Gunmen' }
        ]
      )
    ).toEqual([
      { source: 'bro', target: 'mano' },
      { source: 'Gunmen', target: 'Gunmen' }
    ])
  })
})

describe('freePresetName', () => {
  it('keeps a free name and numbers a taken one', () => {
    expect(freePresetName('Gurren Lagann', ['Anime'])).toBe('Gurren Lagann')
    expect(freePresetName('Gurren Lagann', ['gurren lagann', 'Gurren Lagann (2)'])).toBe(
      'Gurren Lagann (3)'
    )
  })
})
