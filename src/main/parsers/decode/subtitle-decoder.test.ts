import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import { analyzeEol } from './eol'
import { decodeSubtitle } from './subtitle-decoder'

const utf8 = (s: string): Uint8Array => new TextEncoder().encode(s)
const bytes = (...b: number[]): Uint8Array => Uint8Array.from(b)

describe('decodeSubtitle: BOM', () => {
  it('UTF-8 com BOM: remove o BOM e registra bom=true', () => {
    const r = decodeSubtitle(Uint8Array.from([0xef, 0xbb, 0xbf, ...utf8('1\nOlá')]))
    expect(r.text).toBe('1\nOlá')
    expect(r.meta).toMatchObject({ encoding: 'utf-8', bom: true, confidence: null })
  })

  it('UTF-16 LE com BOM', () => {
    const body = Buffer.from('Olá ação', 'utf16le')
    const r = decodeSubtitle(Uint8Array.from([0xff, 0xfe, ...body]))
    expect(r.text).toBe('Olá ação')
    expect(r.meta).toMatchObject({ encoding: 'utf-16le', bom: true })
  })

  it('UTF-16 BE com BOM', () => {
    const le = Buffer.from('Olá ação', 'utf16le')
    const be = Buffer.from(le).swap16()
    const r = decodeSubtitle(Uint8Array.from([0xfe, 0xff, ...be]))
    expect(r.text).toBe('Olá ação')
    expect(r.meta).toMatchObject({ encoding: 'utf-16be', bom: true })
  })

  it('BOM duplicado: o segundo U+FEFF é preservado, não descartado', () => {
    const r = decodeSubtitle(Uint8Array.from([0xef, 0xbb, 0xbf, 0xef, 0xbb, 0xbf, 0x41]))
    expect(r.text).toBe('﻿A')
  })
})

describe('decodeSubtitle: sem BOM', () => {
  it('UTF-8 estrito, incluindo ASCII puro', () => {
    expect(decodeSubtitle(utf8('Não há ação 🎌')).meta).toMatchObject({
      encoding: 'utf-8',
      confidence: null,
      bom: false
    })
    expect(decodeSubtitle(utf8('plain ascii')).meta.encoding).toBe('utf-8')
  })

  it('Latin-1/windows-1252 (pt-BR legado) decodifica corretamente', () => {
    const r = decodeSubtitle(
      Buffer.from('Não há ação, você está aí? “aspas”\n'.replace(/[“”]/g, '"'), 'latin1')
    )
    expect(r.text).toBe('Não há ação, você está aí? "aspas"\n')
    expect(r.meta.encoding).toBe('windows-1252')
    expect(r.meta.confidence).toBeGreaterThanOrEqual(0)
    expect(r.meta.confidence).toBeLessThanOrEqual(1)
  })

  it('aspas tipográficas 0x93/0x94 são windows-1252, não Latin-1', () => {
    const r = decodeSubtitle(bytes(0x93, 0x4f, 0x6c, 0xe1, 0x94))
    expect(r.text).toBe('“Olá”')
  })

  it('bytes inválidos nunca lançam', () => {
    expect(() => decodeSubtitle(bytes(0xff, 0xff, 0xc3, 0x28, 0xa0))).not.toThrow()
  })

  it('entrada vazia', () => {
    const r = decodeSubtitle(new Uint8Array())
    expect(r.text).toBe('')
    expect(r.meta.encoding).toBe('utf-8')
  })
})

describe('decodeSubtitle: propriedades', () => {
  it('UTF-8 de qualquer string unicode válida volta idêntico (BOM regravado)', () => {
    fc.assert(
      fc.property(fc.string({ unit: 'grapheme' }), (s) => {
        const r = decodeSubtitle(utf8(s))
        expect((r.meta.bom ? '﻿' : '') + r.text).toBe(s)
      })
    )
  })
})

describe('analyzeEol', () => {
  it.each([
    ['a\nb\n', '\n', '\n'],
    ['a\r\nb\r\n', '\r\n', '\r\n'],
    ['a\rb\r', '\r', '\r'],
    ['sem quebras', '\n', '\n'],
    ['a\r\nb\nc\r\n', 'mixed', '\r\n'],
    ['a\nb\r\n', 'mixed', '\r\n'], // empate: \r\n vence
    ['a\nb\nc\r\n', 'mixed', '\n']
  ] as const)('%j -> eol=%j dominante=%j', (text, eol, dominantEol) => {
    expect(analyzeEol(text)).toEqual({ eol, dominantEol })
  })
})
