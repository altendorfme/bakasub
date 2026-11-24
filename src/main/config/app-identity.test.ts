import { describe, expect, it } from 'vitest'
import { APP_USER_MODEL_ID, appUserModelId, windowTitle } from './app-identity'

describe('app identity', () => {
  it('keeps the installed AppUserModelId equal to electron-builder appId', async () => {
    const { readFile } = await import('node:fs/promises')
    const yml = await readFile(new URL('../../../electron-builder.yml', import.meta.url), 'utf8')
    expect(yml).toMatch(new RegExp(`^appId: ${APP_USER_MODEL_ID.replace(/\./g, '\\.')}$`, 'm'))
    expect(appUserModelId(true)).toBe('com.bakasub.app')
  })

  it('gives the dev build its own AppUserModelId', () => {
    expect(appUserModelId(false)).toBe('com.bakasub.app.dev')
  })

  it('suffixes the window title only in dev, once', () => {
    expect(windowTitle('BakaSub', true)).toBe('BakaSub')
    expect(windowTitle('BakaSub', false)).toBe('BakaSub (dev)')
    expect(windowTitle('BakaSub (dev)', false)).toBe('BakaSub (dev)')
  })
})
