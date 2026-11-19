import log from 'electron-log/main'
import { join } from 'node:path'
import { app } from 'electron'
import type { LogEntry } from '../../shared/ipc-contract'
import { currentJobId } from './job-context'
import { serializeEntry, toLogEntry } from './log-entry'
import { rotateLogs } from './log-files'
import { LogStream } from './log-stream'
import { Redactor } from './redact'

/** Files kept in total: `main.log` + `main.1.log` … `main.4.log`. */
export const LOG_FILES_KEPT = 5
const MAX_LOG_BYTES = 5 * 1024 * 1024

/** Every secret the app holds is registered here (vault values) and masked in every transport. */
export const redactor = new Redactor()

let stream: LogStream | null = null

export const logFile = (): string => join(app.getPath('userData'), 'logs', 'main.log')

/**
 * Must run before any other module logs. File: one JSON object per line (`LogEntry`), rotated
 * at 5 MB keeping 5 files. Console: electron-log's readable format. Both see redacted data.
 */
export function initLogger(o: { emitEntries: (batch: LogEntry[]) => void }): void {
  stream = new LogStream(o.emitEntries)
  const file = log.transports.file
  file.resolvePathFn = logFile
  file.maxSize = MAX_LOG_BYTES
  file.archiveLogFn = (f) => rotateLogs(f.toString(), LOG_FILES_KEPT)
  file.level = 'info'
  file.format = ({ message }) => [
    serializeEntry(
      toLogEntry({
        date: message.date,
        level: message.level,
        scope: message.scope,
        data: message.data,
        jobId: (message.variables as { jobId?: string } | undefined)?.jobId
      })
    )
  ]
  log.transports.console.level = app.isPackaged ? 'warn' : 'debug'

  // Hooks run synchronously inside the log call and after each transport's level check, so
  // the async job context is still current and the live feed only sees what reaches the file.
  log.hooks.push((message, _transport, transportName) => {
    const jobId = currentJobId()
    const redacted: typeof message = {
      ...message,
      data: message.data.map((d) => redactor.value(d)),
      variables: { ...message.variables, ...(jobId ? { jobId } : {}) } as typeof message.variables
    }
    if (transportName === 'file')
      stream?.publish(
        toLogEntry({
          date: redacted.date,
          level: redacted.level,
          scope: redacted.scope,
          data: redacted.data,
          jobId
        })
      )
    return redacted
  })

  log.errorHandler.startCatching({ showDialog: false })
  log.initialize()
}

/** `logs.level` setting: `debug` = verbose logging. Applies immediately. */
export function setLogLevel(level: 'info' | 'debug'): void {
  log.transports.file.level = level
}

/** The Logs screen is open: start/stop the batched `logs:entry` feed. */
export function watchLogs(on: boolean): void {
  stream?.watch(on)
}

export const logger = {
  app: log.scope('app'),
  db: log.scope('db'),
  ipc: log.scope('ipc'),
  sidecar: log.scope('sidecar'),
  llm: log.scope('llm'),
  jobs: log.scope('jobs'),
  renderer: log.scope('renderer')
}
