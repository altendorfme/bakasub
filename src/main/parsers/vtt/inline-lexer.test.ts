import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import { br, nodesRaw, tag, text } from '../core/nodes'
import { escapeVttText, lexVttInline, voiceOf } from './inline-lexer'

/** Nó de texto original do VTT: sempre com `raw`. */
const vt = (value: string, raw = value): ReturnType<typeof text> => text(value, raw)

describe('lexVttInline', () => {
  it('reconhece as tags de formatação do WebVTT', () => {
    expect(lexVttInline('<i>a</i> <c.yellow.bg_blue>b</c> <lang en>c</lang>')).toEqual([
      tag('<i>', 'i', 'open'),
      vt('a'),
      tag('</i>', 'i', 'close'),
      vt(' '),
      tag('<c.yellow.bg_blue>', 'c', 'open'),
      vt('b'),
      tag('</c>', 'c', 'close'),
      vt(' '),
      tag('<lang en>', 'lang', 'open'),
      vt('c'),
      tag('</lang>', 'lang', 'close')
    ])
  })

  it('ruby/rt e voz são tags; timestamps internos são marcadores soltos', () => {
    expect(lexVttInline('<v Bob>Oi <00:00:01.500>tudo')).toEqual([
      tag('<v Bob>', 'v', 'open'),
      vt('Oi '),
      tag('<00:00:01.500>', 'timestamp', 'override'),
      vt('tudo')
    ])
    expect(lexVttInline('<ruby>漢<rt>kan</rt></ruby>').map((n) => n.type)).toEqual([
      'tag',
      'text',
      'tag',
      'text',
      'tag',
      'tag'
    ])
  })

  it('o que não é tag conhecida continua texto', () => {
    expect(lexVttInline('a <3 b <Nome> <br>')).toEqual([vt('a <3 b <Nome> <br>')])
  })

  it('quebra de linha vira br com o EOL real', () => {
    expect(lexVttInline('a\r\nb')).toEqual([vt('a'), br('\r\n'), vt('b')])
  })

  it('decodifica entidades no `value` e guarda o original no `raw`', () => {
    expect(lexVttInline('Tom &amp; Jerry &lt;3 &#233;&#x41;&nbsp;&lrm;')).toEqual([
      vt('Tom & Jerry <3 éA\u00a0\u200e', 'Tom &amp; Jerry &lt;3 &#233;&#x41;&nbsp;&lrm;')
    ])
  })

  it('entidade desconhecida ou sem `;` fica literal', () => {
    expect(lexVttInline('a &foo; b & c')).toEqual([vt('a &foo; b & c')])
  })

  it('round-trip: a concatenação dos raw reproduz a entrada', () => {
    const piece = fc.constantFrom(
      'a',
      ' ',
      '&amp;',
      '&lt;',
      '&',
      '<i>',
      '</i>',
      '<v Ana>',
      '<c.x>',
      '</c>',
      '<00:01.000>',
      '\n',
      '\r\n',
      '<',
      '>',
      'é'
    )
    fc.assert(
      fc.property(fc.array(piece, { maxLength: 30 }), (parts) => {
        const s = parts.join('')
        const nodes = lexVttInline(s)
        expect(nodesRaw(nodes)).toBe(s)
        for (let k = 1; k < nodes.length; k++)
          expect(nodes[k - 1].type === 'text' && nodes[k].type === 'text').toBe(false)
      })
    )
  })
})

describe('escapeVttText', () => {
  it('escapa &, <, > e os caracteres invisíveis decodificados', () => {
    expect(escapeVttText('a & b <c> --> \u00a0\u200e\u200f')).toBe(
      'a &amp; b &lt;c&gt; --&gt; &nbsp;&lrm;&rlm;'
    )
  })

  it('escapar o value decodificado devolve um texto que o lexer lê igual', () => {
    const v = 'Tom & Jerry <3 > fim\u00a0'
    expect(lexVttInline(escapeVttText(v))).toEqual([vt(v, escapeVttText(v))])
  })
})

describe('voiceOf', () => {
  it('extrai o falante da primeira tag <v>, com ou sem classes', () => {
    expect(voiceOf(lexVttInline('<v Bob>oi'))).toBe('Bob')
    expect(voiceOf(lexVttInline('<v.loud Mary Jane>oi</v>'))).toBe('Mary Jane')
    expect(voiceOf(lexVttInline('<v>oi'))).toBeUndefined()
    expect(voiceOf(lexVttInline('oi'))).toBeUndefined()
  })
})
