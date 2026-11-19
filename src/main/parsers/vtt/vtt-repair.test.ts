import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import { text } from '../core/nodes'
import type { Cue } from '../core/types'
import { parseVtt } from './vtt-parser'
import { repairVtt } from './vtt-repair'
import type { VttCueData } from './types'

const T1 = '00:01.000 --> 00:02.000'
const T2 = '00:03.000 --> 00:04.000'
const repair = (src: string): ReturnType<typeof repairVtt> => repairVtt(parseVtt(src))
const fixes = (src: string): string[] => repair(src).applied.map((a) => a.code)

describe('repairVtt', () => {
  it('arquivo canônico sai idêntico e sem correções', () => {
    const src = `WEBVTT\n\nNOTE x\n\nid\n${T1} align:start\n<i>A &amp; B</i>\n\n${T2}\nC\n`
    expect(repair(src)).toEqual({ text: src, applied: [] })
  })

  it('insere o cabeçalho ausente', () => {
    expect(repair(`\n${T1}\nA\n`).text).toBe(`WEBVTT\n\n${T1}\nA\n`)
    expect(fixes(`${T1}\nA\n`)).toEqual(['VTT_HEADER_MISSING'])
  })

  it('regenera timestamps fora do canônico preservando hora e configurações', () => {
    const r = repair('WEBVTT\n\n00:00:01,000-->0:02.5 line:0\nA\n')
    expect(r.text).toBe('WEBVTT\n\n00:00:01.000 --> 00:02.005 line:0\nA\n')
    expect(r.applied.map((a) => a.code)).toEqual(['VTT_TIME_FORMAT'])
  })

  it('separa cues colados e limpa linhas "em branco" com espaços', () => {
    expect(repair(`WEBVTT\n${T1}\nA\n${T2}\nB\n`).text).toBe(`WEBVTT\n\n${T1}\nA\n\n${T2}\nB\n`)
    expect(repair(`WEBVTT\n\n${T1}\nA\n \t\n${T2}\nB\n`).text).toBe(
      `WEBVTT\n\n${T1}\nA\n\n${T2}\nB\n`
    )
    expect(fixes(`WEBVTT\n${T1}\nA\n${T2}\nB\n`)).toEqual([
      'VTT_MISSING_BLANK_LINE',
      'VTT_MISSING_BLANK_LINE'
    ])
  })

  it('`-->` no texto vira `--&gt;` (mesma aparência, cue válido)', () => {
    const r = repair(`WEBVTT\n\n${T1}\nA --> B\n`)
    expect(r.text).toBe(`WEBVTT\n\n${T1}\nA --&gt; B\n`)
    expect(r.applied.map((a) => a.code)).toEqual(['VTT_ARROW_IN_TEXT'])
  })

  it('unifica o EOL', () => {
    const r = repair(`WEBVTT\r\n\r\n${T1}\nA\r\nB\r\n`)
    expect(r.text).toBe(`WEBVTT\r\n\r\n${T1}\r\nA\r\nB\r\n`)
    expect(r.applied.map((a) => a.code)).toEqual(['VTT_EOL_MIXED'])
  })

  it('preserva relatos (fim<início, cue vazio) e blocos unparsed, ou os descarta', () => {
    const src = `WEBVTT\n\nlixo\n\n00:02.000 --> 00:01.000\n\n${T2}\nB\n`
    expect(repair(src).text).toBe(src)
    const dropped = repairVtt(parseVtt(src), { unparsed: 'drop' })
    expect(dropped.text).toBe(`WEBVTT\n\n00:02.000 --> 00:01.000\n\n${T2}\nB\n`)
    expect(dropped.applied.map((a) => a.code)).toEqual(['VTT_UNPARSEABLE_BLOCK'])
  })

  it('texto traduzido (sem `raw`) sai escapado', () => {
    const doc = parseVtt(`WEBVTT\n\n${T1}\nA\n`)
    const cue = doc.items[0] as Cue<VttCueData>
    const translated = { ...doc, items: [{ ...cue, nodes: [text('Tom & Jerry <3 --> fim')] }] }
    expect(repairVtt(translated).text).toBe(`WEBVTT\n\n${T1}\nTom &amp; Jerry &lt;3 --&gt; fim\n`)
  })

  it('é idempotente e o resultado reparse sem diagnósticos corrigíveis', () => {
    const line = fc.constantFrom(
      'WEBVTT',
      '',
      ' ',
      'NOTE n',
      'id',
      T1,
      '00:00:05,000 --> 00:00:06,000',
      '0:7.1 --> 0:8.2 align:end',
      'Texto &amp; <b>negrito</b>',
      'A --> B'
    )
    const eol = fc.constantFrom('\n', '\r\n')
    const input = fc
      .array(fc.tuple(line, eol), { maxLength: 25 })
      .map((ls) => `${T1}\nx\n` + ls.map(([l, e]) => l + e).join(''))
    fc.assert(
      fc.property(input, (src) => {
        const once = repair(src).text
        expect(repair(once)).toEqual({ text: once, applied: [] })
        const autos = parseVtt(once).diagnostics.filter((d) => d.fix === 'auto')
        expect(autos).toEqual([])
      }),
      { numRuns: 500 }
    )
  })
})
