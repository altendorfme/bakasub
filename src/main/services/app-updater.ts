import { AppError } from '../errors'
import { compareVersions } from '../../shared/version'
import type {
  AppUpdateInfo,
  AppUpdateProgress,
  AppUpdateState,
  AppUpdateStatus
} from '../../shared/ipc-contract'
import { isAllowedExternalUrl } from './external-links'

export const RELEASES_URL = 'https://github.com/lsilvatti/bakasub/releases/latest'
const MAX_NOTES_CHARS = 20_000
const PROGRESS_THROTTLE_MS = 250

/** Subconjunto de `electron-updater` que o serviço usa (permite testar sem Electron). */
export interface UpdaterLike {
  autoDownload: boolean
  autoInstallOnAppQuit: boolean
  allowPrerelease: boolean
  allowDowngrade: boolean
  logger: unknown
  on(event: string, listener: (...args: never[]) => void): unknown
  checkForUpdates(): Promise<{
    isUpdateAvailable?: boolean
    updateInfo: {
      version: string
      releaseDate?: string
      releaseNotes?: string | { note?: string | null }[] | null
      files?: { size?: number }[]
    }
  } | null>
  downloadUpdate(token?: CancelTokenLike): Promise<unknown>
  quitAndInstall(isSilent?: boolean, isForceRunAfter?: boolean): void
}
export interface CancelTokenLike {
  cancel(): void
}

export interface AppUpdaterDeps {
  updater: UpdaterLike
  newCancelToken: () => CancelTokenLike
  currentVersion: string
  isPackaged: boolean
  platform: NodeJS.Platform
  /** `process.env.APPIMAGE`: só existe quando rodando como AppImage. */
  appImagePath: string | undefined
  emit: (status: AppUpdateStatus) => void
  /** Há job executando? */
  hasActiveJobs: () => boolean
  /** Shutdown coordinator: aborta jobs, encerra sidecars e fecha o banco (idempotente). */
  shutdown: () => Promise<void>
  /** Último recurso se o instalador falhar depois do shutdown. */
  abort: () => void
  log: {
    info(...a: unknown[]): void
    warn(...a: unknown[]): void
    error(...a: unknown[]): void
  }
  now?: () => number
}

/**
 * Auto-update sempre condicionado a ação do usuário: `check` só consulta, `download` só em
 * `available`, `install` só em `downloaded`. `quitAndInstall` vive exclusivamente em `install`.
 */
export class AppUpdater {
  private status: AppUpdateStatus
  private checking: Promise<AppUpdateInfo> | null = null
  private token: CancelTokenLike | null = null
  private cancelRequested = false
  private installing = false
  private lastProgressAt = 0
  private readonly now: () => number

  constructor(private readonly d: AppUpdaterDeps) {
    this.now = d.now ?? Date.now
    const u = d.updater
    u.autoDownload = false
    u.autoInstallOnAppQuit = false
    u.allowPrerelease = false
    u.allowDowngrade = false
    u.logger = d.log
    // Sem listener, um 'error' do EventEmitter derrubaria o processo. O estado vem das promises.
    u.on('error', ((err: unknown) => d.log.warn('updater error', err)) as never)
    u.on('download-progress', ((p: AppUpdateProgress) => this.onProgress(p)) as never)

    const unsupported = this.unsupportedReason()
    this.status = { state: unsupported ? 'unsupported' : 'idle', current: d.currentVersion }
    if (unsupported) {
      d.log.info(`auto-update unavailable: ${unsupported}`)
      if (isAllowedExternalUrl(RELEASES_URL)) this.status.fallbackUrl = RELEASES_URL
    }
  }

  getStatus(): AppUpdateStatus {
    return { ...this.status }
  }

  /** Nunca rejeita: rede/HTTP viram `state: 'error'` + `offline`. */
  check(): Promise<AppUpdateInfo> {
    const s = this.status.state
    if (s === 'unsupported' || s === 'downloading' || s === 'downloaded') {
      return Promise.resolve(this.toInfo())
    }
    this.checking ??= this.doCheck().finally(() => {
      this.checking = null
    })
    return this.checking
  }

  /** Retorna na hora; progresso e resultado saem por `emit`. */
  download(): AppUpdateStatus {
    this.assertSupported()
    if (this.status.state === 'downloading' || this.status.state === 'downloaded') {
      return this.getStatus()
    }
    if (this.status.state !== 'available') {
      throw new AppError('UPDATE_NOT_READY', 'No update available to download')
    }
    this.cancelRequested = false
    const token = this.d.newCancelToken()
    this.token = token
    this.set({ state: 'downloading', progress: undefined, error: undefined, offline: undefined })
    void this.doDownload(token)
    return this.getStatus()
  }

  cancelDownload(): { cancelled: boolean } {
    if (this.status.state !== 'downloading' || !this.token) return { cancelled: false }
    this.cancelRequested = true
    this.token.cancel()
    return { cancelled: true }
  }

  async install(opts: { confirmJobs?: boolean }): Promise<{ installing: true }> {
    this.assertSupported()
    if (this.status.state !== 'downloaded') {
      throw new AppError('UPDATE_NOT_READY', 'No downloaded update to install')
    }
    if (this.installing) return { installing: true }
    if (this.d.hasActiveJobs() && !opts.confirmJobs) {
      throw new AppError('UPDATE_JOBS_ACTIVE', 'Jobs are running; confirm to cancel them')
    }
    this.installing = true
    try {
      this.d.log.info('installing update: running shutdown')
      await this.d.shutdown()
      this.d.updater.quitAndInstall(false, true)
    } catch (err) {
      // O shutdown já fechou DB/jobs: o app não é mais utilizável, então encerra em vez de ficar meio-vivo.
      this.d.log.error('quitAndInstall failed after shutdown', err)
      this.d.abort()
      throw err
    }
    return { installing: true }
  }

  // ---------------------------------------------------------------------------

  private async doCheck(): Promise<AppUpdateInfo> {
    this.set({ state: 'checking', error: undefined, offline: undefined })
    try {
      const res = await this.d.updater.checkForUpdates()
      if (!res) {
        this.set({ state: 'not-available' })
        return this.toInfo()
      }
      const { updateInfo } = res
      const available =
        res.isUpdateAvailable ?? compareVersions(this.d.currentVersion, updateInfo.version) < 0
      if (!available) {
        this.set({ state: 'not-available', latest: updateInfo.version })
        return this.toInfo()
      }
      this.set({
        state: 'available',
        latest: updateInfo.version,
        publishedAt: updateInfo.releaseDate,
        notes: normalizeNotes(updateInfo.releaseNotes),
        size: updateInfo.files?.find((f) => typeof f.size === 'number')?.size
      })
    } catch (err) {
      this.fail(err)
    }
    return this.toInfo()
  }

  private async doDownload(token: CancelTokenLike): Promise<void> {
    try {
      await this.d.updater.downloadUpdate(token)
      this.set({ state: 'downloaded', progress: undefined })
    } catch (err) {
      if (this.cancelRequested) {
        this.d.log.info('update download cancelled')
        this.set({ state: 'available', progress: undefined })
      } else {
        this.fail(err)
      }
    } finally {
      this.token = null
      this.cancelRequested = false
    }
  }

  private onProgress(p: AppUpdateProgress): void {
    if (this.status.state !== 'downloading') return
    const t = this.now()
    if (t - this.lastProgressAt < PROGRESS_THROTTLE_MS && p.percent < 100) return
    this.lastProgressAt = t
    this.set({
      progress: {
        percent: p.percent,
        transferred: p.transferred,
        total: p.total,
        bytesPerSecond: p.bytesPerSecond
      }
    })
  }

  private fail(err: unknown): void {
    const offline = isNetworkFailure(err)
    this.d.log.warn(offline ? 'update check/download failed (network)' : 'update failed', err)
    this.set({
      state: 'error',
      progress: undefined,
      offline,
      error: {
        code: offline ? 'NETWORK' : 'INTERNAL',
        message: err instanceof Error ? err.message : 'Update failed'
      }
    })
  }

  private set(patch: Partial<AppUpdateStatus> & { state?: AppUpdateState }): void {
    this.status = { ...this.status, ...patch }
    // Chaves `undefined` somem do payload e do retrato.
    for (const k of Object.keys(this.status) as (keyof AppUpdateStatus)[]) {
      if (this.status[k] === undefined) delete this.status[k]
    }
    this.d.emit(this.getStatus())
  }

  private toInfo(): AppUpdateInfo {
    const s = this.status
    return {
      current: s.current,
      latest: s.latest ?? s.current,
      updateAvailable:
        s.state === 'available' || s.state === 'downloading' || s.state === 'downloaded',
      publishedAt: s.publishedAt ?? '',
      offline: s.offline ?? false,
      state: s.state,
      ...(s.notes !== undefined && { notes: s.notes }),
      ...(s.size !== undefined && { size: s.size }),
      ...(s.fallbackUrl !== undefined && { fallbackUrl: s.fallbackUrl }),
      ...(s.error !== undefined && { error: s.error })
    }
  }

  private assertSupported(): void {
    if (this.status.state === 'unsupported') {
      throw new AppError('UPDATE_UNSUPPORTED', 'In-app updates are not supported in this install')
    }
  }

  private unsupportedReason(): string | null {
    const { isPackaged, platform, appImagePath } = this.d
    if (!isPackaged) return 'development build'
    if (platform === 'linux') return appImagePath ? null : 'not running as an AppImage'
    if (platform === 'win32') return null
    return `platform ${platform}`
  }
}

/** Notas do GitHub (HTML) ou lista de notas por versão; truncadas. */
function normalizeNotes(
  raw: string | { note?: string | null }[] | null | undefined
): string | undefined {
  const text = Array.isArray(raw) ? raw.map((n) => n.note ?? '').join('\n\n') : (raw ?? '')
  const trimmed = text.trim()
  return trimmed ? trimmed.slice(0, MAX_NOTES_CHARS) : undefined
}

const NETWORK_CODES =
  /^(ERR_INTERNET_DISCONNECTED|ERR_NETWORK|ERR_NAME_NOT_RESOLVED|ERR_CONNECTION|ERR_TIMED_OUT|ENOTFOUND|ECONNREFUSED|ECONNRESET|ETIMEDOUT|EAI_AGAIN|ENETUNREACH|EHOSTUNREACH)/

function isNetworkFailure(err: unknown): boolean {
  const e = err as { code?: unknown; statusCode?: unknown; message?: unknown } | null
  if (typeof e?.statusCode === 'number') return true
  if (typeof e?.code === 'string' && NETWORK_CODES.test(e.code)) return true
  return (
    typeof e?.message === 'string' &&
    /net::ERR_|getaddrinfo|ENOTFOUND|ECONNREFUSED|ETIMEDOUT|socket hang up/i.test(e.message)
  )
}

/**
 * Só o suficiente para a janela terminar o boot (load do renderer + checagem de sidecars) antes
 * da requisição ao GitHub; o resultado chega ao renderer por `app:update-state` ou pelo snapshot
 * lido no mount, então não há corrida com a assinatura do evento.
 */
export const AUTO_CHECK_DELAY_MS = 3_000

export interface AutoCheckHandle {
  /**
   * O wizard de boas-vindas terminou: arma a checagem se ela ainda não ocorreu nesta sessão.
   * Reavalia `onboarded` antes de armar, então um sinal espúrio não fura o gate.
   */
  onboardingFinished(): void
  /** Descarta o timer pendente; nada mais é checado automaticamente nesta sessão. */
  cancel(): void
}

/**
 * Checagem silenciosa única por sessão, desligável por `updates.autoCheck`. Só consulta: baixar e
 * instalar dependem de ação do usuário.
 *
 * Gate de onboarding: `onboarded` é avaliado no boot. Se já estiver satisfeito, a checagem roda
 * após `delayMs` (comportamento de sempre). Senão o wizard está (ou vai estar) aberto e nada é
 * consultado até `onboardingFinished()`; a regra derivada sozinha não basta durante a sessão,
 * porque ela fica verdadeira no meio do wizard (passos opcionais vêm depois dos obrigatórios).
 */
export function scheduleAutoCheck(
  updater: Pick<AppUpdater, 'check'>,
  opts: {
    enabled: () => Promise<boolean>
    onboarded: () => Promise<boolean>
    delayMs?: number
    log: { warn(...a: unknown[]): void }
  }
): AutoCheckHandle {
  // idle: aguardando o wizard. evaluating: lendo `onboarded`. scheduled: timer armado.
  // done: já checou (ou foi cancelado); terminal.
  let phase: 'idle' | 'evaluating' | 'scheduled' | 'done' = 'idle'
  let timer: ReturnType<typeof setTimeout> | null = null
  // `onboardingFinished` chegou durante uma avaliação que pode ter lido o estado antigo.
  let rearm = false

  const run = (): void => {
    phase = 'done'
    timer = null
    void opts
      .enabled()
      .then((on) => (on ? updater.check() : undefined))
      .catch((err) => opts.log.warn('auto update check failed', err))
  }

  const arm = (): void => {
    if (phase === 'evaluating') {
      rearm = true
      return
    }
    if (phase !== 'idle') return
    phase = 'evaluating'
    rearm = false
    opts
      .onboarded()
      .catch((err) => {
        opts.log.warn('onboarding state unavailable; auto update check deferred', err)
        return false
      })
      .then((ok) => {
        if (phase !== 'evaluating') return // cancelado durante a leitura
        if (!ok) {
          phase = 'idle'
          if (rearm) arm()
          return
        }
        phase = 'scheduled'
        timer = setTimeout(run, opts.delayMs ?? AUTO_CHECK_DELAY_MS)
        timer.unref()
      })
  }

  arm()
  return {
    onboardingFinished: arm,
    cancel: () => {
      if (timer) clearTimeout(timer)
      timer = null
      phase = 'done'
    }
  }
}
