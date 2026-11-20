import { app, BrowserWindow, dialog, protocol, safeStorage } from 'electron'
import { electronApp, optimizer } from '@electron-toolkit/utils'
import { initLogger, logFile, logger, redactor, setLogLevel } from './logging/logger'
import { openDatabase } from './database/client'
import { JobMemoryRepository } from './database/repositories/job-memory.repository'
import { JobMemoryService } from './memory/job-memory.service'
import { SecretsRepository } from './database/repositories/secrets.repository'
import { SecretVault } from './settings/secret-vault'
import { createJobModule } from './jobs/create-job-module'
import { artworkProtocolHandler } from './media-context/artwork-protocol'
import { createMediaContextModule } from './media-context/create-media-context-module'
import { join } from 'node:path'
import { emitToRenderers } from './ipc/events'
import { registerIpc } from './ipc/register'
import { paths } from './config/paths'
import { createSidecarModule } from './sidecars/create-sidecar-manager'
import { scheduleAutoCheck } from './services/app-updater'
import { createAppUpdater } from './services/create-app-updater'
import { NativeConsentGate } from './services/sidecar-consent'
import { consentLanguage } from './services/sidecar-consent-text'
import { path7za } from '7zip-bin'
import { AppInfoService } from './services/app-info.service'
import { bootFailureMessage } from './services/boot-failure'
import { shutdown } from './services/shutdown-coordinator'
import { createMainWindow } from './window/create-main-window'

initLogger({ emitEntries: (batch) => emitToRenderers('logs:entry', batch) })

// TMDB artwork, served from the disk cache (CSP: `img-src bakasub-media:`). Must be registered
// before `ready`.
protocol.registerSchemesAsPrivileged([
  { scheme: 'bakasub-media', privileges: { standard: true, secure: true, supportFetchAPI: true } }
])

if (!app.requestSingleInstanceLock()) {
  app.quit()
} else {
  app
    .whenReady()
    .then(async () => {
      electronApp.setAppUserModelId('com.bakasub.app')
      app.on('browser-window-created', (_, window) => optimizer.watchWindowShortcuts(window))

      const database = await openDatabase()
      shutdown.register('database', () => database.close())
      // LIFO: registrado depois do banco => termina as escritas em andamento antes do close.
      let isBusy = (): boolean => false
      const memory = new JobMemoryService(new JobMemoryRepository(database.db), {
        isBusy: () => isBusy()
      })
      shutdown.register('job-memory', () => memory.dispose())

      const vault = await SecretVault.open(new SecretsRepository(database.db), safeStorage)
      logger.app.info(`secret vault ready (protection: ${vault.protection})`)
      if (vault.recovered)
        logger.app.warn('secret vault master key was unrecoverable; secrets reset')
      redactor.add(await vault.get('openrouter.apiKey'))
      redactor.add(await vault.get('tmdb.credential'))

      const mediaContext = createMediaContextModule({
        db: database.db,
        vault,
        cacheDir: paths.cache()
      })
      protocol.handle('bakasub-media', artworkProtocolHandler(mediaContext.artwork))

      const sidecarModule = createSidecarModule({
        binDir: paths.bin(),
        cacheDir: paths.cache(),
        // 7za precisa estar fora do asar (ver asarUnpack).
        sevenZipPath: path7za.replace(/app\.asar([\\/])/, 'app.asar.unpacked$1'),
        // `jobModule` is created below; the dialog only opens later, on a user action.
        consent: new NativeConsentGate(async () =>
          consentLanguage(await jobModule.settings.get('ui.language'), app.getLocale())
        ),
        emitProgress: (p) => emitToRenderers('sidecars:progress', p),
        log: logger.sidecar
      })
      shutdown.register('sidecars', async () => {
        sidecarModule.manager.dispose()
        await sidecarModule.runner.disposeAll()
      })

      const jobModule = createJobModule({
        db: database.db,
        memory,
        vault,
        runner: sidecarModule.runner,
        tools: sidecarModule.manager,
        workRoot: join(paths.cache(), 'jobs'),
        emit: (e) => emitToRenderers('jobs:progress', e),
        mediaContext: mediaContext.service,
        onSettingsChanged: (keys) => {
          if (keys.includes('logs.level'))
            void jobModule.settings.get('logs.level').then(setLogLevel)
        },
        log: { jobs: logger.jobs, llm: logger.llm }
      })
      isBusy = () => jobModule.jobs.isBusy()
      setLogLevel(await jobModule.settings.get('logs.level'))
      // Registrado por último => descartado primeiro: aborta jobs (e seus processos) antes de
      // sidecars, Job Memory e banco.
      shutdown.register('jobs', () => jobModule.jobs.dispose(5000))
      await jobModule.jobs.init()

      const appUpdate = createAppUpdater({ hasActiveJobs: () => jobModule.jobs.isBusy() })
      registerIpc({
        appInfo: new AppInfoService(),
        appUpdate,
        sidecars: sidecarModule.manager,
        memory,
        vault,
        preferences: jobModule.preferences,
        presets: jobModule.presets,
        jobs: jobModule.jobs,
        mkv: jobModule.mkv,
        models: jobModule.models,
        batches: jobModule.batches,
        freeQuota: jobModule.freeQuota,
        validateApiKey: jobModule.validateApiKey,
        tmdb: mediaContext.tmdb,
        mediaContext: mediaContext.service
      })
      createMainWindow()
      scheduleAutoCheck(appUpdate, {
        enabled: () => jobModule.settings.get('updates.autoCheck'),
        log: logger.app
      })

      app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) createMainWindow()
      })
    })
    // Startup failures used to become an unhandled rejection and a windowless app.
    .catch(async (err: unknown) => {
      logger.app.error('startup failed', err)
      const m = bootFailureMessage(err, {
        packaged: app.isPackaged,
        dbPath: paths.database(),
        logPath: logFile()
      })
      dialog.showErrorBox(m.title, m.body)
      await shutdown.run().catch(() => undefined)
      app.exit(1)
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
