import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { ProfileRepository } from '../database/repositories/profile.repository'
import { openTestDatabase } from '../database/test-db'
import { ProfileService } from './profile.service'

let t: Awaited<ReturnType<typeof openTestDatabase>>
let inUse: Set<number>
let svc: ProfileService
beforeEach(async () => {
  t = await openTestDatabase()
  inUse = new Set()
  svc = new ProfileService(new ProfileRepository(t.db), { isInUse: (id) => inUse.has(id) })
})
afterEach(() => t.close())

const base = {
  name: 'Anime PT-BR',
  model: 'anthropic/claude-x',
  glossary: [{ source: 'senpai', rule: 'keep' }],
  targetLang: 'pt-br',
  temperature: 0.3
}

describe('ProfileService', () => {
  it('create normaliza idioma e devolve DTO', async () => {
    const p = await svc.create(base)
    expect(p).toMatchObject({ name: 'Anime PT-BR', targetLang: 'pt-BR', temperature: 0.3 })
    expect(typeof p.id).toBe('number')
    expect(await svc.list()).toHaveLength(1)
  })

  it('valida entrada', async () => {
    for (const bad of [
      { ...base, name: '  ' },
      { ...base, model: '' },
      { ...base, temperature: 3 },
      { ...base, targetLang: 'não é tag' },
      { ...base, glossary: [{ source: 'x' }] }
    ])
      await expect(svc.create(bad)).rejects.toMatchObject({ code: 'INVALID_INPUT' })
  })

  it('nome único', async () => {
    await svc.create(base)
    await expect(svc.create(base)).rejects.toMatchObject({ code: 'PROFILE_NAME_TAKEN' })
  })

  it('update e get', async () => {
    const p = await svc.create(base)
    const u = await svc.update(p.id, { ...base, temperature: 0.9 })
    expect(u.temperature).toBe(0.9)
    expect((await svc.get(p.id)).temperature).toBe(0.9)
    await expect(svc.get(999)).rejects.toMatchObject({ code: 'PROFILE_NOT_FOUND' })
    await expect(svc.update(999, base)).rejects.toMatchObject({ code: 'PROFILE_NOT_FOUND' })
  })

  it('delete recusado com job em andamento', async () => {
    const p = await svc.create(base)
    inUse.add(p.id)
    await expect(svc.delete(p.id)).rejects.toMatchObject({ code: 'PROFILE_IN_USE' })
    inUse.clear()
    await svc.delete(p.id)
    expect(await svc.list()).toEqual([])
  })
})
