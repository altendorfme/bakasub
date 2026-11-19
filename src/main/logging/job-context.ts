import { AsyncLocalStorage } from 'node:async_hooks'

const store = new AsyncLocalStorage<{ jobId: string }>()

/**
 * Runs `fn` with `jobId` attached to everything it logs, including awaits, timers and child
 * process callbacks started inside it. No logger has to be passed down through the modules.
 */
export const runWithJob = <T>(jobId: string, fn: () => T): T => store.run({ jobId }, fn)

export const currentJobId = (): string | undefined => store.getStore()?.jobId
