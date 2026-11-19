import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { MediaDetails, MediaRef } from '../../shared/ipc-contract'
import { MediaCacheRepository } from '../database/repositories/media-cache.repository'
import { openTestDatabase } from '../database/test-db'
import { AppError } from '../errors'
import { CachedMediaProvider, type MediaProvider } from './cached-provider'

const DAY = 24 * 60 * 60 * 1000
const ref: MediaRef = { provider: 'tmdb', id: 1, kind: 'movie' }
const details: MediaDetails = { ...ref, title: 'A', genres: [], synopsis: 's' }

let t: Awaited<ReturnType<typeof openTestDatabase>>
let now: number
let upstream: { [K in keyof MediaProvider]: ReturnType<typeof vi.fn> }
let cached: CachedMediaProvider

beforeEach(async () => {
  t = await openTestDatabase()
  now = 1_000_000
  upstream = {
    search: vi.fn(async () => [details]),
    details: vi.fn(async () => details),
    episode: vi.fn(async () => ({ season: 1, episode: 2, title: 'E' }))
  }
  cached = new CachedMediaProvider(
    upstream as unknown as MediaProvider,
    new MediaCacheRepository(t.db),
    {
      now: () => now
    }
  )
})
afterEach(() => t.close())

describe('CachedMediaProvider', () => {
  it('details are cached for 30 days', async () => {
    await cached.details(ref)
    now += 29 * DAY
    await cached.details(ref)
    expect(upstream.details).toHaveBeenCalledTimes(1)
    now += 2 * DAY
    await cached.details(ref)
    expect(upstream.details).toHaveBeenCalledTimes(2)
  })

  it('searches are cached for 1 day, keyed by the normalized query', async () => {
    await cached.search('Frieren ')
    await cached.search('frieren')
    expect(upstream.search).toHaveBeenCalledTimes(1)
    now += DAY + 1
    await cached.search('frieren')
    expect(upstream.search).toHaveBeenCalledTimes(2)
  })

  it('offline: an expired entry is still served', async () => {
    await cached.details(ref)
    now += 90 * DAY
    upstream.details.mockRejectedValue(new AppError('NETWORK', 'down'))
    expect(await cached.details(ref)).toEqual(details)
  })

  it('offline with nothing cached: the error propagates', async () => {
    upstream.episode.mockRejectedValue(new AppError('NETWORK', 'down'))
    await expect(cached.episode(1, 1, 2)).rejects.toMatchObject({ code: 'NETWORK' })
  })

  it('auth errors are never masked by stale data', async () => {
    await cached.details(ref)
    now += 90 * DAY
    upstream.details.mockRejectedValue(new AppError('TMDB_AUTH', 'bad key'))
    await expect(cached.details(ref)).rejects.toMatchObject({ code: 'TMDB_AUTH' })
  })

  it('"not found" (null) is not cached', async () => {
    upstream.episode.mockResolvedValueOnce(null)
    expect(await cached.episode(1, 9, 9)).toBeNull()
    await cached.episode(1, 9, 9)
    expect(upstream.episode).toHaveBeenCalledTimes(2)
  })
})
