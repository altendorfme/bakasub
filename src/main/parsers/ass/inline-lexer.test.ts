import { describe, expect, it } from 'vitest'
import { br, tag, text } from '../core/nodes'
import { nodesRaw } from '../core/nodes'
import { lexInline } from './inline-lexer'

describe('lexInline (ASS)', () => {
  it('override, texto e \\N', () => {
    expect(lexInline('{\\an8}Olá\\Nmundo')).toEqual([
      tag('{\\an8}', '', 'override'),
      text('Olá'),
      br('\\N'),
      text('mundo')
    ])
  })
  it('\\n minúsculo também quebra; \\h fica no texto', () => {
    expect(lexInline('a\\nb\\hc')).toEqual([text('a'), br('\\n'), text('b\\hc')])
  })
  it('qualquer {…} é tag, inclusive comentário sem barra', () => {
    expect(lexInline('{nota} x')).toEqual([tag('{nota}', '', 'override'), text(' x')])
  })
  it('bloco com uma tag booleana vira par; com mais de uma, override', () => {
    expect(lexInline('{\\i1}a{\\i0}')).toEqual([
      tag('{\\i1}', 'i', 'open'),
      text('a'),
      tag('{\\i0}', 'i', 'close')
    ])
    expect(lexInline('{\\i1\\b1}a')[0]).toEqual(tag('{\\i1\\b1}', '', 'override'))
    expect(lexInline('{\\b700}a')[0]).toEqual(tag('{\\b700}', '', 'override'))
  })
  it('{ sem } é texto', () => {
    expect(lexInline('a { b')).toEqual([text('a { b')])
  })
  it('reproduz a entrada exatamente', () => {
    const s = '{\\k20}Ka{\\k30}ra\\N{x}\\h{ y'
    expect(nodesRaw(lexInline(s))).toBe(s)
  })
})
