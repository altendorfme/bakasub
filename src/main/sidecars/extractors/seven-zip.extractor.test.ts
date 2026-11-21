import { chmod, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { SevenZipExtractor } from './seven-zip.extractor'

describe.skipIf(process.platform === 'win32')('SevenZipExtractor', () => {
  let dir: string
  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), '7z-'))
  })
  afterEach(async () => {
    await rm(dir, { recursive: true, force: true })
  })

  it('usa cópia executável quando o binário empacotado não tem bit de execução', async () => {
    const bundled = join(dir, '7za')
    await writeFile(bundled, 'bin')
    await chmod(bundled, 0o644)
    const run = vi.fn().mockResolvedValue({ code: 0, stderr: '' })
    const ex = new SevenZipExtractor({ run } as never, bundled, join(dir, 'tools'))
    await ex.extract('a.zip', join(dir, 'out'))
    const used = run.mock.calls[0][0] as string
    expect(used).toBe(join(dir, 'tools', '7za'))
    expect(await readFile(used, 'utf8')).toBe('bin')
  })

  it('usa o binário empacotado quando já é executável', async () => {
    const bundled = join(dir, '7za')
    await writeFile(bundled, 'bin')
    await chmod(bundled, 0o755)
    const run = vi.fn().mockResolvedValue({ code: 0, stderr: '' })
    const ex = new SevenZipExtractor({ run } as never, bundled, join(dir, 'tools'))
    await ex.extract('a.zip', join(dir, 'out'))
    expect(run.mock.calls[0][0]).toBe(bundled)
  })
})
