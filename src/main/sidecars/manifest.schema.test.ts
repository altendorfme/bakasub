import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { sidecarManifestSchema } from './manifest.schema'

const read = (p: string): unknown => JSON.parse(readFileSync(resolve(p), 'utf8'))

describe('sidecarManifestSchema', () => {
  // O arquivo publicado (consumido via raw.githubusercontent.com) e a fixture precisam validar.
  it.each(['manifests/sidecar.json', 'src/main/sidecars/__fixtures__/sidecar.json'])(
    'validates %s',
    (file) => {
      const parsed = sidecarManifestSchema.parse(read(file))
      expect(parsed.tools.map((t) => t.name)).toEqual(['ffmpeg', 'mkvextract', 'mkvmerge'])
      for (const t of parsed.tools) {
        expect(Object.keys(t.artifacts).sort()).toEqual(['linux', 'win32'])
      }
    }
  )

  it('keeps the published manifest identical to the fixture', () => {
    expect(read('manifests/sidecar.json')).toEqual(
      read('src/main/sidecars/__fixtures__/sidecar.json')
    )
  })

  it('rejects http urls and malformed checksums', () => {
    const m = read('manifests/sidecar.json') as {
      tools: { artifacts: Record<string, Record<string, Record<string, string>>> }[]
    }
    m.tools[0]!.artifacts.linux.x64.url = 'http://example.com/a.zip'
    expect(sidecarManifestSchema.safeParse(m).success).toBe(false)
    const n = read('manifests/sidecar.json') as {
      tools: { artifacts: Record<string, Record<string, Record<string, string>>> }[]
    }
    n.tools[0]!.artifacts.linux.x64.sha256 = 'abc'
    expect(sidecarManifestSchema.safeParse(n).success).toBe(false)
  })
})
