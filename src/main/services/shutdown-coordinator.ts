import { logger } from '../logging/logger'

type Disposer = () => Promise<void> | void

/**
 * Registro de disposers executados em ordem LIFO no encerramento.
 * Jobs/sidecars/DB se registram aqui; `run()` é idempotente e com timeout global.
 */
export class ShutdownCoordinator {
  private readonly disposers: Array<{ name: string; fn: Disposer }> = []
  private running: Promise<void> | null = null

  register(name: string, fn: Disposer): void {
    this.disposers.push({ name, fn })
  }

  run(timeoutMs = 8000): Promise<void> {
    this.running ??= this.execute(timeoutMs)
    return this.running
  }

  private async execute(timeoutMs: number): Promise<void> {
    const work = (async () => {
      for (const { name, fn } of [...this.disposers].reverse()) {
        try {
          await fn()
          logger.app.info(`disposed: ${name}`)
        } catch (err) {
          logger.app.error(`dispose failed: ${name}`, err)
        }
      }
    })()
    const timeout = new Promise<void>((resolve) => setTimeout(resolve, timeoutMs).unref())
    await Promise.race([work, timeout])
  }
}

export const shutdown = new ShutdownCoordinator()
