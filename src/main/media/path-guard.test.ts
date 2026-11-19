import { mkdirSync, mkdtempSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { beforeAll, describe, expect, it } from 'vitest'
import { ensureFreeSpace, validateInputFile, validateOutputDir } from './path-guard'

let dir: string
beforeAll(() => {
  dir = mkdtempSync(join(tmpdir(), 'bakasub-guard-'))
  writeFileSync(join(dir, 'ep.mkv'), 'x'.repeat(10))
  writeFileSync(join(dir, 'ep.ass'), 'y')
  writeFileSync(join(dir, 'virus.exe'), 'z')
  mkdirSync(join(dir, 'pasta.mkv'))
  symlinkSync(join(dir, 'ep.mkv'), join(dir, 'link.mkv'))
  symlinkSync(join(dir, 'pasta.mkv'), join(dir, 'linkdir.mkv'))
})

const reason = async (p: Promise<unknown>): Promise<unknown> =>
  p.then(
    () => 'ok',
    (e: { code: string; message: string }) => `${e.code}:${e.message}`
  )

describe('validateInputFile', () => {
  it('arquivo regular com extensão permitida', async () => {
    expect(await validateInputFile(join(dir, 'ep.mkv'), ['.mkv'])).toEqual({
      path: join(dir, 'ep.mkv'),
      size: 10
    })
  })
  it('symlink para arquivo é resolvido', async () => {
    expect((await validateInputFile(join(dir, 'link.mkv'), ['.mkv'])).path).toBe(
      join(dir, 'ep.mkv')
    )
  })
  it.each([
    ['relativo', 'ep.mkv', 'relative'],
    ['inexistente', '/nao/existe.mkv', 'not-found'],
    ['diretório', 'pasta.mkv', 'not-a-file'],
    ['symlink para diretório', 'linkdir.mkv', 'not-a-file'],
    ['extensão fora da lista', 'virus.exe', 'extension'],
    ['extensão de outro tipo', 'ep.ass', 'extension']
  ])('%s => INVALID_PATH', async (_label, name, why) => {
    const p = name.startsWith('/') || name === 'ep.mkv' ? name : join(dir, name)
    expect(await reason(validateInputFile(p, ['.mkv']))).toBe(`INVALID_PATH:${why}`)
  })
  it('acima do limite de tamanho', async () => {
    expect(await reason(validateInputFile(join(dir, 'ep.mkv'), ['.mkv'], 5))).toBe(
      'INVALID_PATH:too-large'
    )
  })
})

describe('validateOutputDir', () => {
  it('diretório gravável', async () => {
    expect(await validateOutputDir(dir)).toBe(dir)
  })
  it('arquivo não é diretório', async () => {
    expect(await reason(validateOutputDir(join(dir, 'ep.mkv')))).toBe(
      'INVALID_PATH:not-a-directory'
    )
  })
})

describe('ensureFreeSpace', () => {
  it('passa com pouco; DISK_FULL com absurdo', async () => {
    await expect(ensureFreeSpace(dir, 1)).resolves.toBeUndefined()
    await expect(ensureFreeSpace(dir, Number.MAX_SAFE_INTEGER)).rejects.toMatchObject({
      code: 'DISK_FULL'
    })
  })
})
