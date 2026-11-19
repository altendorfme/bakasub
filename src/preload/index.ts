import { contextBridge, ipcRenderer, webUtils, type IpcRendererEvent } from 'electron'
import {
  EVENT_CHANNELS,
  INVOKE_CHANNELS,
  type BakaSubApi,
  type EventChannel,
  type InvokeChannel,
  type IpcInvokeContract,
  type IpcResult
} from '../shared/ipc-contract'

const invokeAllowlist: ReadonlySet<string> = new Set(INVOKE_CHANNELS)
const eventAllowlist: ReadonlySet<string> = new Set(EVENT_CHANNELS)

function invoke<C extends InvokeChannel>(
  channel: C,
  ...args: IpcInvokeContract[C]['req'] extends void ? [] : [IpcInvokeContract[C]['req']]
): Promise<IpcResult<IpcInvokeContract[C]['res']>> {
  if (!invokeAllowlist.has(channel)) {
    return Promise.reject(new Error(`IPC channel not allowed: ${channel}`))
  }
  return ipcRenderer.invoke(channel, ...args)
}

// Nunca expor `ipcRenderer` ou o `event` cru ao renderer.
const api: BakaSubApi = {
  app: {
    getInfo: () => invoke('app:get-info'),
    checkUpdate: () => invoke('app:check-update')
  },
  sidecars: {
    check: () => invoke('sidecars:check'),
    install: (tools) => invoke('sidecars:install', { tools }),
    cancel: () => invoke('sidecars:cancel')
  },
  memory: {
    stats: () => invoke('memory:stats'),
    prune: (olderThanDays) => invoke('memory:prune', { olderThanDays })
  },
  settings: {
    setApiKey: (apiKey) => invoke('settings:set-api-key', { apiKey }),
    clearApiKey: () => invoke('settings:clear-api-key'),
    apiKeyStatus: () => invoke('settings:api-key-status')
  },
  presets: {
    list: () => invoke('presets:list'),
    create: (preset) => invoke('presets:create', preset),
    update: (id, preset) => invoke('presets:update', { id, preset }),
    duplicate: (id, name) => invoke('presets:duplicate', { id, name }),
    delete: (id) => invoke('presets:delete', { id }),
    export: (ids) => invoke('presets:export', { ids }),
    import: (onConflict) => invoke('presets:import', { onConflict })
  },
  models: {
    list: (force) => invoke('models:list', { force })
  },
  media: {
    probe: (path) => invoke('media:probe', { path })
  },
  dialog: {
    openFiles: (kind, multiple) => invoke('dialog:open-files', { kind, multiple }),
    chooseOutputDir: () => invoke('dialog:choose-output-dir'),
    openFolder: () => invoke('dialog:open-folder')
  },
  batches: {
    plan: (request) => invoke('batches:plan', request),
    create: (request) => invoke('batches:create', request),
    list: () => invoke('batches:list'),
    get: (id) => invoke('batches:get', { id }),
    jobs: (id) => invoke('batches:jobs', { id }),
    cancel: (id) => invoke('batches:cancel', { id }),
    remove: (id) => invoke('batches:remove', { id }),
    confirm: (id) => invoke('batches:confirm', { id })
  },
  jobs: {
    create: (request) => invoke('jobs:create', request),
    list: () => invoke('jobs:list'),
    get: (id) => invoke('jobs:get', { id }),
    cancel: (id) => invoke('jobs:cancel', { id }),
    retry: (id) => invoke('jobs:retry', { id }),
    remove: (id) => invoke('jobs:remove', { id }),
    confirm: (id) => invoke('jobs:confirm', { id }),
    preflight: (id) => invoke('jobs:preflight', { id })
  },
  files: {
    pathFor: (file) => webUtils.getPathForFile(file)
  },
  events: {
    on(channel: EventChannel, listener) {
      if (!eventAllowlist.has(channel)) throw new Error(`IPC event not allowed: ${channel}`)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const wrapped = (_e: IpcRendererEvent, payload: any): void => listener(payload)
      ipcRenderer.on(channel, wrapped)
      return () => ipcRenderer.removeListener(channel, wrapped)
    }
  }
}

if (!process.contextIsolated) {
  throw new Error('contextIsolation must be enabled')
}
contextBridge.exposeInMainWorld('api', api)
