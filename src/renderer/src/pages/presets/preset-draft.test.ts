import { describe, expect, it } from 'vitest'
import { draftOf, emptyDraft, isValid, toInput, validateDraft } from './preset-draft'

describe('preset draft', () => {
  it('requires a name, a media type and a temperature from 0 to 2', () => {
    expect(validateDraft(emptyDraft)).toEqual({ name: 'required' })
    expect(validateDraft({ ...emptyDraft, name: 'X', temperature: '2.5' })).toEqual({
      temperature: 'range'
    })
    expect(validateDraft({ ...emptyDraft, name: 'X', mediaType: ' ' })).toEqual({
      mediaType: 'required'
    })
  })

  it('glossary rows need a source and a target or a rule', () => {
    const e = validateDraft({
      ...emptyDraft,
      name: 'X',
      glossary: [
        { source: 'Frieren', target: '', rule: '' },
        { source: '', target: 'x', rule: '' },
        { source: 'san', target: '', rule: 'keep honorifics' }
      ]
    })
    expect(e.glossary).toEqual({ 0: 'targetOrRule', 1: 'source' })
  })

  it('round-trips a preset and trims, dropping empty optional fields', () => {
    const input = toInput({
      ...draftOf({
        id: 'c1',
        builtin: false,
        name: ' Anime ',
        mediaType: 'anime',
        temperature: 0.3,
        prompt: 'Keep it casual. ',
        glossary: [{ source: 'Himmel', target: 'Himmel' }],
        copiedFrom: null,
        createdAt: null
      })
    })
    expect(input).toEqual({
      name: 'Anime',
      mediaType: 'anime',
      temperature: 0.3,
      prompt: 'Keep it casual.',
      glossary: [{ source: 'Himmel', target: 'Himmel' }]
    })
    expect(
      isValid(
        validateDraft(
          draftOf({ ...input, id: 'x', builtin: false, copiedFrom: null, createdAt: null })
        )
      )
    ).toBe(true)
  })
})
