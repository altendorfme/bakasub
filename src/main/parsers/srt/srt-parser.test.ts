import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import { SubtitleParseError } from '../core/format'
import { br, tag, text } from '../core/nodes'
import type { Cue, DocumentMeta } from '../core/types'
import { decodeSubtitle } from '../decode/subtitle-decoder'
import { parseSrt } from './srt-parser'
import { serializeSrt } from './srt-serializer'
import type { SrtCueData } from './types'

const T1 = '00:00:01,000 --> 00:00:02,000'
const T2 = '00:00:03,000 --> 00:00:04,000'
const T3 = '00:00:05,000 --> 00:00:06,000'

const codes = (src: string): string[] => parseSrt(src).diagnostics.map((d) => d.code)
const cues = (src: string): Cue<SrtCueData>[] =>
  parseSrt(src).items.filter((i): i is Cue<SrtCueData> => i.kind === 'cue')

describe('parseSrt: estrutura', () => {
  const src = `1\n${T1}\n{\\an8}Olá <i>mundo</i>\n- Tudo bem?\n\n2\n${T2}\nFim\n`

  it('monta cues com id ordinal, timecodes, nós e linha', () => {
    const [a, b] = cues(src)
    expect(a).toMatchObject({
      kind: 'cue',
      id: 1,
      line: 1,
      leading: '',
      start: { ms: 1000, raw: '00:00:01,000' },
      end: { ms: 2000, raw: '00:00:02,000' }
    })
    expect(a.nodes).toEqual([
      tag('{\\an8}', '', 'override'),
      text('Olá '),
      tag('<i>', 'i', 'open'),
      text('mundo'),
      tag('</i>', 'i', 'close'),
      br('\n'),
      text('- Tudo bem?')
    ])
    expect(b).toMatchObject({ id: 2, line: 6, leading: '\n\n', nodes: [text('Fim')] })
  })

  it('trailing guarda o EOL final; sem newline final fica vazio', () => {
    expect(parseSrt(src).trailing).toBe('\n')
    expect(parseSrt(`1\n${T1}\nA`).trailing).toBe('')
    expect(parseSrt(`1\n${T1}\nA\n\n\n`).trailing).toBe('\n\n\n')
  })

  it('o id é ordinal e ignora o índice do arquivo', () => {
    expect(cues(`7\n${T1}\nA\n\n7\n${T2}\nB\n\n1\n${T3}\nC\n`).map((c) => c.id)).toEqual([1, 2, 3])
  })

  it('usa o meta recebido (BOM/encoding vêm do decoder)', () => {
    const meta: DocumentMeta = {
      encoding: 'windows-1252',
      confidence: 0.7,
      bom: false,
      eol: '\n',
      dominantEol: '\n'
    }
    expect(parseSrt(`1\n${T1}\nA\n`, meta).meta).toBe(meta)
  })
})

describe('parseSrt: erros', () => {
  it.each(['', '   \n\r\n ', '\n\n'])('entrada vazia %j', (s) => {
    expect(() => parseSrt(s)).toThrowError(expect.objectContaining({ code: 'EMPTY_INPUT' }))
  })

  it('arquivo sem nenhum cue válido', () => {
    const run = (): unknown => parseSrt('isto não é uma legenda\nnem isto\n')
    expect(run).toThrow(SubtitleParseError)
    expect(run).toThrowError(expect.objectContaining({ code: 'NO_VALID_CUES' }))
  })
})

describe('parseSrt: diagnósticos', () => {
  it('arquivo canônico não gera diagnósticos', () => {
    expect(codes(`1\n${T1}\nA\n\n2\n${T2}\nB\n`)).toEqual([])
  })

  it('índice ausente, duplicado e fora de sequência', () => {
    expect(codes(`${T1}\nA\n\n5\n${T2}\nB\n\n5\n${T3}\nC\n`)).toEqual([
      'SRT_INDEX_MISSING',
      'SRT_INDEX_GAP',
      'SRT_INDEX_DUPLICATE'
    ])
  })

  it('cues colados', () => {
    expect(codes(`1\n${T1}\nA\n2\n${T2}\nB\n`)).toEqual(['SRT_MISSING_BLANK_LINE'])
  })

  it('timing com ponto, padding e seta colada', () => {
    expect(codes('1\n0:00:01.5-->0:00:02.0\nA\n')).toEqual([
      'SRT_TIME_DOT_SEPARATOR',
      'SRT_TIME_PADDING',
      'SRT_ARROW_SPACING'
    ])
  })

  it('coordenadas viram TIMING_EXTRAS (relato); só espaço vira TRAILING_WS (corrige)', () => {
    expect(codes(`1\n${T1} X1:1 X2:2\nA\n`)).toEqual(['SRT_TIMING_EXTRAS'])
    expect(codes(`1\n${T1}  \nA\n`)).toEqual(['SRT_TRAILING_WS'])
  })

  it('fim antes do início e sobreposição', () => {
    expect(codes('1\n00:00:05,000 --> 00:00:02,000\nA\n')).toEqual(['SRT_END_BEFORE_START'])
    expect(
      codes(`1\n00:00:01,000 --> 00:00:05,000\nA\n\n2\n00:00:03,000 --> 00:00:06,000\nB\n`)
    ).toEqual(['SRT_OVERLAP'])
  })

  it('cue vazio e espaço no fim da linha de texto', () => {
    expect(codes(`1\n${T1}\n\n2\n${T2}\nB\n`)).toEqual(['SRT_EMPTY_CUE'])
    expect(codes(`1\n${T1}\nA \nB\n`)).toEqual(['SRT_TRAILING_WS'])
  })

  it('bloco não parseado gera relato com o motivo', () => {
    const d = parseSrt(`1\n${T1}\nA\n\nsolto\n`).diagnostics
    expect(d).toHaveLength(1)
    expect(d[0]).toMatchObject({
      code: 'SRT_UNPARSEABLE_BLOCK',
      fix: 'report',
      line: 5,
      params: { reason: 'orphan-text' },
      ref: { kind: 'block', blockIndex: 1 }
    })
  })

  it('EOL misto', () => {
    const src = `1\r\n${T1}\nA\r\n`
    const meta = decodeSubtitle(new TextEncoder().encode(src)).meta
    expect(parseSrt(src, meta).diagnostics.map((d) => d.code)).toContain('SRT_EOL_MIXED')
  })

  it('cada diagnóstico traz a política de correção da tabela única', () => {
    const d = parseSrt(`${T1}\nA\n\n${T2}  \nB\n`).diagnostics
    expect(d.find((x) => x.code === 'SRT_INDEX_MISSING')?.fix).toBe('auto')
    expect(parseSrt(`1\n${T1} X1:1\nA\n`).diagnostics[0].fix).toBe('report')
  })
})

describe('serializeSrt: round-trip exato', () => {
  const rt = (s: string): string => serializeSrt(parseSrt(s))

  it.each([
    ['canônico', `1\n${T1}\nA\n\n2\n${T2}\nB\n`],
    ['CRLF', `1\r\n${T1}\r\nA\r\n\r\n2\r\n${T2}\r\nB\r\n`],
    ['sem newline final', `1\n${T1}\nA`],
    ['EOL misto', `1\r\n${T1}\nA\r\nB\r\n\n2\n${T2}\rC`],
    ['cues colados', `1\n${T1}\nA\n2\n${T2}\nB\n`],
    ['sem índices', `${T1}\nA\n\n${T2}\nB\n`],
    ['blank lines e espaços extras', `\n\n1\n${T1}\nA \n   \n\n\t\n2\n${T2}\nB\n\n\n`],
    ['ponto, padding e coordenadas', `1\n0:0:1.5 --> 0:0:2 X1:1 Y1:2\nA\n`],
    [
      'bloco órfão e bad-timing',
      `lixo\n\n1\n${T1}\nA\n\n2\n00:00:01,000 --> x\nB\n\n3\n${T3}\nC\n`
    ],
    ['cue vazio', `1\n${T1}\n\n2\n${T2}\nB\n`],
    ['tags, override, entidades, unicode', `1\n${T1}\n{\\an8}<i>Olá</i> &amp; <3 日本語 🎌\n`],
    ['índice com espaços', `\n 3 \n${T1}\nA\n`]
  ])('%s', (_name, s) => {
    expect(rt(s)).toBe(s)
  })

  it('fixture de saída do mkvextract (BOM removido pelo decoder, regravado depois)', () => {
    const raw = Uint8Array.from([
      0xef,
      0xbb,
      0xbf,
      ...new TextEncoder().encode(`1\n${T1}\nOlá {\\an8}mundo\n\n2\n${T2}\nSegunda linha\n\n`)
    ])
    const decoded = decodeSubtitle(raw)
    expect(decoded.meta.bom).toBe(true)
    const doc = parseSrt(decoded.text, decoded.meta)
    expect(doc.diagnostics).toEqual([])
    expect((doc.meta.bom ? '﻿' : '') + serializeSrt(doc)).toBe(
      new TextDecoder('utf-8', { ignoreBOM: true }).decode(raw)
    )
  })

  const lineGen = fc.constantFrom(
    '1',
    '12',
    ' 3 ',
    T1,
    T2,
    '00:00:01.5 --> 00:00:02',
    '00:00:01,000 --> lixo',
    'Olá',
    '- Oi',
    '{\\an8}x',
    '<i>t</i>',
    '',
    '   ',
    'texto solto',
    '99',
    'a ',
    '<3',
    '&amp;'
  )
  const eolGen = fc.constantFrom('\n', '\r\n', '\r')
  const doc = fc
    .array(fc.tuple(lineGen, eolGen), { maxLength: 40 })
    .chain((ls) =>
      fc
        .boolean()
        .map((nl) => ls.map(([l, e], k) => l + (k === ls.length - 1 && !nl ? '' : e)).join(''))
    )

  const roundTrips = (s: string): boolean => {
    try {
      return rt(s) === s
    } catch (e) {
      if (e instanceof SubtitleParseError) return true // sem cues: nada a reproduzir
      throw e
    }
  }

  it('sanidade: o gerador produz cues e blocos não parseados em volume relevante', () => {
    const samples = fc.sample(doc, { numRuns: 400, seed: 1 })
    let withCues = 0
    let withUnparsed = 0
    for (const s of samples) {
      try {
        const d = parseSrt(s)
        withCues++
        if (d.items.some((i) => i.kind === 'unparsed')) withUnparsed++
      } catch {
        /* sem cues */
      }
    }
    expect(withCues / samples.length).toBeGreaterThan(0.5)
    expect(withUnparsed / samples.length).toBeGreaterThan(0.1)
  })

  it('propriedade: serialize(parse(s)) === s para documentos gerados', () => {
    fc.assert(fc.property(doc, roundTrips), { numRuns: 500 })
  })

  it('propriedade: continua exato com lixo binário arbitrário anexado', () => {
    fc.assert(
      fc.property(fc.string({ unit: 'binary', maxLength: 80 }), (junk) =>
        roundTrips(`1\n${T1}\nA\n\n${junk}`)
      ),
      { numRuns: 300 }
    )
  })
})

describe('parseSrt: SRT_AMBIGUOUS_INDEX', () => {
  it('relata e mantém o número como texto do cue anterior', () => {
    const src = `1\n${T1}\nEm\n1999\n${T2}\nFim\n`
    const doc = parseSrt(src)
    const d = doc.diagnostics.find((x) => x.code === 'SRT_AMBIGUOUS_INDEX')
    expect(d).toMatchObject({ severity: 'warn', fix: 'report', line: 4, params: { value: '1999' } })
    expect(serializeSrt(doc)).toBe(src)
  })
})
