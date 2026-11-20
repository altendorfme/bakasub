import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { z } from 'zod'
import { ManifestClient } from './manifest-client'
import { remote } from '../config/remote'
import { sidecarManifestSchema } from './manifest.schema'
import fixture from './__fixtures__/sidecar.json'

const schema = z.object({ v: z.number() })
let dir: string
const log = { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }
const client = (): ManifestClient =>
  new ManifestClient({ cacheDir: dir, timeoutMs: 1000, log: log as never })
const ok = (body: unknown): Response =>
  ({ ok: true, status: 200, json: async () => body }) as Response

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'mc-'))
})
afterEach(async () => {
  vi.unstubAllGlobals()
  await rm(dir, { recursive: true, force: true })
})

describe('ManifestClient', () => {
  it('points at the manifests folder of this repository', () => {
    expect(remote.sidecarManifestUrl).toBe(
      'https://raw.githubusercontent.com/lsilvatti/bakasub/main/manifests/sidecar.json'
    )
    expect('versionManifestUrl' in remote).toBe(false)
  })

  it('loads, validates and serves the real sidecar manifest', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(ok(fixture)))
    const r = await client().load('sidecar', remote.sidecarManifestUrl, sidecarManifestSchema)
    expect(r.offline).toBe(false)
    expect(r.data.tools).toHaveLength(3)
  })

  it('falls back to the cache when the network fails', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(ok({ v: 1 })))
    await client().load('x', 'https://e/x', schema)
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')))
    expect(await client().load('x', 'https://e/x', schema)).toEqual({
      data: { v: 1 },
      offline: true
    })
  })

  it('invalid remote manifest never falls back to the cache', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(ok({ v: 1 })))
    await client().load('x', 'https://e/x', schema)
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(ok({ v: 'bad' })))
    await expect(client().load('x', 'https://e/x', schema)).rejects.toMatchObject({
      code: 'INVALID_MANIFEST'
    })
  })

  it('fails with NETWORK when offline and no cache', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 404 } as Response))
    await expect(client().load('y', 'https://e/y', schema)).rejects.toMatchObject({
      code: 'NETWORK'
    })
  })
})
