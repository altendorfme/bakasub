import { describe, expect, it } from 'vitest'
import { effectiveLanguage, resolveAppLanguage } from './language'

describe('app language', () => {
  it('resolves the requested language to a supported one', () => {
    expect(resolveAppLanguage('pt-BR')).toBe('pt-BR')
    expect(resolveAppLanguage('pt-PT')).toBe('pt-BR')
    expect(resolveAppLanguage('en-GB')).toBe('en')
    expect(resolveAppLanguage('ja')).toBe('en')
    expect(resolveAppLanguage(null)).toBe('en')
  })
  it('the setting wins; null follows the system', () => {
    expect(effectiveLanguage('en', 'pt-BR')).toBe('en')
    expect(effectiveLanguage(null, 'pt-BR')).toBe('pt-BR')
    expect(effectiveLanguage(null, 'de-DE')).toBe('en')
  })
})
