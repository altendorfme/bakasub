import { mkdir, readdir, rename, rm, stat, utimes, writeFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { AppError } from '../errors'
import { ARTWORK_SIZES, type ArtworkSize } from './tmdb-client'

const CDN = 'https://image.tmdb.org/t/p'
const MAX_IMAGE_BYTES = 10 * 1024 * 1024
const FILE = /^[A-Za-z0-9_-]+\.(?:jpg|jpeg|png|webp)$/
const CONTENT_TYPES: Readonly<Record<string, string>> = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp'
}

/**
 * `bakasub-media://tmdb/<size>/<file>` -> what to serve. Anything else (other host, size, path
 * segments, encoded slashes, other extensions) is rejected: the URL comes from the renderer.
 */
export function parseArtworkUrl(raw: string): { size: ArtworkSize; file: string } | null {
  let url: URL
  try {
    url = new URL(raw)
  } catch {
    return null
  }
  if (url.protocol !== 'bakasub-media:' || url.hostname !== 'tmdb') return null
  const m = /^\/([a-z0-9]+)\/([^/]+)$/.exec(url.pathname)
  if (!m) return null
  const size = m[1] as ArtworkSize
  if (!ARTWORK_SIZES.includes(size) || !FILE.test(m[2])) return null
  return { size, file: m[2] }
}

/**
 * Disk cache for TMDB artwork in `userData/cache/artwork`, filled on demand by the
 * `bakasub-media:` protocol. The renderer never touches the network. LRU by mtime (touched on
 * every hit), capped at `maxBytes`.
 */
export class ArtworkCache {
  private readonly inflight = new Map<string, Promise<{ path: string; contentType: string }>>()
  private readonly fetch: typeof fetch

  constructor(private readonly o: { dir: string; maxBytes: number; fetch?: typeof fetch }) {
    this.fetch = o.fetch ?? globalThis.fetch
  }

  get(size: ArtworkSize, file: string): Promise<{ path: string; contentType: string }> {
    if (!ARTWORK_SIZES.includes(size) || !FILE.test(file))
      return Promise.reject(new AppError('INVALID_INPUT', 'Invalid artwork reference'))
    const name = `${size}_${file}`
    const path = join(this.o.dir, name)
    const contentType = CONTENT_TYPES[file.split('.').pop()!.toLowerCase()]
    const pending = this.inflight.get(name)
    if (pending) return pending
    const task = (async () => {
      if (existsSync(path)) {
        const now = new Date()
        await utimes(path, now, now).catch(() => undefined)
        return { path, contentType }
      }
      await this.download(`${CDN}/${size}/${file}`, path)
      await this.evict(name)
      return { path, contentType }
    })().finally(() => this.inflight.delete(name))
    this.inflight.set(name, task)
    return task
  }

  private async download(url: string, path: string): Promise<void> {
    const res = await this.fetch(url, { signal: AbortSignal.timeout(15_000) }).catch((err) => {
      throw new AppError('NETWORK', 'TMDB image CDN unreachable', { cause: err })
    })
    const type = res.headers.get('content-type') ?? ''
    if (!res.ok || !type.startsWith('image/'))
      throw new AppError('NETWORK', `Artwork download failed (${res.status} ${type})`)
    const body = new Uint8Array(await res.arrayBuffer())
    if (body.byteLength > MAX_IMAGE_BYTES) throw new AppError('NETWORK', 'Artwork too large')
    await mkdir(this.o.dir, { recursive: true })
    const partial = `${path}.partial`
    await writeFile(partial, body)
    await rename(partial, path)
  }

  /** Deletes least recently used files until the cache fits. Never deletes `keep`. */
  private async evict(keep: string): Promise<void> {
    const names = await readdir(this.o.dir).catch(() => [] as string[])
    const files = await Promise.all(
      names
        .filter((n) => !n.endsWith('.partial'))
        .map(async (n) => {
          const s = await stat(join(this.o.dir, n))
          return { n, size: s.size, used: s.mtimeMs }
        })
    )
    let total = files.reduce((sum, f) => sum + f.size, 0)
    for (const f of files.sort((a, b) => a.used - b.used)) {
      if (total <= this.o.maxBytes) break
      if (f.n === keep) continue
      await rm(join(this.o.dir, f.n), { force: true })
      total -= f.size
    }
  }
}
