import { describe, expect, it } from 'vitest'
import { formatAssTime, parseAssTime } from './time'

describe('parseAssTime', () => {
  it('H:MM:SS.cc canônico', () => {
    expect(parseAssTime('0:01:02.50')).toEqual({
      timecode: { ms: 62500, raw: '0:01:02.50' },
      canonical: true
    })
  })
  it('horas com mais de um dígito continuam canônicas', () => {
    expect(parseAssTime('10:00:00.00')?.timecode.ms).toBe(36_000_000)
  })
  it('frações de 1 e 3 dígitos são legíveis mas não canônicas', () => {
    expect(parseAssTime('0:00:01.5')).toMatchObject({ timecode: { ms: 1500 }, canonical: false })
    expect(parseAssTime('0:00:01.123')).toMatchObject({ timecode: { ms: 1123 }, canonical: false })
  })
  it('sem fração e com espaços: legível, não canônico, raw preservado', () => {
    expect(parseAssTime(' 0:00:01 ')).toEqual({
      timecode: { ms: 1000, raw: ' 0:00:01 ' },
      canonical: false
    })
  })
  it('lixo é null', () => {
    for (const s of ['', 'abc', '1:2', '0:00:01,00', '0:00:01.0000', '-0:00:01.00'])
      expect(parseAssTime(s)).toBeNull()
  })
})

describe('formatAssTime', () => {
  it('trunca para centésimos', () => {
    expect(formatAssTime(62_509)).toBe('0:01:02.50')
    expect(formatAssTime(0)).toBe('0:00:00.00')
    expect(formatAssTime(36_000_000)).toBe('10:00:00.00')
  })
})
