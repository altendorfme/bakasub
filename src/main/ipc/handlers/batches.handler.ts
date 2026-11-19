import { BrowserWindow, dialog, type OpenDialogOptions } from 'electron'
import { realpath, stat } from 'node:fs/promises'
import { z } from 'zod'
import {
  BatchCreateRequestSchema,
  BatchPlanRequestSchema,
  type BatchService
} from '../../batch/batch-service'
import { createHandler } from '../create-handler'

const byId = z.object({ id: z.string().min(1).max(64) })

export function registerBatchHandlers(deps: { batches: BatchService }): void {
  createHandler('batches:plan', {
    input: BatchPlanRequestSchema,
    handle: (req) => deps.batches.plan(req)
  })
  createHandler('batches:create', {
    input: BatchCreateRequestSchema,
    handle: (req) => deps.batches.create(req)
  })
  createHandler('batches:list', { handle: () => deps.batches.list() })
  createHandler('batches:get', { input: byId, handle: ({ id }) => deps.batches.get(id) })
  createHandler('batches:jobs', { input: byId, handle: ({ id }) => deps.batches.jobs(id) })
  createHandler('batches:cancel', { input: byId, handle: ({ id }) => deps.batches.cancel(id) })
  createHandler('batches:confirm', { input: byId, handle: ({ id }) => deps.batches.confirm(id) })
  createHandler('batches:remove', {
    input: byId,
    handle: async ({ id }) => {
      await deps.batches.remove(id)
      return { removed: true as const }
    }
  })

  createHandler('dialog:open-folder', {
    handle: async (_req, event) => {
      const win = BrowserWindow.fromWebContents(event.sender)
      const options: OpenDialogOptions = { properties: ['openDirectory'] }
      const res = win
        ? await dialog.showOpenDialog(win, options)
        : await dialog.showOpenDialog(options)
      const picked = res.canceled ? undefined : res.filePaths[0]
      if (!picked) return { path: null }
      const real = await realpath(picked)
      return { path: (await stat(real)).isDirectory() ? real : null }
    }
  })
}
