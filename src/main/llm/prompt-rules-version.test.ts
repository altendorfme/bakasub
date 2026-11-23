import { createHash } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { languageNoteTags } from './language-notes'
import { buildSystemPrompt, PROMPT_RULES_VERSION } from './prompt-builder'

/**
 * Impressão digital do texto fixo do System Prompt: regras, notas de cada idioma e os
 * invólucros de glossário/estilo/mídia (com conteúdo de amostra constante).
 */
function rulesFingerprint(): string {
  const langs = [...languageNoteTags(), 'ja']
  const variants = langs.map((targetLang) => buildSystemPrompt({ targetLang, glossary: [] }))
  variants.push(
    buildSystemPrompt({
      targetLang: 'pt-BR',
      sourceLang: 'en',
      glossary: [{ source: 'A', target: 'B', rule: 'R' }, { source: 'C' }],
      stylePrompt: 'S',
      media: 'M'
    })
  )
  return createHash('sha256').update(variants.join('\0'), 'utf8').digest('hex')
}

/**
 * Histórico: versão -> impressão digital do texto fixo nessa versão. Mudou o texto do prompt
 * (ou de `language-notes.ts`)? Incremente `PROMPT_RULES_VERSION` e acrescente a nova linha aqui.
 * Nunca edite uma linha existente: isso reaproveitaria no cache traduções feitas com outras regras.
 */
const FINGERPRINTS: Readonly<Record<number, string>> = {
  1: '1c690d5fd6fe6cc6ef57f770636ea74076754c46b9c68576d20786e66c53ea4a',
  2: 'e5a6df741dce558e16c61b5e27ceb1ca1fe6a6bb835b07e83a49e84b09fa8062'
}

describe('PROMPT_RULES_VERSION', () => {
  it('o texto fixo do System Prompt corresponde à versão atual (mudou o texto? incremente a versão)', () => {
    expect({ version: PROMPT_RULES_VERSION, fingerprint: rulesFingerprint() }).toEqual({
      version: PROMPT_RULES_VERSION,
      fingerprint: FINGERPRINTS[PROMPT_RULES_VERSION]
    })
  })
  it('cada versão tem um texto distinto', () => {
    const values = Object.values(FINGERPRINTS)
    expect(new Set(values).size).toBe(values.length)
  })
})
