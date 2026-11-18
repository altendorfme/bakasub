import { ipcMain, type IpcMainInvokeEvent } from 'electron'
import type { ZodType } from 'zod'
import { is } from '@electron-toolkit/utils'
import type { InvokeChannel, IpcInvokeContract, IpcResult } from '../../shared/ipc-contract'
import { AppError } from '../errors'
import { logger } from '../logging/logger'

function isTrustedSender(event: IpcMainInvokeEvent): boolean {
  const url = event.senderFrame?.url ?? ''
  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    return url.startsWith(process.env['ELECTRON_RENDERER_URL'])
  }
  return url.startsWith('file://')
}

interface HandlerOptions<C extends InvokeChannel> {
  /** Schema Zod do payload de entrada; obrigatório quando `req` não é void. */
  input?: ZodType<IpcInvokeContract[C]['req']>
  handle(
    payload: IpcInvokeContract[C]['req'],
    event: IpcMainInvokeEvent
  ): Promise<IpcInvokeContract[C]['res']> | IpcInvokeContract[C]['res']
}

/** Registra um handler com validação de origem, parse Zod e envelope de resultado/erro. */
export function createHandler<C extends InvokeChannel>(
  channel: C,
  options: HandlerOptions<C>
): void {
  ipcMain.handle(channel, async (event, raw): Promise<IpcResult<IpcInvokeContract[C]['res']>> => {
    if (!isTrustedSender(event)) {
      logger.ipc.warn(`rejected untrusted sender on ${channel}: ${event.senderFrame?.url}`)
      return { ok: false, error: { code: 'FORBIDDEN', message: 'Untrusted sender' } }
    }
    try {
      let payload = raw as IpcInvokeContract[C]['req']
      if (options.input) {
        const parsed = options.input.safeParse(raw)
        if (!parsed.success) {
          return { ok: false, error: { code: 'INVALID_INPUT', message: parsed.error.message } }
        }
        payload = parsed.data
      }
      return { ok: true, data: await options.handle(payload, event) }
    } catch (err) {
      if (err instanceof AppError) {
        logger.ipc.warn(`${channel} -> ${err.code}: ${err.message}`)
        return { ok: false, error: { code: err.code, message: err.message } }
      }
      logger.ipc.error(`handler failed: ${channel}`, err)
      return {
        ok: false,
        error: { code: 'INTERNAL', message: err instanceof Error ? err.message : 'Unknown error' }
      }
    }
  })
}
