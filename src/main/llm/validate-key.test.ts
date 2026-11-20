import { describe, expect, it } from 'vitest'
import { LlmError } from './openrouter-client'
import { validateOpenRouterKey } from './validate-key'

const failing = (kind: ConstructorParameters<typeof LlmError>[0]) => async () => {
  throw new LlmError(kind, kind)
}

describe('validateOpenRouterKey', () => {
  it('passes the candidate key and returns the account info', async () => {
    let seen = ''
    const info = await validateOpenRouterKey(async (_s, key) => {
      seen = key
      return { isFreeTier: true, freeDaily: null }
    }, 'sk-or-v1-x')
    expect(seen).toBe('sk-or-v1-x')
    expect(info.isFreeTier).toBe(true)
  })
  it.each([
    ['auth', 'LLM_AUTH'],
    ['network', 'NETWORK'],
    ['timeout', 'NETWORK'],
    ['server', 'LLM_UNAVAILABLE']
  ] as const)('%s => %s', async (kind, code) => {
    await expect(validateOpenRouterKey(failing(kind), 'k')).rejects.toMatchObject({ code })
  })
})
