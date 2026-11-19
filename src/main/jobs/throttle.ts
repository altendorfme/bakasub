export interface Throttle<T> {
  push(value: T): void
  /** Emite já o valor pendente (ex.: evento final de um job). */
  flush(): void
  cancel(): void
}

/** Leading + trailing: o primeiro valor sai na hora; depois, no máximo um por janela (o último). */
export function createThrottle<T>(ms: number, emit: (value: T) => void): Throttle<T> {
  let timer: NodeJS.Timeout | null = null
  let pending: { value: T } | null = null
  const fire = (): void => {
    timer = null
    if (!pending) return
    const { value } = pending
    pending = null
    emit(value)
    timer = setTimeout(fire, ms)
  }
  return {
    push(value) {
      pending = { value }
      if (!timer) fire()
    },
    flush() {
      if (timer) clearTimeout(timer)
      timer = null
      if (pending) {
        const { value } = pending
        pending = null
        emit(value)
      }
    },
    cancel() {
      if (timer) clearTimeout(timer)
      timer = null
      pending = null
    }
  }
}
