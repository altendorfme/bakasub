import { homedir } from 'node:os'
import { dirname } from 'node:path'
import { writeFile } from 'node:fs/promises'
import { BrowserWindow, dialog, shell } from 'electron'
import { z } from 'zod'
import { readLogTail, readLogsForExport } from '../../logging/log-files'
import { RateLimiter } from '../../logging/log-stream'
import { LOG_FILES_KEPT, logFile, logger, redactor, watchLogs } from '../../logging/logger'
import { createHandler } from '../create-handler'

const Level = z.enum(['debug', 'info', 'warn', 'error'])

export function registerLogHandlers(): void {
  createHandler('logs:tail', {
    input: z.object({
      limit: z.number().int().min(1).max(2000).optional(),
      minLevel: Level.optional(),
      scopes: z.array(z.string().min(1).max(40)).max(20).optional(),
      jobId: z.string().min(1).max(64).optional()
    }),
    handle: (q) => readLogTail(logFile(), { ...q, limit: q.limit ?? 500, keep: LOG_FILES_KEPT })
  })

  createHandler('logs:watch', {
    input: z.object({ on: z.boolean() }),
    handle: ({ on }) => {
      watchLogs(on)
      return { watching: on }
    }
  })

  createHandler('logs:open-folder', {
    // `openPath` resolves with an error string ('' = success).
    handle: async () => ({ opened: (await shell.openPath(dirname(logFile()))) === '' })
  })

  createHandler('logs:export', {
    handle: async (_input, event) => {
      const win = BrowserWindow.fromWebContents(event.sender)
      const stamp = new Date().toISOString().slice(0, 10)
      const options = {
        title: 'Export logs',
        defaultPath: `bakasub-logs-${stamp}.log`,
        filters: [{ name: 'Log', extensions: ['log', 'txt'] }]
      }
      const r = win
        ? await dialog.showSaveDialog(win, options)
        : await dialog.showSaveDialog(options)
      if (r.canceled || !r.filePath) return { path: null }
      const text = await readLogsForExport(logFile(), {
        keep: LOG_FILES_KEPT,
        home: homedir(),
        redactor
      })
      await writeFile(r.filePath, text, 'utf8')
      return { path: r.filePath }
    }
  })

  // A render loop throwing on every frame must not fill the disk.
  const limiter = new RateLimiter(20, 60_000)
  createHandler('logs:report', {
    input: z.object({
      level: z.enum(['warn', 'error']),
      message: z.string().max(2000),
      stack: z.string().max(8000).optional(),
      source: z.enum(['boundary', 'window', 'promise'])
    }),
    handle: (r) => {
      if (!limiter.take()) return { accepted: false }
      logger.renderer[r.level](`[${r.source}] ${r.message}`, ...(r.stack ? [r.stack] : []))
      return { accepted: true }
    }
  })
}
