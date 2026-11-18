import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron'
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
