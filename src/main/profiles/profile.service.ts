import type { Profile } from '../../shared/ipc-contract'
import type { ProfileRepository, ProfileRow } from '../database/repositories/profile.repository'
import { AppError } from '../errors'
import { ProfileInputSchema, type ProfileData, type ProfileInput } from './profile.schema'

function toDto(r: ProfileRow): Profile {
  return {
    id: r.id,
    name: r.name,
    model: r.model,
    glossary: r.glossary as Profile['glossary'],
    targetLang: r.targetLang,
    temperature: r.temperature,
    createdAt: r.createdAt.toISOString()
  }
}

function parse(input: ProfileInput): ProfileData {
  const r = ProfileInputSchema.safeParse(input)
  if (!r.success) throw new AppError('INVALID_INPUT', r.error.message)
  return r.data
}

/** CRUD de perfis. Jobs guardam uma cópia do perfil; aqui só se impede apagar um em uso. */
export class ProfileService {
  constructor(
    private readonly repo: ProfileRepository,
    private readonly deps: { isInUse: (id: number) => boolean | Promise<boolean> }
  ) {}

  async list(): Promise<Profile[]> {
    return (await this.repo.list()).map(toDto)
  }

  async get(id: number): Promise<Profile> {
    const r = await this.repo.get(id)
    if (!r) throw new AppError('PROFILE_NOT_FOUND', `Profile ${id} not found`)
    return toDto(r)
  }

  async create(input: ProfileInput): Promise<Profile> {
    const data = parse(input)
    await this.assertNameFree(data.name)
    return toDto(await this.repo.insert(data))
  }

  async update(id: number, input: ProfileInput): Promise<Profile> {
    const data = parse(input)
    if (!(await this.repo.get(id)))
      throw new AppError('PROFILE_NOT_FOUND', `Profile ${id} not found`)
    await this.assertNameFree(data.name, id)
    const r = await this.repo.update(id, data)
    if (!r) throw new AppError('PROFILE_NOT_FOUND', `Profile ${id} not found`)
    return toDto(r)
  }

  async delete(id: number): Promise<void> {
    if (await this.deps.isInUse(id))
      throw new AppError('PROFILE_IN_USE', `Profile ${id} is used by a running job`)
    if (!(await this.repo.delete(id)))
      throw new AppError('PROFILE_NOT_FOUND', `Profile ${id} not found`)
  }

  private async assertNameFree(name: string, exceptId?: number): Promise<void> {
    const other = await this.repo.findByName(name)
    if (other && other.id !== exceptId)
      throw new AppError('PROFILE_NAME_TAKEN', `Profile name already exists: ${name}`)
  }
}
