import { vi } from 'vitest'
import type { BakaSubApi, EventChannel, IpcEventContract, IpcResult } from '@shared/ipc-contract'

type Impl = {
  [NS in Exclude<keyof BakaSubApi, 'events'>]?: {
    [M in keyof BakaSubApi[NS]]?: BakaSubApi[NS][M]
  }
}

export interface FakeApi {
  api: BakaSubApi
  /** Pushes an event to every subscriber, like the Main would. */
  emit<C extends EventChannel>(channel: C, payload: IpcEventContract[C]): void
}

export const ok = <T>(data: T): Promise<IpcResult<T>> => Promise.resolve({ ok: true, data })

/**
 * Typed fake of `window.api`. Calls without an implementation reject loudly, so a test never
 * passes by accident on an unmocked channel.
 */
export function installFakeApi(impl: Impl = {}): FakeApi {
  const listeners = new Map<string, Set<(p: unknown) => void>>()
  const ns = (name: string): unknown =>
    new Proxy(
      {},
      {
        get: (_t, method: string) => {
          const fn = (impl as Record<string, Record<string, unknown> | undefined>)[name]?.[method]
          return (
            fn ??
            vi.fn(() => Promise.reject(new Error(`window.api.${name}.${method} is not mocked`)))
          )
        }
      }
    )
  const api = new Proxy(
    {},
    {
      get: (_t, name: string) =>
        name === 'events'
          ? {
              on: (channel: string, cb: (p: unknown) => void) => {
                const set = listeners.get(channel) ?? new Set()
                set.add(cb)
                listeners.set(channel, set)
                return () => set.delete(cb)
              }
            }
          : ns(name)
    }
  ) as BakaSubApi
  Object.defineProperty(window, 'api', { value: api, configurable: true, writable: true })
  return {
    api,
    emit: (channel, payload) => listeners.get(channel)?.forEach((cb) => cb(payload))
  }
}
