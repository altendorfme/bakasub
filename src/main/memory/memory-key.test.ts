import { describe, expect, it } from 'vitest'
import { canonicalLang, glossaryHash } from './memory-key'

describe('canonicalLang', () => {
  it('canoniza BCP-47 e mantém a variante', () => {
    expect(canonicalLang('pt-br')).toBe('pt-BR')
    expect(canonicalLang('PT_pt'.replace('_', '-'))).toBe('pt-PT')
    expect(canonicalLang('pt-BR')).not.toBe(canonicalLang('pt-PT'))
  })
  it('tag inválida lança', () => {
    expect(() => canonicalLang('não é tag')).toThrow(RangeError)
  })
})

describe('glossaryHash', () => {
  it("vazio => ''", () => {
    expect(glossaryHash([])).toBe('')
  })
  it('independe da ordem das chaves dos objetos', () => {
    expect(glossaryHash([{ source: 'senpai', rule: 'manter' }])).toBe(
      glossaryHash([{ rule: 'manter', source: 'senpai' }])
    )
  })
  it('a ordem das entradas importa (é a ordem no prompt)', () => {
    const a = { source: 'a', rule: 'x' }
    const b = { source: 'b', rule: 'y' }
    expect(glossaryHash([a, b])).not.toBe(glossaryHash([b, a]))
  })
  it('sha256 hex', () => {
    expect(glossaryHash([{ source: 'a' }])).toMatch(/^[0-9a-f]{64}$/)
  })
})
