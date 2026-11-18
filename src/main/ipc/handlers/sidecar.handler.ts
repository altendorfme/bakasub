import { z } from 'zod'
import { createHandler } from '../create-handler'
import type { SidecarManager } from '../../sidecars/sidecar-manager'

const installInput = z.object({
  tools: z
    .array(z.string().regex(/^[a-z0-9_-]{1,32}$/))
    .min(1)
    .max(16)
})

export function registerSidecarHandlers(deps: { sidecars: SidecarManager }): void {
  createHandler('sidecars:check', { handle: () => deps.sidecars.check() })
  createHandler('sidecars:install', {
    input: installInput,
    handle: ({ tools }) => deps.sidecars.install(tools)
  })
  createHandler('sidecars:cancel', { handle: () => ({ cancelled: deps.sidecars.cancel() }) })
}
