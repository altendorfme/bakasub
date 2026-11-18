import { describe, expect, it } from 'vitest'
import { parseTimingLine } from './timing-line'

describe('parseTimingLine', () => {
  it('linha canônica, sem quirks', () => {
    const r = parseTimingLine('00:01:02,345 --> 00:01:05,000')!
    expect(r.start).toEqual({ ms: 62345, raw: '00:01:02,345' })
    expect(r.end).toEqual({ ms: 65000, raw: '00:01:05,000' })
    expect(r.extras).toBe('')
    expect(r.quirks).toEqual({ dotSeparator: false, padding: false, arrowSpacing: false })
  })

  it('horas além de 99 e hora com 3 dígitos continuam canônicas', () => {
    expect(parseTimingLine('100:00:00,000 --> 100:00:01,000')!.quirks.padding).toBe(false)
    expect(parseTimingLine('100:00:00,000 --> 100:00:01,000')!.start.ms).toBe(360_000_000)
  })

  it('ponto como separador de milésimos', () => {
    const r = parseTimingLine('00:00:01.500 --> 00:00:02.000')!
    expect(r.start.ms).toBe(1500)
    expect(r.quirks.dotSeparator).toBe(true)
  })

  it.each([
    ['0:00:01,000 --> 0:00:02,000', 1000],
    ['00:00:01,5 --> 00:00:02,50', 1005],
    ['00:00:01 --> 00:00:02', 1000],
    ['00:0:1,000 --> 00:0:2,000', 1000]
  ])('padding irregular: %s', (line, startMs) => {
    const r = parseTimingLine(line)!
    expect(r.quirks.padding).toBe(true)
    expect(r.start.ms).toBe(startMs)
  })

  it('fração é milissegundo inteiro: ",5" = 5 ms', () => {
    expect(parseTimingLine('00:00:00,5 --> 00:00:01,000')!.start.ms).toBe(5)
  })

  it.each([
    '00:00:01,000-->00:00:02,000',
    '00:00:01,000  -->  00:00:02,000',
    ' 00:00:01,000 --> 00:00:02,000'
  ])('espaçamento irregular da seta: %j', (line) => {
    expect(parseTimingLine(line)!.quirks.arrowSpacing).toBe(true)
  })

  it('preserva coordenadas após o timecode final', () => {
    const r = parseTimingLine('00:00:01,000 --> 00:00:02,000 X1:100 X2:200 Y1:10 Y2:20')!
    expect(r.extras).toBe(' X1:100 X2:200 Y1:10 Y2:20')
    expect(r.end.ms).toBe(2000)
  })

  it('espaço final vira extras só com whitespace', () => {
    expect(parseTimingLine('00:00:01,000 --> 00:00:02,000  ')!.extras).toBe('  ')
  })

  it('fim antes do início ainda é parseado (relato fica para o parser)', () => {
    const r = parseTimingLine('00:00:05,000 --> 00:00:02,000')!
    expect(r.end.ms).toBeLessThan(r.start.ms)
  })

  it.each([
    '',
    'Olá',
    '00:00:01,000 -> 00:00:02,000',
    '00:00:01,000 --> abc',
    '00:00:01,0001 --> 00:00:02,000',
    '--> 00:00:02,000',
    '12'
  ])('rejeita %j', (line) => {
    expect(parseTimingLine(line)).toBeNull()
  })
})
