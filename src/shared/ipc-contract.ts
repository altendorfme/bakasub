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

export interface MemoryStats {
  rows: number
  /** Bytes em disco da tabela e índices do Job Memory. */
  bytes: number
  /** ISO 8601 do `last_used_at` mais antigo; `null` com o cache vazio. */
  oldestUsedAt: string | null
}

/** "Não usado há mais de N dias", ou limpar tudo. */
export type MemoryPruneScope = 1 | 3 | 7 | 30 | 'all'

export interface MemoryPruneResult {
  deleted: number
  /** Estado depois do prune (o tamanho em disco já reflete o `incremental_vacuum`). */
  stats: MemoryStats
}

export interface ApiKeyStatus {
  present: boolean
  /** `os`: protegida pelo cofre do sistema; `none`: sem keyring disponível (a UI deve avisar). */
  protection: 'os' | 'none'
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
  'memory:stats': { req: void; res: MemoryStats }
  /** Recusado com `MEMORY_BUSY` enquanto houver job ativo. */
  'memory:prune': { req: { olderThanDays: MemoryPruneScope }; res: MemoryPruneResult }
  /** Somente escrita: a chave nunca volta ao renderer. */
  'settings:set-api-key': { req: { apiKey: string }; res: ApiKeyStatus }
  'settings:clear-api-key': { req: void; res: ApiKeyStatus }
  'settings:api-key-status': { req: void; res: ApiKeyStatus }
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
  'sidecars:cancel',
  'memory:stats',
  'memory:prune',
  'settings:set-api-key',
  'settings:clear-api-key',
  'settings:api-key-status'
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
  memory: {
    stats(): Promise<IpcResult<MemoryStats>>
    prune(olderThanDays: MemoryPruneScope): Promise<IpcResult<MemoryPruneResult>>
  }
  settings: {
    setApiKey(apiKey: string): Promise<IpcResult<ApiKeyStatus>>
    clearApiKey(): Promise<IpcResult<ApiKeyStatus>>
    apiKeyStatus(): Promise<IpcResult<ApiKeyStatus>>
  }
  events: {
    on<C extends EventChannel>(
      channel: C,
      listener: (payload: IpcEventContract[C]) => void
    ): () => void
  }
}
