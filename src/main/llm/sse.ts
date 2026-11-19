/** Evento Server-Sent Events já montado (campos desconhecidos são ignorados). */
export interface SseEvent {
  readonly data: string
  readonly event?: string
  readonly id?: string
}

/**
 * Decodificador SSE incremental (WHATWG): aceita bytes em pedaços arbitrários, inclusive no meio
 * de um caractere UTF-8 ou entre `\r` e `\n`. Comentários (`:`, ex.: o keep-alive
 * ": OPENROUTER PROCESSING") são descartados; um bloco sem `data` não é despachado; um bloco
 * final sem linha em branco é descartado (como no navegador).
 */
export class SseDecoder {
  private readonly text = new TextDecoder('utf-8')
  private buf = ''
  /** O último caractere processado foi `\r`: um `\n` imediato pertence à mesma quebra. */
  private pendingCr = false
  private started = false
  private data: string[] = []
  private event: string | undefined
  private id: string | undefined

  push(chunk: Uint8Array): SseEvent[] {
    return this.feed(this.text.decode(chunk, { stream: true }))
  }

  end(): SseEvent[] {
    // O resto sem fim de linha nunca é despachado.
    const out = this.feed(this.text.decode())
    this.buf = ''
    return out
  }

  private feed(s: string): SseEvent[] {
    if (!this.started && s.length > 0) {
      this.started = true
      if (s.charCodeAt(0) === 0xfeff) s = s.slice(1)
    }
    if (this.pendingCr && s.startsWith('\n')) s = s.slice(1)
    this.pendingCr = false

    const out: SseEvent[] = []
    this.buf += s
    let start = 0
    for (let i = 0; i < this.buf.length; i++) {
      const c = this.buf.charCodeAt(i)
      if (c !== 10 && c !== 13) continue
      this.line(this.buf.slice(start, i), out)
      if (c === 13) {
        if (i + 1 < this.buf.length) {
          if (this.buf.charCodeAt(i + 1) === 10) i++
        } else this.pendingCr = true
      }
      start = i + 1
    }
    this.buf = this.buf.slice(start)
    return out
  }

  private line(line: string, out: SseEvent[]): void {
    if (line === '') {
      if (this.data.length > 0) {
        out.push({
          data: this.data.join('\n'),
          ...(this.event !== undefined ? { event: this.event } : {}),
          ...(this.id !== undefined ? { id: this.id } : {})
        })
      }
      this.data = []
      this.event = undefined
      this.id = undefined
      return
    }
    if (line.startsWith(':')) return
    const colon = line.indexOf(':')
    const field = colon === -1 ? line : line.slice(0, colon)
    let value = colon === -1 ? '' : line.slice(colon + 1)
    if (value.startsWith(' ')) value = value.slice(1)
    if (field === 'data') this.data.push(value)
    else if (field === 'event') this.event = value
    else if (field === 'id') this.id = value
  }
}

/** Itera eventos de um corpo HTTP. `onBytes` é chamado a cada pedaço (base do timeout de inatividade). */
export async function* readSse(
  body: AsyncIterable<Uint8Array>,
  onBytes?: () => void
): AsyncGenerator<SseEvent> {
  const decoder = new SseDecoder()
  for await (const chunk of body) {
    onBytes?.()
    yield* decoder.push(chunk)
  }
  yield* decoder.end()
}
