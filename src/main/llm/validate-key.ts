import { AppError } from '../errors'
import { LlmError, type KeyInfo } from './openrouter-client'

/**
 * Confere uma key candidata em `GET /key` antes de ir para o cofre. Recusada => `LLM_AUTH`;
 * sem rede => `NETWORK` (nada é salvo: o usuário tenta de novo).
 */
export async function validateOpenRouterKey(
  keyInfo: (signal: AbortSignal, key: string) => Promise<KeyInfo>,
  key: string
): Promise<KeyInfo> {
  try {
    return await keyInfo(AbortSignal.timeout(10_000), key)
  } catch (err) {
    if (!(err instanceof LlmError)) throw err
    if (err.kind === 'auth') throw new AppError('LLM_AUTH', 'OpenRouter rejected the API key')
    if (err.kind === 'network' || err.kind === 'timeout' || err.kind === 'aborted')
      throw new AppError('NETWORK', 'OpenRouter unreachable while checking the key', { cause: err })
    throw new AppError('LLM_UNAVAILABLE', `Could not check the key: ${err.message}`)
  }
}
