import { describe, expect, it } from 'vitest'
import { canonicalLang, promptHash } from './memory-key'

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

describe('promptHash', () => {
  it("vazio => ''", () => {
    expect(promptHash([])).toBe('')
    expect(promptHash([], '   ')).toBe('')
  })
  it('independe da ordem das chaves dos objetos', () => {
    expect(promptHash([{ source: 'senpai', rule: 'manter' }])).toBe(
      promptHash([{ rule: 'manter', source: 'senpai' }])
    )
  })
  it('a ordem das entradas importa (é a ordem no prompt)', () => {
    const a = { source: 'a', rule: 'x' }
    const b = { source: 'b', rule: 'y' }
    expect(promptHash([a, b])).not.toBe(promptHash([b, a]))
  })
  it('o estilo do preset separa caches; espaços nas bordas não', () => {
    expect(promptHash([], 'Anime')).not.toBe(promptHash([], 'Documentary'))
    expect(promptHash([], ' Anime ')).toBe(promptHash([], 'Anime'))
    expect(promptHash([{ source: 'a' }])).toMatch(/^[0-9a-f]{64}$/)
  })
})
