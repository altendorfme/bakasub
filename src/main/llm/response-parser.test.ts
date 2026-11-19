import { describe, expect, it } from 'vitest'
import { extractJsonObject, parseTranslations } from './response-parser'

describe('extractJsonObject', () => {
  it('JSON puro', () => {
    expect(extractJsonObject('{"1":"a"}')).toEqual({ '1': 'a' })
  })
  it('cercas ```json e texto em volta', () => {
    expect(extractJsonObject('Claro!\n```json\n{"1": "a}b"}\n```\nPronto')).toEqual({ '1': 'a}b' })
  })
  it('primeiro objeto balanceado, ignorando chaves dentro de strings e escapes', () => {
    expect(extractJsonObject('x {"1":"a \\"{\\" b","2":"}"} y {"3":"z"}')).toEqual({
      '1': 'a "{" b',
      '2': '}'
    })
  })
  it('nada utilizável => null', () => {
    expect(extractJsonObject('sem json')).toBeNull()
    expect(extractJsonObject('{"1": "aberto')).toBeNull()
    expect(extractJsonObject('[1,2]')).toBeNull()
  })
})

describe('parseTranslations', () => {
  it('separa valores, ausentes e extras', () => {
    const r = parseTranslations('{"1":"a","2":5,"9":"x"}', [1, 2, 3])
    expect(r).toEqual({
      ok: true,
      values: new Map([[1, 'a']]),
      missing: [2, 3],
      extra: ['9']
    })
  })
  it('JSON inválido', () => {
    expect(parseTranslations('oops', [1])).toEqual({ ok: false })
  })
})
