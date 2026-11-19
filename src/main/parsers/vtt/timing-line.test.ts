import { describe, expect, it } from 'vitest'
import { formatVttTimestamp, parseVttTiming } from './timing-line'

describe('parseVttTiming', () => {
  it('aceita mm:ss.ttt e hh:mm:ss.ttt e guarda as configurações cruas', () => {
    const t = parseVttTiming('00:01.500 --> 01:02:03.004 align:start position:10%')!
    expect(t.start).toEqual({ ms: 1500, raw: '00:01.500' })
    expect(t.end).toEqual({ ms: 3_723_004, raw: '01:02:03.004' })
    expect(t.settings).toBe(' align:start position:10%')
    expect(t.quirks.format).toBe(false)
  })

  it('sem configurações, `settings` é vazio', () => {
    expect(parseVttTiming('00:01.000 --> 00:02.000')!.settings).toBe('')
  })

  it('vírgula, padding e espaçamento fora do canônico viram quirk de formato', () => {
    for (const line of [
      '00:00:01,000 --> 00:00:02,000',
      '0:01.000 --> 00:02.000',
      '00:01.5 --> 00:02.000',
      '00:01 --> 00:02.000',
      '00:01.000-->00:02.000',
      ' 00:01.000 --> 00:02.000'
    ]) {
      expect(parseVttTiming(line)?.quirks.format, line).toBe(true)
    }
  })

  it('a vírgula SRT é lida como separador de milissegundos', () => {
    expect(parseVttTiming('00:00:01,250 --> 00:00:02,000')!.start.ms).toBe(1250)
  })

  it('rejeita linhas que não são timing', () => {
    for (const line of ['', 'texto --> outro', '00:01.000 -> 00:02.000', 'NOTE 00:01.000'])
      expect(parseVttTiming(line), line).toBeNull()
  })

  it('configurações coladas ao timestamp não são aceitas (exigem espaço)', () => {
    expect(parseVttTiming('00:01.000 --> 00:02.000align:start')).toBeNull()
  })
})

describe('formatVttTimestamp', () => {
  it('omite a hora abaixo de 1h, a menos que pedida', () => {
    expect(formatVttTimestamp(1500, false)).toBe('00:01.500')
    expect(formatVttTimestamp(1500, true)).toBe('00:00:01.500')
    expect(formatVttTimestamp(3_723_004, false)).toBe('01:02:03.004')
  })
})
