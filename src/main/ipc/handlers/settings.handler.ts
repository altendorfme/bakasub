import { z } from 'zod'
import type { ApiKeyStatus } from '../../../shared/ipc-contract'
import type { SecretVault } from '../../settings/secret-vault'
import { createHandler } from '../create-handler'

const apiKeyInput = z.object({
  // Sem formato rígido (a OpenRouter pode mudar o prefixo); só limites e sem espaços/controles.
  apiKey: z
    .string()
    .trim()
    .min(8)
    .max(512)
    .regex(/^[\x21-\x7e]+$/)
})

export function registerSettingsHandlers(deps: { vault: SecretVault }): void {
  const status = async (): Promise<ApiKeyStatus> => ({
    present: await deps.vault.has('openrouter.apiKey'),
    protection: deps.vault.protection
  })
  createHandler('settings:set-api-key', {
    input: apiKeyInput,
    handle: async ({ apiKey }) => {
      await deps.vault.set('openrouter.apiKey', apiKey)
      return status()
    }
  })
  createHandler('settings:clear-api-key', {
    handle: async () => {
      await deps.vault.delete('openrouter.apiKey')
      return status()
    }
  })
  createHandler('settings:api-key-status', { handle: status })
}
