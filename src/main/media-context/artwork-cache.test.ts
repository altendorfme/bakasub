import { existsSync, mkdtempSync, readdirSync, rmSync, utimesSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ArtworkCache, parseArtworkUrl } from './artwork-cache'

let dir: string
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'bakasub-art-'))
})
afterEach(() => rmSync(dir, { recursive: true, force: true }))

const png = (bytes: number): Response =>
  new Response(new Uint8Array(bytes), { headers: { 'content-type': 'image/jpeg' } })

describe('parseArtworkUrl', () => {
  it('accepts only known sizes and plain file names', () => {
    expect(parseArtworkUrl('bakasub-media://tmdb/w342/abc_D-1.jpg')).toEqual({
      size: 'w342',
      file: 'abc_D-1.jpg'
    })
    for (const bad of [
      'bakasub-media://tmdb/original/a.jpg',
      'bakasub-media://tmdb/w342/../secret.jpg',
      'bakasub-media://tmdb/w342/a.svg',
      'bakasub-media://other/w342/a.jpg',
      'https://image.tmdb.org/t/p/w342/a.jpg',
      'bakasub-media://tmdb/w342/a%2F..%2Fb.jpg'
    ])
      expect(parseArtworkUrl(bad), bad).toBeNull()
  })
})

describe('ArtworkCache', () => {
  it('downloads once from the TMDB CDN, then serves from disk', async () => {
    const fetch = vi.fn(async () => png(10))
    const cache = new ArtworkCache({
      dir,
      maxBytes: 1000,
      fetch: fetch as unknown as typeof globalThis.fetch
    })
    const a = await cache.get('w342', 'p.jpg')
    const b = await cache.get('w342', 'p.jpg')
    expect(fetch).toHaveBeenCalledTimes(1)
    expect(String((fetch.mock.calls[0] as unknown[])[0])).toBe(
      'https://image.tmdb.org/t/p/w342/p.jpg'
    )
    expect(a).toEqual({ path: join(dir, 'w342_p.jpg'), contentType: 'image/jpeg' })
    expect(b).toEqual(a)
  })

  it('concurrent requests for the same image share one download', async () => {
    const fetch = vi.fn(async () => png(10))
    const cache = new ArtworkCache({
      dir,
      maxBytes: 1000,
      fetch: fetch as unknown as typeof globalThis.fetch
    })
    await Promise.all([cache.get('w92', 'x.jpg'), cache.get('w92', 'x.jpg')])
    expect(fetch).toHaveBeenCalledTimes(1)
  })

  it('evicts least recently used files beyond the size cap', async () => {
    const fetch = vi.fn(async () => png(400))
    const cache = new ArtworkCache({
      dir,
      maxBytes: 1000,
      fetch: fetch as unknown as typeof globalThis.fetch
    })
    await cache.get('w92', 'a.jpg')
    await cache.get('w92', 'b.jpg')
    // `a` used long ago, `b` recently.
    utimesSync(join(dir, 'w92_a.jpg'), new Date(1000), new Date(1000))
    await cache.get('w92', 'c.jpg')
    expect(readdirSync(dir).sort()).toEqual(['w92_b.jpg', 'w92_c.jpg'])
  })

  it('a non-image or failed response is an error and leaves nothing behind', async () => {
    const fetch = vi.fn(
      async () => new Response('<html>', { headers: { 'content-type': 'text/html' } })
    )
    const cache = new ArtworkCache({
      dir,
      maxBytes: 1000,
      fetch: fetch as unknown as typeof globalThis.fetch
    })
    await expect(cache.get('w92', 'a.jpg')).rejects.toThrow()
    fetch.mockResolvedValueOnce(new Response(null, { status: 404 }))
    await expect(cache.get('w92', 'b.jpg')).rejects.toThrow()
    expect(readdirSync(dir)).toEqual([])
    expect(existsSync(join(dir, 'w92_a.jpg'))).toBe(false)
  })
})
