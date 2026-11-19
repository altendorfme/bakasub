import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { SettingsRepository } from '../database/repositories/settings.repository'
import { SettingsService } from './settings.service'
import { openTestDatabase } from '../database/test-db'

let t: Awaited<ReturnType<typeof openTestDatabase>>
let svc: SettingsService
beforeEach(async () => {
  t = await openTestDatabase()
  svc = new SettingsService(new SettingsRepository(t.db))
})
afterEach(() => t.close())

describe('SettingsService', () => {
  it('ausente => default do registro', async () => {
    expect(await svc.get('models.cache')).toBeNull()
  })
  it('set/get tipado e validado', async () => {
    const v = { fetchedAt: 123, models: [{ id: 'a/b' }] as unknown[] }
    await svc.set('models.cache', v)
    expect(await svc.get('models.cache')).toEqual(v)
  })
  it('valor inválido no banco => default (não lança)', async () => {
    await t.client.execute(
      `INSERT INTO settings (key, value) VALUES ('models.cache', '{"fetchedAt":"x"}')`
    )
    expect(await svc.get('models.cache')).toBeNull()
  })
  it('set inválido lança', async () => {
    await expect(svc.set('models.cache', { fetchedAt: 'x' } as never)).rejects.toThrow()
  })
})
