import { mkdir, mkdtemp, readdir, rm, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AppError } from '../errors'
import { realFs, type FsOps } from './fs-resilient'
import { SidecarInstaller } from './sidecar-installer'
import type { InstallUnit } from './types'

vi.mock('./downloader', () => ({
  downloadVerified: vi.fn(async (o: { destFile: string }) => {
    await writeFile(o.destFile, 'archive')
  })
}))

const unit: InstallUnit = {
  url: 'https://x/y.7z',
  sha256: 'a'.repeat(64),
  archiveType: '7z',
  tools: [{ name: 'ffmpeg', version: '1', binaryRelativePath: 'bin/ffmpeg' }]
}

const eperm = (): Error =>
  Object.assign(new Error('operation not permitted, rename'), { code: 'EPERM' })
const ebusy = (): Error =>
  Object.assign(new Error('resource busy or locked, unlink'), { code: 'EBUSY' })

describe('SidecarInstaller (escada de recuo no Windows)', () => {
  let dir: string
  const log = { info: vi.fn(), warn: vi.fn(), error: vi.fn() }
  const sleep = vi.fn(async () => {})
  const runner = { run: vi.fn(async () => ({ code: 0, stderr: '' })) }
  const registry = { read: vi.fn(async () => ({})), update: vi.fn(async () => {}) }

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'inst-'))
    vi.clearAllMocks()
    runner.run.mockResolvedValue({ code: 0, stderr: '' })
  })
  afterEach(async () => {
    await rm(dir, { recursive: true, force: true })
  })

  const build = (fs: Partial<FsOps>): SidecarInstaller =>
    new SidecarInstaller({
      dirs: {
        root: dir,
        archives: join(dir, 'archives'),
        downloads: join(dir, 'downloads'),
        registryFile: join(dir, 'installed.json')
      },
      runner: runner as never,
      registry: registry as never,
      idleTimeoutMs: 1000,
      log,
      sleep,
      renameDelaysMs: [1, 2, 3],
      fs: { ...realFs, ...fs },
      extractors: {
        '7z': {
          extract: async (_f: string, staging: string) => {
            const root = join(staging, 'pkg')
            await mkdir(join(root, 'bin'), { recursive: true })
            await writeFile(join(root, 'bin', 'ffmpeg'), 'bin')
            await writeFile(join(root, 'README'), 'full tree only')
            return root
          }
        },
        zip: {} as never,
        appimage: {} as never
      } as never
    })

  const install = (i: SidecarInstaller): Promise<void> =>
    i.installUnit(unit, new AbortController().signal, () => {})
  const final = (): string => join(dir, 'archives', unit.sha256)
  const leftovers = async (): Promise<string[]> =>
    (await readdir(join(dir, 'archives'))).filter((n) => n.startsWith('.partial'))

  it('rename falha N vezes com EPERM e depois passa', async () => {
    let calls = 0
    const rename = vi.fn(async (a: string, b: string) => {
      if (++calls <= 2) throw eperm()
      return realFs.rename(a, b)
    })
    await install(build({ rename }))
    expect(rename).toHaveBeenCalledTimes(3)
    expect(sleep).toHaveBeenCalledTimes(2)
    expect((await stat(join(final(), 'bin', 'ffmpeg'))).isFile()).toBe(true)
    expect(await leftovers()).toEqual([])
  })

  it('rename sempre falha: cai no fallback de cópia da árvore podada', async () => {
    const cp = vi.fn(realFs.cp)
    await install(
      build({
        rename: async () => {
          throw eperm()
        },
        cp
      })
    )
    expect(cp).toHaveBeenCalledTimes(1)
    expect((await stat(join(final(), 'bin', 'ffmpeg'))).isFile()).toBe(true)
  })

  it('rename e cópia sempre falham na podada: instala a árvore completa', async () => {
    const renames: string[] = []
    const cps: string[] = []
    const fs = {
      rename: async (a: string, b: string) => {
        renames.push(a)
        if (a.endsWith('-pruned')) throw eperm()
        return realFs.rename(a, b)
      },
      cp: async (a: string) => {
        cps.push(a)
        throw ebusy()
      }
    }
    await install(build(fs))
    expect(cps).toHaveLength(1)
    // Árvore completa tem o README que a podada descarta.
    expect((await stat(join(final(), 'README'))).isFile()).toBe(true)
    expect(renames.some((p) => !p.endsWith('-pruned'))).toBe(true)
  })

  it('tudo falha: erro traz causa original + destino; rm do finally não mascara', async () => {
    const fs = {
      rename: async () => {
        throw eperm()
      },
      cp: async () => {
        throw ebusy()
      },
      rm: async (p: string) => {
        if (p.includes('.partial')) throw ebusy()
        return realFs.rm(p)
      }
    }
    const err = await install(build(fs)).catch((e) => e)
    expect(err).toBeInstanceOf(AppError)
    expect(err.message).toContain('EPERM')
    expect(err.message).toContain(final())
    expect(log.warn).toHaveBeenCalled()
  })

  it('rm que lança no finally não falha uma instalação bem-sucedida', async () => {
    const fs = {
      rm: async (p: string, o?: { maxRetries?: number }) => {
        if (p.includes('.partial')) throw ebusy()
        return realFs.rm(p, o)
      }
    }
    await install(build(fs))
    expect((await stat(join(final(), 'bin', 'ffmpeg'))).isFile()).toBe(true)
  })

  it('collectGarbage remove .partial-* e tolera EBUSY', async () => {
    const i = build({
      rm: async (p: string) => {
        if (p.endsWith('.partial-busy')) throw ebusy()
        return realFs.rm(p)
      }
    })
    await mkdir(join(dir, 'archives', '.partial-busy'), { recursive: true })
    await mkdir(join(dir, 'archives', '.partial-ok'), { recursive: true })
    await i.collectGarbage()
    expect(await readdir(join(dir, 'archives'))).toEqual(['.partial-busy'])
  })
})
