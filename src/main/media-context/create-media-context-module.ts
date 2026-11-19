import { join } from 'node:path'
import type { Database } from '../database/init'
import { MediaCacheRepository } from '../database/repositories/media-cache.repository'
import type { SecretVault } from '../settings/secret-vault'
import { ArtworkCache } from './artwork-cache'
import { CachedMediaProvider } from './cached-provider'
import { MediaContextService } from './media-context.service'
import { TmdbClient } from './tmdb-client'

const ARTWORK_CACHE_BYTES = 200 * 1024 * 1024

/** Composition root of the media-context feature (TMDB). Optional: without a key it is inert. */
export function createMediaContextModule(o: {
  db: Database
  vault: SecretVault
  cacheDir: string
}): {
  tmdb: TmdbClient
  service: MediaContextService
  artwork: ArtworkCache
} {
  const tmdb = new TmdbClient({ credential: () => o.vault.get('tmdb.credential') })
  const service = new MediaContextService({
    provider: new CachedMediaProvider(tmdb, new MediaCacheRepository(o.db)),
    hasKey: () => o.vault.has('tmdb.credential')
  })
  const artwork = new ArtworkCache({
    dir: join(o.cacheDir, 'artwork'),
    maxBytes: ARTWORK_CACHE_BYTES
  })
  return { tmdb, service, artwork }
}
