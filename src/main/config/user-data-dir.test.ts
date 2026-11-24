import { join, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { DEV_USER_DATA_DIR, USER_DATA_ENV, resolveUserDataDir } from './user-data-dir'

const appData = resolve('/home/u/.config')

describe('resolveUserDataDir', () => {
  it('app instalado sem override mantém o padrão do Electron', () => {
    expect(resolveUserDataDir({ isPackaged: true, appData, env: {} })).toBeNull()
  })

  it('dev usa <appData>/bakasub-dev', () => {
    expect(resolveUserDataDir({ isPackaged: false, appData, env: {} })).toBe(
      join(appData, DEV_USER_DATA_DIR)
    )
    expect(DEV_USER_DATA_DIR).toBe('bakasub-dev')
  })

  it('override por env vence em dev e no instalado', () => {
    const dir = resolve('/tmp/bakasub-e2e')
    for (const isPackaged of [true, false])
      expect(resolveUserDataDir({ isPackaged, appData, env: { [USER_DATA_ENV]: dir } })).toBe(dir)
  })

  it('override relativo resolve a partir do cwd', () => {
    const cwd = resolve('/work/repo')
    expect(
      resolveUserDataDir({ isPackaged: false, appData, env: { [USER_DATA_ENV]: ' .data ' }, cwd })
    ).toBe(join(cwd, '.data'))
  })

  it('override vazio ou só espaços é ignorado', () => {
    for (const value of ['', '   '])
      expect(
        resolveUserDataDir({ isPackaged: false, appData, env: { [USER_DATA_ENV]: value } })
      ).toBe(join(appData, DEV_USER_DATA_DIR))
  })
})
