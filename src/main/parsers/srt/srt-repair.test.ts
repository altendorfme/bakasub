import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import { decodeSubtitle } from '../decode/subtitle-decoder'
import { srtFormat } from './index'
import { parseSrt } from './srt-parser'
import { SubtitleParseError, type RepairOptions, type RepairResult } from '../core/format'
import type { Cue } from '../core/types'
import type { SrtCueData } from './types'

const T1 = '00:00:01,000 --> 00:00:02,000'
const T2 = '00:00:03,000 --> 00:00:04,000'
const T3 = '00:00:05,000 --> 00:00:06,000'

const repair = (src: string, opts?: RepairOptions): RepairResult =>
  srtFormat.serializeRepaired(parseSrt(src), opts)

describe('serializeRepaired: nada a corrigir', () => {
  it('arquivo canônico sai idêntico e sem correções', () => {
    const src = `1\n${T1}\nA\n\n2\n${T2}\nB\n`
    expect(repair(src)).toEqual({ text: src, applied: [] })
  })

  it('mantém o EOL do arquivo (CRLF)', () => {
    const src = `1\r\n${T1}\r\nA\r\n\r\n2\r\n${T2}\r\nB\r\n`
    expect(repair(src)).toEqual({ text: src, applied: [] })
  })
})

describe('serializeRepaired: correções automáticas', () => {
  it('índices: ausente, duplicado e fora de sequência viram 1..N', () => {
    const r = repair(`${T1}\nA\n\n5\n${T2}\nB\n\n5\n${T3}\nC\n`)
    expect(r.text).toBe(`1\n${T1}\nA\n\n2\n${T2}\nB\n\n3\n${T3}\nC\n`)
    expect(r.applied.map((a) => a.code)).toEqual([
      'SRT_INDEX_MISSING',
      'SRT_INDEX_GAP',
      'SRT_INDEX_DUPLICATE'
    ])
  })

  it('timing: ponto, padding e seta colada', () => {
    const r = repair('1\n0:00:01.5-->0:00:02.0\nA\n')
    expect(r.text).toBe(`1\n00:00:01,005 --> 00:00:02,000\nA\n`)
    expect(r.applied.map((a) => a.code)).toEqual([
      'SRT_TIME_DOT_SEPARATOR',
      'SRT_TIME_PADDING',
      'SRT_ARROW_SPACING'
    ])
  })

  it('o valor em milissegundos nunca muda ao reescrever o timing', () => {
    const before = parseSrt('1\n1:2:3,4 --> 1:2:4\nA\n').items[0] as Cue<SrtCueData>
    const after = parseSrt(repair('1\n1:2:3,4 --> 1:2:4\nA\n').text).items[0] as Cue<SrtCueData>
    expect([after.start.ms, after.end.ms]).toEqual([before.start.ms, before.end.ms])
  })

  it('75 minutos é reescrito como 01:15:00 (mesmo instante)', () => {
    const r = repair('1\n00:75:00,000 --> 00:75:01,000\nA\n')
    expect(r.text).toBe('1\n01:15:00,000 --> 01:15:01,000\nA\n')
    expect(r.applied.map((a) => a.code)).toEqual(['SRT_TIME_PADDING'])
  })

  it('cues colados ganham linha em branco', () => {
    const r = repair(`1\n${T1}\nA\n2\n${T2}\nB\n`)
    expect(r.text).toBe(`1\n${T1}\nA\n\n2\n${T2}\nB\n`)
    expect(r.applied.map((a) => a.code)).toEqual(['SRT_MISSING_BLANK_LINE'])
  })

  it('EOL misto é unificado no dominante', () => {
    const src = `1\r\n${T1}\r\nA\r\nB\n\r\n2\r\n${T2}\nC\r\n`
    const meta = decodeSubtitle(new TextEncoder().encode(src)).meta
    expect(meta.dominantEol).toBe('\r\n')
    const r = srtFormat.serializeRepaired(parseSrt(src, meta))
    expect(r.text).toBe(`1\r\n${T1}\r\nA\r\nB\r\n\r\n2\r\n${T2}\r\nC\r\n`)
    expect(r.applied[0]).toMatchObject({ code: 'SRT_EOL_MIXED' })
  })

  it('espaços no fim de linhas de texto, de timing e em linhas "em branco"', () => {
    const r = repair(`1\n${T1}  \nA \nB\t\n \t \n2\n${T2}\nC\n`)
    expect(r.text).toBe(`1\n${T1}\nA\nB\n\n2\n${T2}\nC\n`)
    expect(new Set(r.applied.map((a) => a.code))).toEqual(new Set(['SRT_TRAILING_WS']))
  })

  it('espaço no fim não toca em espaços internos nem em tags', () => {
    expect(repair(`1\n${T1}\n<i>a  b</i> \n`).text).toBe(`1\n${T1}\n<i>a  b</i>\n`)
  })

  it('linhas em branco no início do arquivo são removidas', () => {
    expect(repair(`\n\n1\n${T1}\nA\n`).text).toBe(`1\n${T1}\nA\n`)
  })
})

describe('serializeRepaired: itens só-relato são preservados', () => {
  it('fim antes do início, sobreposição e cue vazio não são alterados', () => {
    const src = `1\n00:00:05,000 --> 00:00:02,000\nA\n\n2\n00:00:01,000 --> 00:00:03,000\n\n3\n${T3}\nC\n`
    const r = repair(src)
    expect(r.text).toBe(src)
    expect(r.applied).toEqual([])
  })

  it('coordenadas são mantidas (com espaçamento normalizado)', () => {
    const r = repair(`1\n${T1}    X1:10 X2:20\nA\n`)
    expect(r.text).toBe(`1\n${T1} X1:10 X2:20\nA\n`)
  })
})

describe('serializeRepaired: blocos não parseados', () => {
  const src = `1\n${T1}\nA\n\nsolto\n\n2\n${T2}\nB\n`

  it('keep (padrão): permanece verbatim na posição original', () => {
    expect(repair(src)).toEqual({ text: src, applied: [] })
  })

  it('drop: é removido e registrado', () => {
    const r = repair(src, { unparsed: 'drop' })
    expect(r.text).toBe(`1\n${T1}\nA\n\n2\n${T2}\nB\n`)
    expect(r.applied).toEqual([
      { code: 'SRT_UNPARSEABLE_BLOCK', ref: { kind: 'block', blockIndex: 1 }, line: 5 }
    ])
  })

  it('drop do primeiro item não deixa linhas em branco no início', () => {
    expect(repair(`lixo\n\n1\n${T1}\nA\n`, { unparsed: 'drop' }).text).toBe(`1\n${T1}\nA\n`)
  })
})

describe('serializeRepaired: propriedades', () => {
  const lineGen = fc.constantFrom(
    '1',
    '12',
    ' 3 ',
    T1,
    T2,
    '00:00:01.5 --> 00:00:02',
    '00:00:01,000 --> lixo',
    '0:0:1,5-->0:0:2 X1:1',
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

  const withDoc = (src: string, fn: (d: ReturnType<typeof parseSrt>) => boolean): boolean => {
    try {
      return fn(parseSrt(src))
    } catch (e) {
      if (e instanceof SubtitleParseError) return true
      throw e
    }
  }

  for (const unparsed of ['keep', 'drop'] as const) {
    it(`idempotente (${unparsed}): reparar o resultado não muda nada nem aplica correções`, () => {
      fc.assert(
        fc.property(doc, (src) =>
          withDoc(src, (d) => {
            const once = srtFormat.serializeRepaired(d, { unparsed })
            let again
            try {
              again = srtFormat.serializeRepaired(parseSrt(once.text), { unparsed })
            } catch (e) {
              return e instanceof SubtitleParseError
            }
            return again.text === once.text && again.applied.length === 0
          })
        ),
        { numRuns: 400 }
      )
    })
  }

  it('o resultado reparsado não tem diagnósticos auto pendentes', () => {
    fc.assert(
      fc.property(doc, (src) =>
        withDoc(src, (d) => {
          const out = srtFormat.serializeRepaired(d).text
          return parseSrt(out).diagnostics.every((x) => x.fix !== 'auto')
        })
      ),
      { numRuns: 400 }
    )
  })

  it('timecodes e texto dos cues são preservados (só espaço no fim de linha pode mudar)', () => {
    const snapshot = (d: ReturnType<typeof parseSrt>): string[] =>
      d.items
        .filter((i): i is Cue<SrtCueData> => i.kind === 'cue')
        .map((c) => {
          const body = c.nodes
            .map((n) => (n.type === 'text' ? n.value : n.type === 'br' ? '\n' : n.raw))
            .join('')
          return `${c.start.ms}|${c.end.ms}|${body.replace(/[ \t]+(?=\n|$)/g, '')}`
        })
    fc.assert(
      fc.property(doc, (src) =>
        withDoc(src, (d) => {
          const repaired = parseSrt(srtFormat.serializeRepaired(d).text)
          return JSON.stringify(snapshot(repaired)) === JSON.stringify(snapshot(d))
        })
      ),
      { numRuns: 400 }
    )
  })

  it('o EOL do resultado é uniforme', () => {
    fc.assert(
      fc.property(doc, (src) =>
        withDoc(src, (d) => {
          const out = srtFormat.serializeRepaired(d).text
          return (
            !(/\r\n/.test(out) && /(^|[^\r])\n/.test(out)) &&
            !(/\r(?!\n)/.test(out) && /\n/.test(out.replace(/\r\n/g, '')))
          )
        })
      ),
      { numRuns: 400 }
    )
  })
})
