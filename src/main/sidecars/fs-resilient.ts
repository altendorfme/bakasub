import { cp, rename, rm } from 'node:fs/promises'
import type { Log } from './types'

/** Códigos que indicam handle transitório (antivírus, indexador, processo ainda encerrando). */
const TRANSIENT = new Set(['EPERM', 'EBUSY', 'EACCES'])

export function errCode(err: unknown): string | undefined {
  return (err as NodeJS.ErrnoException | null)?.code
}

export function describeError(err: unknown): string {
  const code = errCode(err)
  const msg = err instanceof Error ? err.message : String(err)
  return code && !msg.includes(code) ? `${code}: ${msg}` : msg
}

/** Backoff do rename: ~10 s no Windows (varredura do Defender), curto nos demais. */
export function defaultRenameDelays(platform: string = process.platform): number[] {
  return platform === 'win32' ? [100, 200, 400, 800, 1500, 2000, 2000, 3000] : [100, 200, 400]
}

export interface FsOps {
  rename(from: string, to: string): Promise<void>
  cp(from: string, to: string): Promise<void>
  rm(path: string, opts?: { maxRetries?: number; retryDelay?: number }): Promise<void>
}

export const realFs: FsOps = {
  rename: (a, b) => rename(a, b),
  cp: (a, b) => cp(a, b, { recursive: true, force: true }),
  rm: (p, o) => rm(p, { recursive: true, force: true, ...o })
}

export const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms))

/** rename com retry/backoff em EPERM/EBUSY/EACCES. Registra o erro original antes de cada recuo. */
export async function renameWithRetry(
  fs: FsOps,
  from: string,
  to: string,
  delays: number[],
  wait: (ms: number) => Promise<void>,
  log: Log
): Promise<void> {
  for (let attempt = 0; ; attempt++) {
    try {
      await fs.rename(from, to)
      return
    } catch (err) {
      const delay = delays[attempt]
      if (!TRANSIENT.has(errCode(err) ?? '') || delay === undefined) throw err
      log.warn(
        `sidecar rename ${errCode(err)} (tentativa ${attempt + 1}/${delays.length + 1}) -> ${to}; nova tentativa em ${delay} ms`,
        describeError(err)
      )
      await wait(delay)
    }
  }
}

/** Limpeza best-effort: nunca lança, só avisa. Sobras vão para o collectGarbage seguinte. */
export async function bestEffortRm(fs: FsOps, path: string, log: Log): Promise<void> {
  try {
    await fs.rm(path, { maxRetries: 5, retryDelay: 200 })
  } catch (err) {
    log.warn(`sidecar cleanup: não foi possível remover ${path}`, describeError(err))
  }
}
