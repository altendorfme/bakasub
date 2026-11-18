import log from 'electron-log/main'
import { join } from 'node:path'
import { app } from 'electron'

/** Deve ser chamado antes de qualquer outro módulo logar (após `app` estar disponível). */
export function initLogger(): void {
  log.transports.file.resolvePathFn = () => join(app.getPath('userData'), 'logs', 'main.log')
  log.transports.file.maxSize = 5 * 1024 * 1024 // rotação nativa: main.log -> main.old.log
  log.transports.file.level = 'info'
  log.transports.console.level = app.isPackaged ? 'warn' : 'debug'
  log.errorHandler.startCatching({ showDialog: false })
  log.initialize()
}

export const logger = {
  app: log.scope('app'),
  db: log.scope('db'),
  ipc: log.scope('ipc'),
  sidecar: log.scope('sidecar'),
  llm: log.scope('llm')
}
