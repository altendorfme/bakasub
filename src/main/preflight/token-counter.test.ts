import { describe, expect, it } from 'vitest'
import { countMessageTokens, countTokens, isExactTokenizer } from './token-counter'

describe('countTokens (o200k_base)', () => {
  it('determinístico e plausível', () => {
    expect(countTokens('')).toBe(0)
    expect(countTokens('Hello world')).toBe(2)
    expect(countTokens('Hello world')).toBe(countTokens('Hello world'))
    expect(countTokens('私は学生です')).toBeGreaterThan(1)
  })
  it('mensagens: conteúdo + overhead por mensagem', () => {
    const n = countMessageTokens([
      { role: 'system', content: 'Hello world' },
      { role: 'user', content: 'Hello world' }
    ])
    expect(n).toBe(2 + 2 + 2 * 4 + 3)
  })
})

describe('isExactTokenizer', () => {
  it('só a família GPT é exata', () => {
    expect(isExactTokenizer('GPT')).toBe(true)
    expect(isExactTokenizer('Claude')).toBe(false)
    expect(isExactTokenizer(undefined)).toBe(false)
  })
})
