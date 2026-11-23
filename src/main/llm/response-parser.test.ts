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
      extra: ['9'],
      truncated: false
    })
  })
  it('JSON inválido', () => {
    expect(parseTranslations('oops', [1])).toEqual({ ok: false, problem: 'no JSON object' })
  })

  // Respostas reais do Nemotron 3 Super (finish=length, 2026-11-23), texto anonimizado.
  describe('JSON truncado', () => {
    it('par completo antes do corte (sem a chave final) é recuperado', () => {
      const r = parseTranslations('{"344":"Isso é uma frase completa!"', [344])
      expect(r).toEqual({
        ok: true,
        values: new Map([[344, 'Isso é uma frase completa!']]),
        missing: [],
        extra: [],
        truncated: true
      })
    })
    it('linhas completas anteriores são aceitas; a cortada fica pendente', () => {
      const content = '{\n  "95": "Primeira linha.",\n  "96": "Com \\"aspas\\" e \\n",\n  "97": "E'
      const r = parseTranslations(content, [95, 96, 97, 98])
      expect(r).toEqual({
        ok: true,
        values: new Map([
          [95, 'Primeira linha.'],
          [96, 'Com "aspas" e \n']
        ]),
        missing: [97, 98],
        extra: [],
        truncated: true
      })
    })
    it.each([['{"96": "E'], ['{"198":'], ['{"333":"']])(
      'sem nenhum par completo (%s) falha com o problema descrito',
      (content) => {
        expect(parseTranslations(content, [96])).toEqual({
          ok: false,
          problem: 'malformed or truncated JSON with no complete entry'
        })
      }
    )
  })

  it('conteúdo vazio (raciocínio gastou a saída) tem problema próprio', () => {
    expect(parseTranslations('', [1])).toEqual({ ok: false, problem: 'empty content' })
    expect(parseTranslations('  \n', [1])).toEqual({ ok: false, problem: 'empty content' })
  })

  describe('formatos não suportados', () => {
    it('array de objetos falha descrevendo o array', () => {
      expect(parseTranslations('[{"id":1,"text":"a"}]', [1])).toEqual({
        ok: false,
        problem: 'top-level JSON array (expected an object)'
      })
      expect(parseTranslations('```json\n[{"id":1,"text":"a"}]\n```', [1])).toEqual({
        ok: false,
        problem: 'top-level JSON array (expected an object)'
      })
    })
    it('objeto embrulhado: ids esperados viram missing e a chave vai para extra', () => {
      expect(parseTranslations('{"translations":{"1":"a"}}', [1])).toEqual({
        ok: true,
        values: new Map(),
        missing: [1],
        extra: ['translations'],
        truncated: false
      })
    })
  })
})
