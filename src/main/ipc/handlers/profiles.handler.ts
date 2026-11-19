import { z } from 'zod'
import type { ProfileService } from '../../profiles/profile.service'
import { ProfileInputSchema } from '../../profiles/profile.schema'
import { createHandler } from '../create-handler'

const id = z.number().int().positive()

export function registerProfileHandlers(deps: { profiles: ProfileService }): void {
  createHandler('profiles:list', { handle: () => deps.profiles.list() })
  createHandler('profiles:create', {
    input: ProfileInputSchema,
    handle: (profile) => deps.profiles.create(profile)
  })
  createHandler('profiles:update', {
    input: z.object({ id, profile: ProfileInputSchema }),
    handle: ({ id, profile }) => deps.profiles.update(id, profile)
  })
  createHandler('profiles:delete', {
    input: z.object({ id }),
    handle: async ({ id }) => {
      await deps.profiles.delete(id)
      return { deleted: true as const }
    }
  })
}
