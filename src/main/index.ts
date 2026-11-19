import { app, BrowserWindow, safeStorage } from 'electron'
import { electronApp, optimizer } from '@electron-toolkit/utils'
import { initLogger, logger } from './logging/logger'
import { openDatabase } from './database/client'
import { JobMemoryRepository } from './database/repositories/job-memory.repository'
import { JobMemoryService } from './memory/job-memory.service'
import { SecretsRepository } from './database/repositories/secrets.repository'
import { SecretVault } from './settings/secret-vault'
import { emitToRenderers } from './ipc/events'
import { registerIpc } from './ipc/register'
import { paths } from './config/paths'
import { createSidecarModule } from './sidecars/create-sidecar-manager'
import { AppUpdateService } from './services/app-update.service'
import { NativeConsentGate } from './services/sidecar-consent'
import { path7za } from '7zip-bin'
import { AppInfoService } from './services/app-info.service'
import { shutdown } from './services/shutdown-coordinator'
import { createMainWindow } from './window/create-main-window'

initLogger()

if (!app.requestSingleInstanceLock()) {
  app.quit()
} else {
  app.whenReady().then(async () => {
    electronApp.setAppUserModelId('com.bakasub.app')
    app.on('browser-window-created', (_, window) => optimizer.watchWindowShortcuts(window))

    const database = await openDatabase()
    shutdown.register('database', () => database.close())
    // LIFO: registrado depois do banco => termina as escritas em andamento antes do close.
    // `isBusy` passa a consultar o Job Manager quando ele existir.
    const memory = new JobMemoryService(new JobMemoryRepository(database.db))
    shutdown.register('job-memory', () => memory.dispose())

    const vault = await SecretVault.open(new SecretsRepository(database.db), safeStorage)
    logger.app.info(`secret vault ready (protection: ${vault.protection})`)
    if (vault.recovered) logger.app.warn('secret vault master key was unrecoverable; secrets reset')

    const sidecarModule = createSidecarModule({
      binDir: paths.bin(),
      cacheDir: paths.cache(),
      // 7za precisa estar fora do asar (ver asarUnpack).
      sevenZipPath: path7za.replace(/app\.asar([\\/])/, 'app.asar.unpacked$1'),
      consent: new NativeConsentGate(),
      emitProgress: (p) => emitToRenderers('sidecars:progress', p),
      log: logger.sidecar
    })
    shutdown.register('sidecars', async () => {
      sidecarModule.manager.dispose()
      await sidecarModule.runner.disposeAll()
    })

    registerIpc({
      appInfo: new AppInfoService(),
      appUpdate: new AppUpdateService(sidecarModule.manifests),
      sidecars: sidecarModule.manager,
      memory,
      vault
    })
    createMainWindow()

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createMainWindow()
    })
  })

  app.on('second-instance', () => {
    const [win] = BrowserWindow.getAllWindows()
    if (win) {
      if (win.isMinimized()) win.restore()
      win.focus()
    }
  })

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit()
  })

  // Graceful shutdown: adia o quit até jobs/sidecars/DB serem liberados.
  let shuttingDown = false
  app.on('before-quit', (event) => {
    if (shuttingDown) return
    event.preventDefault()
    shuttingDown = true
    void shutdown.run().finally(() => app.exit(0))
  })

  for (const sig of ['SIGINT', 'SIGTERM'] as const) {
    process.on(sig, () => {
      logger.app.info(`received ${sig}`)
      app.quit()
    })
  }
}
