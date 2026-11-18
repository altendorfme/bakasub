/**
 * Contrato IPC único (fonte da verdade) compartilhado entre main, preload e renderer.
 * Não importar zod/electron aqui: o preload roda em sandbox e só pode `require('electron')`.
 */

export interface AppInfo {
  name: string
  version: string
  platform: NodeJS.Platform
  arch: string
  electron: string
  userDataPath: string
}

export interface AppUpdateInfo {
  current: string
  latest: string
  updateAvailable: boolean
  /** `updatedAt` do version.json remoto. */
  publishedAt: string
  /** true quando o manifest veio do cache local (rede indisponível). */
  offline: boolean
}

export type SidecarState = 'ok' | 'missing' | 'outdated' | 'unsupported'

export interface SidecarToolStatus {
  name: string
  requiredVersion: string
  installedVersion: string | null
  state: SidecarState
  /** Caminho absoluto do executável quando instalado e íntegro. */
  path: string | null
}

export interface SidecarReport {
  checkedAt: string
  manifestUpdatedAt: string
  offline: boolean
  installDir: string
  tools: SidecarToolStatus[]
  /** true quando todas as ferramentas estão `ok`. */
  ready: boolean
}

export type SidecarInstallResult =
  { outcome: 'installed'; tools: string[] } | { outcome: 'declined' } | { outcome: 'cancelled' }

export type SidecarPhase = 'downloading' | 'extracting' | 'probing' | 'done'

export interface SidecarProgress {
  /** Ferramentas servidas pelo mesmo artefato, ex.: "mkvextract+mkvmerge". */
  archive: string
  phase: SidecarPhase
  received: number
  total: number | null
}

export type IpcError = { code: string; message: string }
export type IpcResult<T> = { ok: true; data: T } | { ok: false; error: IpcError }

/** Canais request/response (ipcRenderer.invoke <-> ipcMain.handle). */
export interface IpcInvokeContract {
  'app:get-info': { req: void; res: AppInfo }
  'app:check-update': { req: void; res: AppUpdateInfo }
  'sidecars:check': { req: void; res: SidecarReport }
  /** O Main exibe diálogo nativo de consentimento; sem aceite, nada é baixado. */
  'sidecars:install': { req: { tools: string[] }; res: SidecarInstallResult }
  'sidecars:cancel': { req: void; res: { cancelled: boolean } }
}

/** Canais push (main -> renderer). Payload tipado por canal. */
export interface IpcEventContract {
  'sidecars:progress': SidecarProgress
}

export type InvokeChannel = keyof IpcInvokeContract
export type EventChannel = keyof IpcEventContract

/** Allowlists em runtime — o preload só expõe o que está listado aqui. */
export const INVOKE_CHANNELS = [
  'app:get-info',
  'app:check-update',
  'sidecars:check',
  'sidecars:install',
  'sidecars:cancel'
] as const satisfies readonly InvokeChannel[]
export const EVENT_CHANNELS = ['sidecars:progress'] as const satisfies readonly EventChannel[]

/** Superfície tipada de `window.api`. */
export interface BakaSubApi {
  app: {
    getInfo(): Promise<IpcResult<AppInfo>>
    checkUpdate(): Promise<IpcResult<AppUpdateInfo>>
  }
  sidecars: {
    check(): Promise<IpcResult<SidecarReport>>
    install(tools: string[]): Promise<IpcResult<SidecarInstallResult>>
    cancel(): Promise<IpcResult<{ cancelled: boolean }>>
  }
  events: {
    on<C extends EventChannel>(
      channel: C,
      listener: (payload: IpcEventContract[C]) => void
    ): () => void
  }
}
