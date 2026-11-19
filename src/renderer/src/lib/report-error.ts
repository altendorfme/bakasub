import type { RendererErrorReport } from '@shared/ipc-contract'

const MAX_MESSAGE = 2000
const MAX_STACK = 8000

/** Sends a renderer error to the Main log (scope `renderer`). Never throws. */
export async function reportError(
  err: unknown,
  source: RendererErrorReport['source']
): Promise<void> {
  const e = err instanceof Error ? err : null
  try {
    await window.api.logs.report({
      level: 'error',
      message: (e?.message ?? String(err)).slice(0, MAX_MESSAGE),
      ...(e?.stack ? { stack: e.stack.slice(0, MAX_STACK) } : {}),
      source
    })
  } catch {
    // Nothing else to do: the IPC itself is down.
  }
}

/** `window.onerror` + `unhandledrejection`. Returns the uninstaller. */
export function installGlobalErrorReporting(): () => void {
  const onError = (ev: ErrorEvent): void => void reportError(ev.error ?? ev.message, 'window')
  const onRejection = (ev: PromiseRejectionEvent): void => void reportError(ev.reason, 'promise')
  window.addEventListener('error', onError)
  window.addEventListener('unhandledrejection', onRejection)
  return () => {
    window.removeEventListener('error', onError)
    window.removeEventListener('unhandledrejection', onRejection)
  }
}
