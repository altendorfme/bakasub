import { eq } from 'drizzle-orm'
import type { Database } from '../init'
import { mediaCache } from '../schema'

/** Acesso cru a `media_cache`. Política de TTL fica no `CachedMediaProvider`. */
export class MediaCacheRepository {
  constructor(private readonly db: Database) {}

  async get(key: string): Promise<{ value: unknown; fetchedAt: number } | null> {
    const [row] = await this.db.select().from(mediaCache).where(eq(mediaCache.key, key))
    return row ? { value: row.value, fetchedAt: row.fetchedAt.getTime() } : null
  }

  async set(key: string, value: unknown, fetchedAt: number): Promise<void> {
    const at = new Date(fetchedAt)
    await this.db
      .insert(mediaCache)
      .values({ key, value, fetchedAt: at })
      .onConflictDoUpdate({ target: mediaCache.key, set: { value, fetchedAt: at } })
  }
}
