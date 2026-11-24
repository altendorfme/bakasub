import { describe, expect, it } from 'vitest'
import { isOnboarded } from './onboarding'

describe('isOnboarded', () => {
  const full = { apiKeyPresent: true, defaultModel: 'm', defaultTargetLang: 'pt-BR' }

  it('requires the key, the default model and the default language', () => {
    expect(isOnboarded(full)).toBe(true)
    expect(isOnboarded({ ...full, apiKeyPresent: false })).toBe(false)
    expect(isOnboarded({ ...full, defaultModel: null })).toBe(false)
    expect(isOnboarded({ ...full, defaultTargetLang: '' })).toBe(false)
    expect(isOnboarded({ ...full, defaultTargetLang: undefined })).toBe(false)
  })
})
