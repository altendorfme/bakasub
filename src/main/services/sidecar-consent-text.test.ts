import { describe, expect, it } from 'vitest'
import { consentLanguage, consentText } from './sidecar-consent-text'

describe('consent dialog language', () => {
  it('setting first, then the system locale, then English', () => {
    expect(consentLanguage('en', 'pt-BR')).toBe('en')
    expect(consentLanguage(null, 'pt-PT')).toBe('pt-BR')
    expect(consentLanguage(null, 'de-DE')).toBe('en')
    expect(consentText('pt-BR').install).toBe('Baixar e instalar')
  })
})
