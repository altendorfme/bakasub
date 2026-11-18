import type { IpcResult } from '@shared/ipc-contract'

export class IpcCallError extends Error {
  constructor(
    readonly code: string,
    message: string
  ) {
    super(message)
  }
}

/** Converte o envelope IPC em throw, para integrar com TanStack Query. */
export async function unwrap<T>(call: Promise<IpcResult<T>>): Promise<T> {
  const result = await call
  if (!result.ok) throw new IpcCallError(result.error.code, result.error.message)
  return result.data
}
