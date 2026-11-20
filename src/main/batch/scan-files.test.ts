import { mkdirSync, mkdtempSync, realpathSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { beforeAll, describe, expect, it } from 'vitest'
import { collectFiles, scanFolder } from './scan-files'

let root: string
beforeAll(() => {
  root = realpathSync.native(mkdtempSync(join(tmpdir(), 'bakasub-scan-')))
  for (const f of ['ep10.mkv', 'ep2.mkv', 'notes.txt', 'ep1.ass']) writeFileSync(join(root, f), 'x')
  mkdirSync(join(root, 'S02', 'extras'), { recursive: true })
  writeFileSync(join(root, 'S02', 'ep1.mkv'), 'x')
  writeFileSync(join(root, 'S02', 'extras', 'op.mkv'), 'x')
  mkdirSync(join(root, '.hidden'))
  writeFileSync(join(root, '.hidden', 'x.mkv'), 'x')
  symlinkSync(join(root, 'S02'), join(root, 'loop'))
})

describe('scanFolder', () => {
  it('não recursivo: só a raiz, ordem natural, extensões filtradas', async () => {
    const r = await scanFolder(root, { recursive: false, extensions: ['.mkv'] })
    expect(r.files.map((f) => f.relPath)).toEqual(['ep2.mkv', 'ep10.mkv'])
    expect(r.truncated).toBe(false)
  })
  it('recursivo: subpastas com relDir; ignora ocultas e symlinks de diretório', async () => {
    const r = await scanFolder(root, { recursive: true, extensions: ['.mkv'] })
    expect(r.files.map((f) => f.relPath)).toEqual([
      'ep2.mkv',
      'ep10.mkv',
      join('S02', 'ep1.mkv'),
      join('S02', 'extras', 'op.mkv')
    ])
    expect(r.files[3].relDir).toBe(join('S02', 'extras'))
  })
  it('limites de arquivos e profundidade', async () => {
    expect(
      (await scanFolder(root, { recursive: true, extensions: ['.mkv'], maxFiles: 2 })).truncated
    ).toBe(true)
    const shallow = await scanFolder(root, { recursive: true, extensions: ['.mkv'], maxDepth: 1 })
    expect(shallow.files.map((f) => f.relPath)).not.toContain(join('S02', 'extras', 'op.mkv'))
  })
  it('raiz inválida => INVALID_PATH', async () => {
    await expect(
      scanFolder('rel', { recursive: false, extensions: ['.mkv'] })
    ).rejects.toMatchObject({
      code: 'INVALID_PATH'
    })
    await expect(
      scanFolder(join(root, 'ep2.mkv'), { recursive: false, extensions: ['.mkv'] })
    ).rejects.toMatchObject({ code: 'INVALID_PATH' })
  })
})

describe('collectFiles', () => {
  it('valida cada caminho; inválidos voltam com o motivo', async () => {
    const r = await collectFiles(
      [join(root, 'ep2.mkv'), join(root, 'notes.txt'), '/nao/existe.mkv'],
      ['.mkv']
    )
    expect(r.files.map((f) => f.relPath)).toEqual(['ep2.mkv'])
    expect(r.files[0].relDir).toBe('')
    expect(r.rejected).toEqual([
      { path: join(root, 'notes.txt'), reason: 'extension' },
      { path: '/nao/existe.mkv', reason: 'not-found' }
    ])
  })
})
