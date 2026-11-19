import { describe, expect, it } from 'vitest'
import {
  getGuide,
  GUIDE_IDS,
  GUIDE_LANGS,
  guideFiles,
  guideIdFromHref,
  resolveGuideLang
} from './guides'

describe('guides', () => {
  it('every guide exists in every language, and nothing else is bundled', () => {
    const expected = GUIDE_LANGS.flatMap((l) => GUIDE_IDS.map((id) => `./${l}/${id}.md`))
    expect([...guideFiles()].sort()).toEqual(expected.sort())
  })

  it('every guide starts with a title, and cross-links point to existing guides', () => {
    for (const lang of GUIDE_LANGS)
      for (const id of GUIDE_IDS) {
        const { markdown } = getGuide(id, lang)
        expect(markdown, `${lang}/${id}`).toMatch(/^# \S/)
        for (const m of markdown.matchAll(/\]\((\.\/[^)]+\.md)\)/g))
          expect(guideIdFromHref(m[1]), `${lang}/${id} -> ${m[1]}`).not.toBeNull()
      }
  })

  it('serves the app language, its base language, or English', () => {
    expect(resolveGuideLang('pt-BR')).toBe('pt-BR')
    expect(resolveGuideLang('pt')).toBe('pt-BR')
    expect(resolveGuideLang('pt-PT')).toBe('pt-BR')
    expect(resolveGuideLang('en-US')).toBe('en')
    expect(resolveGuideLang('ja')).toBe('en')
    expect(resolveGuideLang(undefined)).toBe('en')
    expect(getGuide('tmdb-key', 'pt-BR').markdown).toContain('Como conseguir uma key do TMDB')
    expect(getGuide('tmdb-key', 'en').markdown).toContain('Getting a TMDB key')
  })

  it('guideIdFromHref: only links to known guides', () => {
    expect(guideIdFromHref('./openrouter-limits.md')).toBe('openrouter-limits')
    expect(guideIdFromHref('tmdb-key.md#privacy')).toBe('tmdb-key')
    expect(guideIdFromHref('./nope.md')).toBeNull()
    expect(guideIdFromHref('https://openrouter.ai/')).toBeNull()
    expect(guideIdFromHref('../docs/llm.md')).toBeNull()
  })
})
