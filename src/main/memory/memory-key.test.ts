import { describe, expect, it } from 'vitest'
import { PROMPT_RULES_VERSION } from '../llm/prompt-builder'
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
  it('nunca vazio: a versão das regras sempre entra', () => {
    expect(promptHash([])).toMatch(/^[0-9a-f]{64}$/)
    expect(promptHash([], '   ')).toBe(promptHash([]))
  })
  it('mudar a versão das regras muda o hash, mesmo sem glossário e estilo', () => {
    expect(promptHash([], '', PROMPT_RULES_VERSION)).toBe(promptHash([]))
    expect(promptHash([], '', PROMPT_RULES_VERSION + 1)).not.toBe(promptHash([]))
    const g = [{ source: 'senpai' }]
    expect(promptHash(g, 'Anime', 1)).not.toBe(promptHash(g, 'Anime', 2))
  })
  it('mesmo glossário, estilo e versão => mesmo hash (presets compartilham cache)', () => {
    const g = [{ source: 'senpai', rule: 'manter' }]
    expect(promptHash([...g], 'Anime')).toBe(promptHash([...g], 'Anime'))
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
