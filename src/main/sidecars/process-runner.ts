import { spawn, type ChildProcess } from 'node:child_process'
import { basename } from 'node:path'
import { AppError } from '../errors'
import type { Log } from './types'

export interface RunOptions {
  cwd?: string
  env?: Record<string, string>
  signal?: AbortSignal
  timeoutMs?: number
  /** Janela entre SIGTERM e SIGKILL. */
  killGraceMs?: number
}

export interface RunResult {
  code: number | null
  stdout: string
  stderr: string
}

const OUTPUT_CAP = 1_000_000

/**
 * Único ponto de spawn de CLIs externos: captura stderr no log, aplica timeout/abort
 * (SIGTERM -> SIGKILL) e rastreia filhos vivos para descarte no shutdown.
 */
export class ProcessRunner {
  private readonly live = new Set<ChildProcess>()

  constructor(private readonly log: Log) {}

  run(command: string, args: string[], opts: RunOptions = {}): Promise<RunResult> {
    return new Promise((resolve, reject) => {
      if (opts.signal?.aborted) return reject(new AppError('CANCELLED', 'Operação cancelada'))

      const name = basename(command)
      const child = spawn(command, args, {
        cwd: opts.cwd,
        env: { ...process.env, ...opts.env },
        windowsHide: true,
        stdio: ['ignore', 'pipe', 'pipe']
      })
      this.live.add(child)

      let stdout = ''
      let stderr = ''
      let timedOut = false
      let aborted = false
      let killTimer: NodeJS.Timeout | undefined
      child.stdout.on('data', (d) => {
        if (stdout.length < OUTPUT_CAP) stdout += d
      })
      child.stderr.on('data', (d) => {
        if (stderr.length < OUTPUT_CAP) stderr += d
      })

      const terminate = (): void => {
        if (child.exitCode !== null || child.signalCode !== null) return
        child.kill('SIGTERM')
        killTimer = setTimeout(() => child.kill('SIGKILL'), opts.killGraceMs ?? 3000)
      }
      const onAbort = (): void => {
        aborted = true
        terminate()
      }
      opts.signal?.addEventListener('abort', onAbort, { once: true })
      const timeout = opts.timeoutMs
        ? setTimeout(() => {
            timedOut = true
            terminate()
          }, opts.timeoutMs)
        : undefined

      const cleanup = (): void => {
        clearTimeout(timeout)
        clearTimeout(killTimer)
        opts.signal?.removeEventListener('abort', onAbort)
        this.live.delete(child)
      }

      child.once('error', (err) => {
        cleanup()
        reject(err)
      })
      child.once('close', (code) => {
        cleanup()
        if (stderr.trim() && code !== 0) {
          this.log.warn(`${name} stderr: ${stderr.trim().slice(0, 2000)}`)
        }
        if (aborted) return reject(new AppError('CANCELLED', 'Operação cancelada'))
        if (timedOut) return reject(new AppError('PROCESS_TIMEOUT', `${name} excedeu o timeout`))
        resolve({ code, stdout, stderr })
      })
    })
  }

  /** Encerra todos os filhos vivos (SIGTERM, depois SIGKILL). Registrar no ShutdownCoordinator. */
  async disposeAll(graceMs = 2000): Promise<void> {
    const children = [...this.live]
    for (const c of children) c.kill('SIGTERM')
    await new Promise((r) => setTimeout(r, Math.min(graceMs, children.length ? graceMs : 0)))
    for (const c of children) {
      if (c.exitCode === null && c.signalCode === null) c.kill('SIGKILL')
    }
  }
}
