import { describe, expect, it } from 'vitest'
import type { TermVariation } from '@shared/ipc-contract'
import { addNewTerms, freePresetName, inGlossary, splitByGlossary } from './glossary-pin'

describe('inGlossary', () => {
  it('matches the term ignoring case and spaces, with a target or only a rule', () => {
    expect(inGlossary([{ source: ' bro ', target: 'mano' }], 'Bro')).toBe(true)
    expect(inGlossary([{ source: 'Simon', rule: 'keep' }], 'simon')).toBe(true)
    expect(inGlossary([{ source: 'Simon', target: 'Simon' }], 'Simon')).toBe(true)
    expect(inGlossary([{ source: 'Simon' }], 'Bro')).toBe(false)
  })
})

describe('splitByGlossary', () => {
  const term = (name: string, glossaryTarget?: string): TermVariation => ({
    term: name,
    cues: 3,
    unmatched: 0,
    variants: [],
    ...(glossaryTarget ? { glossaryTarget } : {})
  })

  it('suggests only terms without an entry; warns about pinned terms the model varied', () => {
    const r = splitByGlossary(
      [term('Bro', 'mano'), term('Simon'), term('Kamina'), term('Shire', 'Condado')],
      [
        { source: 'bro', target: 'mano' },
        { source: 'Simon', rule: 'keep' }
      ]
    )
    expect(r.suggestions.map((t) => t.term)).toEqual(['Kamina', 'Shire'])
    expect(r.ignored.map((t) => t.term)).toEqual(['Bro'])
  })
})

describe('addNewTerms', () => {
  it('appends only terms without an entry, never overwriting or duplicating', () => {
    expect(
      addNewTerms(
        [
          { source: 'bro', target: 'irmão', rule: 'informal' },
          { source: 'Simon', rule: 'keep' }
        ],
        [
          { term: 'Bro', target: 'mano' },
          { term: 'simon', target: 'Simão' },
          { term: 'Gunmen', target: 'Gunmen' },
          { term: 'gunmen', target: 'Gunmens' }
        ]
      )
    ).toEqual([
      { source: 'bro', target: 'irmão', rule: 'informal' },
      { source: 'Simon', rule: 'keep' },
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
