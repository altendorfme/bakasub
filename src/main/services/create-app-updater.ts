import { app } from 'electron'
import { autoUpdater, CancellationToken } from 'electron-updater'
import { emitToRenderers } from '../ipc/events'
import { logger } from '../logging/logger'
import { shutdown } from './shutdown-coordinator'
import { AppUpdater, type UpdaterLike } from './app-updater'

/** Liga o `AppUpdater` ao electron-updater real. Só o composition root importa este arquivo. */
export function createAppUpdater(deps: { hasActiveJobs: () => boolean }): AppUpdater {
  return new AppUpdater({
    updater: autoUpdater as unknown as UpdaterLike,
    newCancelToken: () => new CancellationToken(),
    currentVersion: app.getVersion(),
    isPackaged: app.isPackaged,
    platform: process.platform,
    appImagePath: process.env['APPIMAGE'],
    emit: (status) => emitToRenderers('app:update-state', status),
    hasActiveJobs: deps.hasActiveJobs,
    shutdown: () => shutdown.run(),
    abort: () => app.exit(1),
    log: logger.app
  })
}
