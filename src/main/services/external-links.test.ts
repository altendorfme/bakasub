import { describe, expect, it } from 'vitest'
import { isAllowedExternalUrl } from './external-links'

describe('isAllowedExternalUrl', () => {
  it.each([
    'https://www.themoviedb.org/signup',
    'https://www.themoviedb.org/settings/api',
    'https://themoviedb.org/',
    'https://openrouter.ai/settings/keys',
    'https://openrouter.ai/settings/credits',
    'https://github.com/lsilvatti',
    'https://buymeacoffee.com/leosilvatto'
  ])('allows %s', (url) => expect(isAllowedExternalUrl(url)).toBe(true))

  it.each([
    'http://www.themoviedb.org/signup',
    'https://evil.com/?u=https://openrouter.ai',
    'https://openrouter.ai.evil.com/',
    'https://gist.github.com/x',
    'https://user:pass@openrouter.ai/',
    'file:///etc/passwd',
    'javascript:alert(1)',
    'https://openrouter.ai:8443/',
    'not a url'
  ])('refuses %s', (url) => expect(isAllowedExternalUrl(url)).toBe(false))
})
