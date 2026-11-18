import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import { br, nodesRaw, tag, text } from '../core/nodes'
import { lexInline } from './inline-lexer'

describe('lexInline: texto e tags', () => {
  it('texto puro vira um único TextNode', () => {
    expect(lexInline('Olá, mundo!')).toEqual([text('Olá, mundo!')])
  })

  it('string vazia não gera nós', () => {
    expect(lexInline('')).toEqual([])
  })

  it('tags HTML-like abrem e fecham', () => {
    expect(lexInline('Olá <i>mundo</i>, tudo bem?')).toEqual([
      text('Olá '),
      tag('<i>', 'i', 'open'),
      text('mundo'),
      tag('</i>', 'i', 'close'),
      text(', tudo bem?')
    ])
  })

  it.each(['b', 'u', 's', 'c', 'v', 'lang', 'font'])('reconhece <%s>', (name) => {
    expect(lexInline(`<${name}>x</${name}>`)).toEqual([
      tag(`<${name}>`, name, 'open'),
      text('x'),
      tag(`</${name}>`, name, 'close')
    ])
  })

  it('atributos ficam no raw e o nome é normalizado para minúsculas', () => {
    expect(lexInline('<FONT color="#ff0000">x</FONT>')).toEqual([
      tag('<FONT color="#ff0000">', 'font', 'open'),
      text('x'),
      tag('</FONT>', 'font', 'close')
    ])
    expect(lexInline('<v Roger>Oi</v>')[0]).toEqual(tag('<v Roger>', 'v', 'open'))
    expect(lexInline('<c.yellow>x</c>')[0]).toEqual(tag('<c.yellow>', 'c', 'open'))
  })

  it('override ASS com barra invertida é tag', () => {
    expect(lexInline('{\\an8}Texto')).toEqual([tag('{\\an8}', '', 'override'), text('Texto')])
    expect(lexInline('{\\an8\\pos(10,20)}x')[0]).toEqual(tag('{\\an8\\pos(10,20)}', '', 'override'))
  })

  it('chaves sem barra invertida são texto (SDH: "{laughs}")', () => {
    expect(lexInline('{laughs} Oi')).toEqual([text('{laughs} Oi')])
  })
})

describe('lexInline: o que NÃO é tag', () => {
  it.each(['<3', 'a < b', 'b > a', '<Nome>', '<br>', '<img src="x">', '<i', '<i/>', '<>', '< i>'])(
    '%j permanece texto',
    (s) => {
      expect(lexInline(s)).toEqual([text(s)])
    }
  )

  it('entidades HTML ficam cruas', () => {
    expect(lexInline('Tom &amp; Jerry &lt;3 &nbsp;')).toEqual([
      text('Tom &amp; Jerry &lt;3 &nbsp;')
    ])
  })

  it('tag não fecha em outra linha', () => {
    expect(lexInline('<font\ncolor="red">')).toEqual([
      text('<font'),
      br('\n'),
      text('color="red">')
    ])
  })

  it('tags desbalanceadas não são corrigidas aqui', () => {
    expect(lexInline('<i>a</b>')).toEqual([
      tag('<i>', 'i', 'open'),
      text('a'),
      tag('</b>', 'b', 'close')
    ])
  })
})

describe('lexInline: quebras de linha', () => {
  it('preserva o EOL real de cada quebra', () => {
    expect(lexInline('a\nb\r\nc\rd')).toEqual([
      text('a'),
      br('\n'),
      text('b'),
      br('\r\n'),
      text('c'),
      br('\r'),
      text('d')
    ])
  })

  it('diálogo com travessões', () => {
    expect(lexInline('- Oi\n- Olá')).toEqual([text('- Oi'), br('\n'), text('- Olá')])
  })
})

describe('lexInline: propriedades', () => {
  const alphabet = fc.constantFrom(
    '<',
    '>',
    '/',
    'i',
    'b',
    'font',
    ' ',
    '{',
    '}',
    '\\',
    'an8',
    '\n',
    '\r',
    '\r\n',
    'x',
    '&',
    '=',
    '"',
    'é',
    '.',
    'c',
    'v'
  )
  const input = fc.array(alphabet, { maxLength: 40 }).map((p) => p.join(''))

  it('a concatenação dos raws reproduz a entrada', () => {
    fc.assert(fc.property(input, (s) => nodesRaw(lexInline(s)) === s))
  })

  it('nunca há TextNode vazio nem TextNodes adjacentes', () => {
    fc.assert(
      fc.property(input, (s) => {
        const nodes = lexInline(s)
        return nodes.every(
          (n, k) => n.type !== 'text' || (n.value !== '' && nodes[k + 1]?.type !== 'text')
        )
      })
    )
  })

  it('qualquer unicode arbitrário também fecha o round-trip', () => {
    fc.assert(fc.property(fc.string({ unit: 'binary' }), (s) => nodesRaw(lexInline(s)) === s))
  })
})
