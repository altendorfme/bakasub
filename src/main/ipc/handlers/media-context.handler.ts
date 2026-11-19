import { z } from 'zod'
import type { TmdbKeyStatus } from '../../../shared/ipc-contract'
import { redactor } from '../../logging/logger'
import type { MediaContextService } from '../../media-context/media-context.service'
import type { TmdbClient } from '../../media-context/tmdb-client'
import type { SecretVault } from '../../settings/secret-vault'
import { createHandler } from '../create-handler'

const Ref = z.object({
  provider: z.literal('tmdb'),
  id: z.number().int().positive(),
  kind: z.enum(['movie', 'series'])
})
const Num = z.number().int().min(0).max(9999)

export function registerMediaContextHandlers(deps: {
  vault: SecretVault
  tmdb: TmdbClient
  mediaContext: MediaContextService
}): void {
  const status = async (): Promise<TmdbKeyStatus> => ({
    present: await deps.vault.has('tmdb.credential')
  })

  createHandler('settings:set-tmdb-key', {
    // v3 key (32 hex) or v4 read access token (JWT); printable ASCII, no spaces.
    input: z.object({
      key: z
        .string()
        .trim()
        .min(16)
        .max(1024)
        .regex(/^[\x21-\x7e]+$/)
    }),
    handle: async ({ key }) => {
      redactor.add(key)
      await deps.tmdb.validate(key)
      await deps.vault.set('tmdb.credential', key)
      return status()
    }
  })
  createHandler('settings:clear-tmdb-key', {
    handle: async () => {
      await deps.vault.delete('tmdb.credential')
      return status()
    }
  })
  createHandler('settings:tmdb-key-status', { handle: status })

  createHandler('media:identify', {
    input: z.object({ name: z.string().min(1).max(1024) }),
    handle: ({ name }) => deps.mediaContext.identify(name)
  })
  createHandler('media:search', {
    input: z.object({ query: z.string().trim().min(1).max(200) }),
    handle: ({ query }) => deps.mediaContext.search(query)
  })
  createHandler('media:lookup', {
    input: z.object({ ref: Ref, season: Num.optional(), episode: Num.optional() }),
    handle: ({ ref, season, episode }) => deps.mediaContext.lookup(ref, { season, episode })
  })
}
