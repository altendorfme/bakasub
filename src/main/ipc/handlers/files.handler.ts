import { z } from 'zod'
import { inspectSubtitle } from '../../files/subtitle-inspector'
import { createHandler } from '../create-handler'

export function registerFileHandlers(deps: { inspect?: typeof inspectSubtitle } = {}): void {
  const inspect = deps.inspect ?? inspectSubtitle
  createHandler('files:inspect', {
    input: z.object({ path: z.string().min(1).max(4096) }),
    handle: ({ path }) => inspect(path)
  })
}
