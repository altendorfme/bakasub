import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import { srtFormat } from '../../srt'
import { tokenizePayload } from './payload-codec'
import { nodesRaw } from '../nodes'
import type { Cue } from '../types'
import { applyTranslation, validateTranslation } from './reinject'
import { toTranslationUnit } from './segmenter'

const lex = srtFormat.lexInline
const T = '00:00:01,000 --> 00:00:02,000'
const cueOf = (body: string): Cue<unknown> =>
  srtFormat.parse(`1\n${T}\n${body}\n`).items[0] as Cue<unknown>

function translate(
  body: string,
  translated: string
): {
  cue: Cue<unknown>
  unit: NonNullable<ReturnType<typeof toTranslationUnit>>
  result: ReturnType<typeof applyTranslation<unknown>>
} {
  const cue = cueOf(body)
  const unit = toTranslationUnit(cue)!
  return { cue, unit, result: applyTranslation(cue, unit, translated, lex) }
}
const issuesOf = (body: string, translated: string): string[] => {
  const r = translate(body, translated).result
  return r.ok ? [] : r.issues.map((i) => (i.id ? `${i.code}:${i.id}` : i.code))
}

describe('applyTranslation: sucesso', () => {
  it('tradução comum reaplica as tags originais', () => {
    const { result } = translate(
      '{\\an8}Olá <i>mundo</i>, tudo bem?',
      'Hello <g1>world</g1>, how are you?'
    )
    expect(result.ok && nodesRaw(result.cue.nodes)).toBe('{\\an8}Hello <i>world</i>, how are you?')
  })

  it('o modelo pode reordenar palavras e marcadores', () => {
    const { result } = translate('<i>A</i> e <b>B</b>', '<g2>B</g2> and <g1>A</g1>')
    expect(result.ok && nodesRaw(result.cue.nodes)).toBe('<b>B</b> and <i>A</i>')
  })

  it('tags de borda que envolvem o cue voltam intactas', () => {
    const { result } = translate('<i>Hello</i>', 'Olá')
    expect(result.ok && nodesRaw(result.cue.nodes)).toBe('<i>Olá</i>')
  })

  it('quebras de linha mantêm o EOL original de cada uma', () => {
    const cue = srtFormat.parse(`1\r\n${T}\r\n- Oi\r\n- Olá\r\n`).items[0] as Cue<unknown>
    const unit = toTranslationUnit(cue)!
    const r = applyTranslation(cue, unit, '- Hi<br/>- Hello', lex)
    expect(r.ok && nodesRaw(r.cue.nodes)).toBe('- Hi\r\n- Hello')
  })

  it('timecodes, leading, line e format não mudam', () => {
    const { cue, result } = translate('Olá', 'Hi')
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect({ ...result.cue, nodes: null }).toEqual({ ...cue, nodes: null })
    }
  })

  it('não faz trim: política de espaço é do chamador', () => {
    const { result } = translate('Olá', ' Hi ')
    expect(result.ok && nodesRaw(result.cue.nodes)).toBe(' Hi ')
  })

  it('texto com < > & e entidades na tradução passa como texto', () => {
    const { result } = translate('Tom &amp; Jerry', 'Tom &amp; Jerry <3 a < b')
    expect(result.ok && nodesRaw(result.cue.nodes)).toBe('Tom &amp; Jerry <3 a < b')
  })
})

describe('validação: o que é rejeitado', () => {
  const body = '<i>A</i> {\\i1}b{\\i0}\nlinha dois'
  // payload: <g1>A</g1> <x2/>b<br/>linha dois  (o {\i0} final fica no meio; ver abaixo)

  it('marcador ausente', () => {
    expect(issuesOf('Olá <i>mundo</i>', 'Hello world')).toEqual(['MISSING_MARKER:1'])
    expect(issuesOf('Olá {\\i1}mundo{\\i0} fim', 'Hello <x1/>world fim')).toEqual([
      'MISSING_MARKER:2'
    ])
  })

  it('marcador desconhecido', () => {
    expect(issuesOf('Olá <i>mundo</i>', '<g1>Hello</g1> <x9/>')).toEqual(['UNEXPECTED_MARKER:9'])
    expect(issuesOf('Olá <i>mundo</i>', '<g7>Hello</g7>')).toContain('UNEXPECTED_MARKER:7')
  })

  it('marcador duplicado', () => {
    expect(issuesOf('Olá {\\i1}mundo{\\i0} fim', '<x1/> a <x1/> b <x2/>')).toEqual([
      'DUPLICATE_MARKER:1'
    ])
  })

  it('fechamento sem abertura, cruzamento e ordem invertida', () => {
    expect(issuesOf('a <i>b</i> <b>c</b>', '</g1>x<g1> <g2>y</g2>')).toContain('BAD_NESTING:1')
    expect(issuesOf('a <i>b</i> <b>c</b>', '<g1>x<g2>y</g1></g2>')).toContain('BAD_NESTING:1')
  })

  it('contagem de <br/> divergente', () => {
    expect(issuesOf('- Oi\n- Olá', '- Hi - Hello')).toEqual(['BR_COUNT_MISMATCH'])
    expect(issuesOf('Oi', 'Hi<br/>there')).toEqual(['BR_COUNT_MISMATCH'])
  })

  it('quebra de linha crua na tradução', () => {
    expect(issuesOf('Olá', 'Hi\nthere')).toEqual(['RAW_NEWLINE'])
    expect(issuesOf('Olá', 'Hi\r\nthere')).toEqual(['RAW_NEWLINE'])
  })

  it('tags inventadas pelo modelo', () => {
    expect(issuesOf('Olá', '<i>Hi</i>')).toEqual(['INVENTED_TAG'])
    expect(issuesOf('Olá', '{\\an8}Hi')).toEqual(['INVENTED_TAG'])
  })

  it('tradução vazia', () => {
    expect(issuesOf('Olá', '')).toEqual(['EMPTY_TRANSLATION'])
    expect(issuesOf('Olá', '   ')).toEqual(['EMPTY_TRANSLATION'])
  })

  it('marcadores com sintaxe alterada contam como ausentes', () => {
    expect(issuesOf('Olá <i>mundo</i>', '<G1>Hello</G1>')).toEqual(['MISSING_MARKER:1'])
    expect(issuesOf('Olá <i>mundo</i>', '< g1>Hello</g1 >')).toEqual(['MISSING_MARKER:1'])
  })

  it('falha não devolve cue parcial', () => {
    const r = translate('Olá <i>mundo</i>', 'Hello').result
    expect(r.ok).toBe(false)
  })

  it('validateTranslation expõe as mesmas issues sem montar o cue', () => {
    const unit = toTranslationUnit(cueOf('Olá <i>mundo</i>'))!
    expect(validateTranslation(unit, 'Hello', lex)).toEqual([{ code: 'MISSING_MARKER', id: 1 }])
    expect(validateTranslation(unit, '<g1>Hello</g1>', lex)).toEqual([])
  })

  void body
})

describe('propriedades', () => {
  const piece = fc.constantFrom(
    'Olá',
    ' ',
    '- ',
    '<i>',
    '</i>',
    '<b>',
    '</b>',
    '{\\an8}',
    '{\\i1}',
    '\n',
    '\r\n',
    'mundo',
    '<font color="red">',
    '</font>',
    '♪',
    '1',
    '&amp;',
    '<3',
    'a < b',
    '{laughs}'
  )
  const body = fc.array(piece, { minLength: 1, maxLength: 14 }).map((p) => p.join(''))

  /** Corpos cujo cue é traduzível e passa pela lexer sem virar bloco não parseado. */
  const withUnit = (
    b: string,
    fn: (cue: Cue<unknown>, unit: NonNullable<ReturnType<typeof toTranslationUnit>>) => boolean
  ): boolean => {
    let cue: Cue<unknown>
    try {
      const item = srtFormat.parse(`1\n${T}\n${b}\n`).items[0]
      if (item.kind !== 'cue') return true
      cue = item
    } catch {
      return true
    }
    const unit = toTranslationUnit(cue)
    return unit ? fn(cue, unit) : true
  }

  it('identidade: traduzir com o próprio payload reproduz o cue', () => {
    fc.assert(
      fc.property(body, (b) =>
        withUnit(b, (cue, unit) => {
          const r = applyTranslation(cue, unit, unit.payload, srtFormat.lexInline)
          return (
            r.ok &&
            nodesRaw(r.cue.nodes) === nodesRaw(cue.nodes) &&
            JSON.stringify(r.cue.nodes) === JSON.stringify(cue.nodes)
          )
        })
      ),
      { numRuns: 600 }
    )
  })

  it('editar só o texto nunca altera tags, quebras, timecodes nem trivia', () => {
    const word = fc.constantFrom('X', 'tradução', 'a b', '日本', '1', ' x ')
    fc.assert(
      fc.property(body, word, (b, w) =>
        withUnit(b, (cue, unit) => {
          const edited = tokenizePayload(unit.payload)
            .map((t) =>
              t.t === 'text'
                ? w
                : t.t === 'open'
                  ? `<g${t.id}>`
                  : t.t === 'close'
                    ? `</g${t.id}>`
                    : t.t === 'x'
                      ? `<x${t.id}/>`
                      : '<br/>'
            )
            .join('')
          const r = applyTranslation(cue, unit, edited, srtFormat.lexInline)
          if (!r.ok) return false
          const nonText = (c: Cue<unknown>): string =>
            JSON.stringify(c.nodes.filter((n) => n.type !== 'text'))
          return (
            nonText(r.cue) === nonText(cue) &&
            r.cue.start === cue.start &&
            r.cue.end === cue.end &&
            r.cue.leading === cue.leading &&
            r.cue.format === cue.format &&
            r.cue.id === cue.id
          )
        })
      ),
      { numRuns: 600 }
    )
  })

  it('o payload nunca contém quebra de linha crua', () => {
    fc.assert(fc.property(body, (b) => withUnit(b, (_c, unit) => !/[\r\n]/.test(unit.payload))))
  })
})
