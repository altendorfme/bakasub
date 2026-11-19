import type { LogEntry } from '../../shared/ipc-contract'

/**
 * Live log feed for the Logs screen. Entries are only buffered while the renderer watches, and
 * sent in batches so a chatty job cannot flood IPC. Logging must never fail because of this.
 */
export class LogStream {
  private watching = false
  private buffer: LogEntry[] = []
  private timer: ReturnType<typeof setTimeout> | null = null
  private readonly intervalMs: number
  private readonly maxBatch: number

  constructor(
    private readonly emit: (batch: LogEntry[]) => void,
    o: { intervalMs?: number; maxBatch?: number } = {}
  ) {
    this.intervalMs = o.intervalMs ?? 250
    this.maxBatch = o.maxBatch ?? 500
  }

  watch(on: boolean): void {
    this.watching = on
    if (!on) {
      this.buffer = []
      if (this.timer) clearTimeout(this.timer)
      this.timer = null
    }
  }

  publish(entry: LogEntry): void {
    if (!this.watching) return
    this.buffer.push(entry)
    if (this.buffer.length > this.maxBatch)
      this.buffer.splice(0, this.buffer.length - this.maxBatch)
    this.timer ??= setTimeout(() => this.flush(), this.intervalMs)
  }

  private flush(): void {
    this.timer = null
    const batch = this.buffer
    this.buffer = []
    if (batch.length === 0) return
    try {
      this.emit(batch)
    } catch {
      // The window may be gone; the entries are still in the file.
    }
  }
}

/** Sliding window: at most `max` takes per `windowMs`. */
export class RateLimiter {
  private stamps: number[] = []

  constructor(
    private readonly max: number,
    private readonly windowMs: number,
    private readonly now: () => number = Date.now
  ) {}

  take(): boolean {
    const t = this.now()
    this.stamps = this.stamps.filter((s) => t - s < this.windowMs)
    if (this.stamps.length >= this.max) return false
    this.stamps.push(t)
    return true
  }
}
