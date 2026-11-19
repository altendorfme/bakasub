import { readFile } from 'node:fs/promises'
import { parseArtworkUrl } from './artwork-cache'
import type { ArtworkSize } from './tmdb-client'

/** Request handler for `protocol.handle('bakasub-media', …)`. No Electron import: tested in Node. */
export function artworkProtocolHandler(cache: {
  get(size: ArtworkSize, file: string): Promise<{ path: string; contentType: string }>
}): (req: Request) => Promise<Response> {
  return async (req) => {
    const ref = parseArtworkUrl(req.url)
    if (!ref) return new Response(null, { status: 404 })
    try {
      const { path, contentType } = await cache.get(ref.size, ref.file)
      return new Response(new Uint8Array(await readFile(path)), {
        headers: {
          'content-type': contentType,
          // TMDB image files are content-addressed: a name never changes content.
          'cache-control': 'public, max-age=31536000, immutable'
        }
      })
    } catch {
      return new Response(null, { status: 502 })
    }
  }
}
