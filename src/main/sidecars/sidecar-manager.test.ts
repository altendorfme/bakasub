import { describe, expect, it, vi } from 'vitest'
import { AppError } from '../errors'
import { SidecarManager } from './sidecar-manager'

vi.mock('../config/remote', () => ({ remote: { sidecarManifestUrl: 'x' } }))

const art = (sha: string): Record<string, unknown> => ({
  linux: {
    x64: { url: `https://h/${sha}`, sha256: sha, archiveType: '7z', binaryRelativePath: 'b' }
  }
})
const manifest = {
  updatedAt: 'now',
  tools: [
    { name: 'ffmpeg', version: '1', artifacts: art('a'.repeat(64)) },
    { name: 'mkvmerge', version: '1', artifacts: art('b'.repeat(64)) }
  ]
}

function make(installUnit: ReturnType<typeof vi.fn>): SidecarManager {
  return new SidecarManager({
    manifests: { load: async () => ({ data: manifest, offline: false }) } as never,
    registry: { read: async () => ({}) } as never,
    installer: { installUnit, collectGarbage: vi.fn(), archiveDir: (s: string) => s } as never,
    consent: { confirmDownload: async () => true },
    dirs: { root: 'r' } as never,
    platform: 'linux',
    arch: 'x64',
    emitProgress: () => {},
    log: { info: vi.fn(), warn: vi.fn(), error: vi.fn() }
  })
}

describe('SidecarManager.install', () => {
  it('falha do ffmpeg não impede o mkvtoolnix e é reportada por unidade', async () => {
    const installUnit = vi.fn(async (u: { tools: Array<{ name: string }> }) => {
      if (u.tools[0].name === 'ffmpeg') throw new AppError('EXTRACT_FAILED', 'EPERM boom')
    })
    const res = await make(installUnit).install(['ffmpeg', 'mkvmerge'])
    expect(installUnit).toHaveBeenCalledTimes(2)
    expect(res).toMatchObject({
      outcome: 'installed',
      tools: ['mkvmerge'],
      failures: [{ tools: ['ffmpeg'], code: 'EXTRACT_FAILED' }]
    })
  })

  it('todas falham: relança o primeiro erro, mas tenta todas', async () => {
    const installUnit = vi.fn(async () => {
      throw new AppError('EXTRACT_FAILED', 'EPERM boom')
    })
    await expect(make(installUnit).install(['ffmpeg', 'mkvmerge'])).rejects.toThrow('EPERM boom')
    expect(installUnit).toHaveBeenCalledTimes(2)
  })
})
