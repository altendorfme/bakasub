import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AppError } from '../errors'
import { artworkProtocolHandler } from './artwork-protocol'

let dir: string
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'bakasub-proto-'))
})
afterEach(() => rmSync(dir, { recursive: true, force: true }))

describe('artworkProtocolHandler', () => {
  it('serves the cached file with its content type and a long cache header', async () => {
    const path = join(dir, 'w342_p.jpg')
    writeFileSync(path, Buffer.from([1, 2, 3]))
    const get = vi.fn(async () => ({ path, contentType: 'image/jpeg' }))
    const res = await artworkProtocolHandler({ get })(
      new Request('bakasub-media://tmdb/w342/p.jpg')
    )
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toBe('image/jpeg')
    expect(res.headers.get('cache-control')).toContain('max-age')
    expect(new Uint8Array(await res.arrayBuffer())).toEqual(new Uint8Array([1, 2, 3]))
    expect(get).toHaveBeenCalledWith('w342', 'p.jpg')
  })

  it('invalid URLs never reach the cache (404)', async () => {
    const get = vi.fn()
    const res = await artworkProtocolHandler({ get })(
      new Request('bakasub-media://tmdb/w342/../x.jpg')
    )
    expect(res.status).toBe(404)
    expect(get).not.toHaveBeenCalled()
  })

  it('download failures become 502 (the UI shows its placeholder)', async () => {
    const get = vi.fn(async () => {
      throw new AppError('NETWORK', 'offline')
    })
    const res = await artworkProtocolHandler({ get })(new Request('bakasub-media://tmdb/w92/p.jpg'))
    expect(res.status).toBe(502)
  })
})
