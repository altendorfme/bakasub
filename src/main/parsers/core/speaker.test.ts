import { describe, expect, it } from 'vitest'
import { isGenericActor, speakerOf } from './speaker'

describe('speakerOf', () => {
  it('nome real: normalizado (trim, espaços colapsados)', () => {
    expect(speakerOf('  Kamina ')).toBe('Kamina')
    expect(speakerOf('Yoko\t  Littner')).toBe('Yoko Littner')
  })
  it('ausente, vazio, genérico ou sem letras: undefined', () => {
    for (const v of [
      undefined,
      '',
      '   ',
      'Default',
      'NTP',
      'main',
      ' MAIN ',
      'Signs',
      'TL Note',
      '---',
      '1',
      '??'
    ])
      expect(speakerOf(v), String(v)).toBeUndefined()
  })
  it('isGenericActor só aceita nomes com letra fora da lista', () => {
    expect(isGenericActor('Simon')).toBe(false)
    expect(isGenericActor('Narrator')).toBe(false)
    expect(isGenericActor('default')).toBe(true)
  })
})
