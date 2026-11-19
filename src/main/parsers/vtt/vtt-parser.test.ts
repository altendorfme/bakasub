import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import { SubtitleParseError } from '../core/format'
import { br, tag, text } from '../core/nodes'
import type { Cue } from '../core/types'
import { parseVtt } from './vtt-parser'
import { serializeVtt } from './vtt-serializer'
import type { VttCueData } from './types'

/** Nó de texto original do VTT: sempre com `raw`. */
const vt = (value: string, raw = value): ReturnType<typeof text> => text(value, raw)

const T1 = '00:01.000 --> 00:02.000'
const T2 = '00:03.000 --> 00:04.000'

const cues = (src: string): Cue<VttCueData>[] =>
  parseVtt(src).items.filter((i): i is Cue<VttCueData> => i.kind === 'cue')
const codes = (src: string): string[] => parseVtt(src).diagnostics.map((d) => d.code)

describe('parseVtt: estrutura', () => {
  const src = [
    'WEBVTT - legenda',
    'Kind: captions',
    '',
    'STYLE',
    '::cue { color: yellow }',
    '',
    'NOTE comentário',
    'de duas linhas',
    '',
    'intro',
    `${T1} align:start line:0`,
    '<v Bob>Olá &amp; <i>bem-vindo</i>',
    'segunda linha',
    '',
    T2,
    'Fim',
    ''
  ].join('\n')

  it('header, STYLE e NOTE são trivia no `leading`; nada disso vira item', () => {
    const doc = parseVtt(src)
    expect(doc.format).toBe('vtt')
    expect(doc.items.map((i) => i.kind)).toEqual(['cue', 'cue'])
    expect(doc.items[0].leading).toBe(
      'WEBVTT - legenda\nKind: captions\n\nSTYLE\n::cue { color: yellow }\n\nNOTE comentário\nde duas linhas\n\n'
    )
    expect(doc.diagnostics).toEqual([])
  })

  it('cue com identificador, configurações, voz e entidades', () => {
    const [a, b] = cues(src)
    expect(a).toMatchObject({
      id: 1,
      line: 10,
      endLine: 13,
      start: { ms: 1000, raw: '00:01.000' },
      end: { ms: 2000, raw: '00:02.000' },
      actor: 'Bob',
      format: {
        identifier: { raw: 'intro', eol: '\n' },
        timingRaw: `${T1} align:start line:0`,
        settings: ' align:start line:0',
        timingEol: '\n'
      }
    })
    expect(a.nodes).toEqual([
      tag('<v Bob>', 'v', 'open'),
      vt('Olá & ', 'Olá &amp; '),
      tag('<i>', 'i', 'open'),
      vt('bem-vindo'),
      tag('</i>', 'i', 'close'),
      br('\n'),
      vt('segunda linha')
    ])
    expect(b).toMatchObject({ id: 2, leading: '\n\n', format: { identifier: null } })
    expect(parseVtt(src).trailing).toBe('\n')
  })

  it('cue sem texto', () => {
    const [a] = cues(`WEBVTT\n\n${T1}\n`)
    expect(a.nodes).toEqual([])
    expect(a.format.timingEol).toBe('')
    expect(codes(`WEBVTT\n\n${T1}\n`)).toEqual(['VTT_EMPTY_CUE'])
  })

  it('entrada vazia ou sem cues lança SubtitleParseError', () => {
    expect(() => parseVtt('  \n')).toThrow(SubtitleParseError)
    expect(() => parseVtt('WEBVTT\n\nNOTE só isso\n')).toThrow(SubtitleParseError)
  })
})

describe('parseVtt: diagnósticos', () => {
  it('sem cabeçalho WEBVTT', () => {
    expect(codes(`${T1}\nA\n`)).toEqual(['VTT_HEADER_MISSING'])
  })

  it('timestamp no estilo SRT', () => {
    expect(codes('WEBVTT\n\n00:00:01,000 --> 00:00:02,000\nA\n')).toEqual(['VTT_TIME_FORMAT'])
  })

  it('cue colado ao anterior: a linha antes do timing é texto do cue anterior (spec)', () => {
    const src = `WEBVTT\n\n${T1}\nA\nid2\n${T2}\nB\n`
    const [a, b] = cues(src)
    expect(a.nodes).toEqual([vt('A'), br('\n'), vt('id2')])
    expect(b.format.identifier).toBeNull()
    expect(codes(src)).toEqual(['VTT_MISSING_BLANK_LINE'])
  })

  it('cue colado ao cabeçalho', () => {
    const src = `WEBVTT\n${T1}\nA\n`
    expect(cues(src)[0].leading).toBe('WEBVTT\n')
    expect(codes(src)).toEqual(['VTT_MISSING_BLANK_LINE'])
  })

  it('linha "em branco" com espaços não separa blocos pela spec', () => {
    expect(codes(`WEBVTT\n\n${T1}\nA\n  \n${T2}\nB\n`)).toEqual(['VTT_MISSING_BLANK_LINE'])
  })

  it('`-->` dentro do texto', () => {
    expect(codes(`WEBVTT\n\n${T1}\nA --> B\n`)).toEqual(['VTT_ARROW_IN_TEXT'])
  })

  it('fim antes do início', () => {
    expect(codes('WEBVTT\n\n00:02.000 --> 00:01.000\nA\n')).toEqual(['VTT_END_BEFORE_START'])
  })

  it('blocos sem timing viram `unparsed`', () => {
    const doc = parseVtt(`WEBVTT\n\nlixo solto\n\n${T1}\nA\n\n00:0x --> 1\nB\n`)
    const unparsed = doc.items.filter((i) => i.kind === 'unparsed')
    expect(unparsed.map((u) => u.kind === 'unparsed' && u.reason)).toEqual([
      'orphan-text',
      'bad-timing'
    ])
    expect(doc.diagnostics.map((d) => d.code)).toEqual([
      'VTT_UNPARSEABLE_BLOCK',
      'VTT_UNPARSEABLE_BLOCK'
    ])
  })

  it('EOL misto', () => {
    expect(codes(`WEBVTT\r\n\n${T1}\nA\n`)).toContain('VTT_EOL_MIXED')
  })
})

describe('serializeVtt', () => {
  it('é exato', () => {
    const src = `WEBVTT\r\n\r\nNOTE x\r\n\r\nid\r\n${T1} align:end\r\n<b>A &lt;3</b>\r\n\r\n\r\n${T2}\r\nB`
    expect(serializeVtt(parseVtt(src))).toBe(src)
  })

  it('round-trip por propriedade', () => {
    const line = fc.constantFrom(
      'WEBVTT',
      '',
      '  ',
      'NOTE nota',
      'STYLE',
      'id-1',
      T1,
      `${T2} position:10%`,
      '00:00:05,000 --> 00:00:06,000',
      '00:0x --> y',
      'Texto <i>itálico</i> &amp; mais',
      'A --> B',
      '<v Ana>fala'
    )
    const eol = fc.constantFrom('\n', '\r\n', '\r')
    const input = fc
      .array(fc.tuple(line, eol), { minLength: 1, maxLength: 30 })
      .map((ls) => `WEBVTT\n\n${T1}\nx\n\n` + ls.map(([l, e]) => l + e).join(''))
    fc.assert(
      fc.property(input, (src) => {
        expect(serializeVtt(parseVtt(src))).toBe(src)
      })
    )
  })
})
