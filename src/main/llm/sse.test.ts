import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import { SseDecoder, type SseEvent } from './sse'

const enc = new TextEncoder()
const decodeAll = (chunks: Uint8Array[]): SseEvent[] => {
  const d = new SseDecoder()
  return [...chunks.flatMap((c) => d.push(c)), ...d.end()]
}
const one = (s: string): SseEvent[] => decodeAll([enc.encode(s)])

describe('SseDecoder', () => {
  it('data simples e [DONE]', () => {
    expect(one('data: {"a":1}\n\ndata: [DONE]\n\n')).toEqual([
      { data: '{"a":1}' },
      { data: '[DONE]' }
    ])
  })
  it('ignora comentários (keep-alive da OpenRouter)', () => {
    expect(one(': OPENROUTER PROCESSING\n\ndata: x\n\n')).toEqual([{ data: 'x' }])
  })
  it('várias linhas data viram uma, unidas por \\n', () => {
    expect(one('data: a\ndata: b\n\n')).toEqual([{ data: 'a\nb' }])
  })
  it('CRLF e CR isolado como fim de linha', () => {
    expect(one('data: a\r\n\r\ndata: b\r\rdata: c\n\n')).toEqual([
      { data: 'a' },
      { data: 'b' },
      { data: 'c' }
    ])
  })
  it('event/id; só um espaço após ":" é removido; campo sem ":"', () => {
    expect(one('event: e\nid: 7\ndata:  dois\ndata\n\n')).toEqual([
      { event: 'e', id: '7', data: ' dois\n' }
    ])
  })
  it('bloco sem data não é despachado; bloco final sem linha em branco é descartado', () => {
    expect(one('event: x\n\ndata: fim')).toEqual([])
  })
  it('UTF-8 multibyte cortado entre chunks', () => {
    const bytes = enc.encode('data: olá 日本\n\n')
    const chunks = [...bytes].map((b) => new Uint8Array([b]))
    expect(decodeAll(chunks)).toEqual([{ data: 'olá 日本' }])
  })
  it('BOM inicial é ignorado', () => {
    expect(one('﻿data: a\n\n')).toEqual([{ data: 'a' }])
  })

  it('propriedade: qualquer fatiamento produz os mesmos eventos', () => {
    const line = fc.oneof(
      fc.string({ maxLength: 12 }).map((s) => `data: ${s.replace(/[\r\n]/g, '')}`),
      fc.constantFrom(': OPENROUTER PROCESSING', 'event: e', 'id: 1', 'data', 'data:x')
    )
    const eol = fc.constantFrom('\n', '\r\n', '\r')
    const doc = fc
      .array(fc.tuple(fc.array(fc.tuple(line, eol), { minLength: 1, maxLength: 4 }), eol), {
        maxLength: 10
      })
      .map((blocks) => blocks.map(([ls, e]) => ls.map(([l, x]) => l + x).join('') + e).join(''))
    fc.assert(
      fc.property(doc, fc.array(fc.nat(), { maxLength: 8 }), (s, cuts) => {
        const bytes = enc.encode(s)
        const points = [...new Set(cuts.map((c) => c % (bytes.length + 1)))].sort((a, b) => a - b)
        const chunks: Uint8Array[] = []
        let prev = 0
        for (const p of [...points, bytes.length]) {
          chunks.push(bytes.slice(prev, p))
          prev = p
        }
        expect(decodeAll(chunks)).toEqual(one(s))
      }),
      { numRuns: 500 }
    )
  })
})
