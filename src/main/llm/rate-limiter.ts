import type { Sleep } from './llm-session'
import type { ModelInfo } from './model-catalog'

/**
 * Faixas de limite do OpenRouter. Modelos `:free` dividem um limite por conta (20 req/min,
 * mais a cota diária); pagos não têm teto da plataforma (o 429 vem do provedor upstream).
 */
export type RateLane = 'free' | 'paid'

export const laneOf = (m: ModelInfo): RateLane =>
  m.id.endsWith(':free') ||
  (m.pricing !== null && m.pricing.prompt === 0 && m.pricing.completion === 0)
    ? 'free'
    : 'paid'

export interface RateLimitConfig {
  /** Requisições por minuto na faixa free. */
  readonly freeRpm: number
  /** `null` = sem teto (só concorrência + backoff reativo). */
  readonly paidRpm: number | null
  /**
   * Teto de requisições em voo na faixa, somando todos os jobs (`llm.concurrency.*MaxInFlight`).
   * Ausente = sem teto. O limite efetivo é adaptativo (AIMD) abaixo deste teto.
   */
  readonly freeMaxInFlight?: number
  readonly paidMaxInFlight?: number
}

/** Como a requisição terminou: `throttled` = 429 ou 402 de orçamento em voo (reduz o AIMD). */
export type LeaseOutcome = 'ok' | 'throttled' | 'other'

/** Vaga em voo. `release` é idempotente e deve ser chamado assim que a resposta (ou o erro) chega. */
export interface Lease {
  release(outcome: LeaseOutcome): void
}

/** Sucessos seguidos para o AIMD subir +1. */
export const AIMD_INCREASE_AFTER = 5
/** Faixa sem requisições por este tempo volta ao teto configurado. */
export const AIMD_IDLE_RESET_MS = 5 * 60_000

export type WaitReason = 'rate-limit' | 'cooldown' | 'backoff'
export interface WaitInfo {
  readonly reason: WaitReason
  /** Epoch ms. */
  readonly untilMs: number
}

const WINDOW_MS = 60_000

interface LaneState {
  /** Horários das requisições liberadas na última janela. */
  sent: number[]
  cooldownUntil: number
  /** Fim da fila de espera: atende na ordem de chegada. */
  tail: Promise<void>
  inFlight: number
  /** Teto lido da config no último `acquire`. */
  cap: number
  /** Limite efetivo do AIMD; `null` = o teto. */
  limit: number | null
  successes: number
  lastActivity: number
  /** Sobe a cada redução: um lease de antes dela não reduz de novo (uma redução por rajada). */
  epoch: number
  /** Quem espera vaga em voo (acordados a cada `release`). */
  waiters: Set<() => void>
}

/**
 * Limitador proativo, único no processo e compartilhado por todos os jobs: janela deslizante
 * de 60 s por faixa, cooldown da faixa inteira depois de um 429 e teto de requisições em voo
 * com AIMD (metade em `throttled`, +1 a cada 5 sucessos seguidos, volta ao teto após 5 min
 * ociosa). A config é lida a cada `acquire`, então mudanças em Settings valem para jobs em
 * andamento.
 */
export class RateLimiter {
  private readonly lanes: Record<RateLane, LaneState>
  private readonly now: () => number

  constructor(
    private readonly d: {
      config: () => Promise<RateLimitConfig>
      sleep: Sleep
      now?: () => number
    }
  ) {
    this.now = d.now ?? Date.now
    const lane = (): LaneState => ({
      sent: [],
      cooldownUntil: 0,
      tail: Promise.resolve(),
      inFlight: 0,
      cap: Infinity,
      limit: null,
      successes: 0,
      lastActivity: 0,
      epoch: 0,
      waiters: new Set()
    })
    this.lanes = { free: lane(), paid: lane() }
  }

  /**
   * Espera a vez na faixa (ordem de chegada) e ocupa uma vaga em voo. Rejeita com o motivo do
   * `signal` se cancelado (sem gastar vaga). Esperar vaga em voo não é reportado em `onWait`:
   * é o paralelismo funcionando, não o OpenRouter segurando.
   */
  async acquire(
    lane: RateLane,
    o: { signal?: AbortSignal; onWait?: (w: WaitInfo) => void } = {}
  ): Promise<Lease> {
    const s = this.lanes[lane]
    const prev = s.tail
    let release!: () => void
    s.tail = new Promise((r) => (release = r))
    try {
      await prev
      for (;;) {
        if (o.signal?.aborted) throw o.signal.reason
        const wait = await this.waitFor(lane)
        if (wait) {
          o.onWait?.(wait)
          await this.d.sleep(wait.untilMs - this.now(), o.signal)
          continue
        }
        if (s.inFlight >= this.effective(s)) {
          await this.slotFreed(s, o.signal)
          continue
        }
        s.sent.push(this.now())
        s.inFlight++
        s.lastActivity = this.now()
        return this.lease(s)
      }
    } finally {
      release()
    }
  }

  /** Limite efetivo agora (AIMD abaixo do teto). Para a UI e testes. */
  inFlightLimit(lane: RateLane): number {
    return this.effective(this.lanes[lane])
  }

  inFlight(lane: RateLane): number {
    return this.lanes[lane].inFlight
  }

  private effective(s: LaneState): number {
    return Math.min(s.cap, s.limit ?? s.cap)
  }

  private lease(s: LaneState): Lease {
    let done = false
    const epoch = s.epoch
    return {
      release: (outcome) => {
        if (done) return
        done = true
        s.inFlight--
        s.lastActivity = this.now()
        if (outcome === 'throttled') {
          s.successes = 0
          // A rajada de 429 de requisições que já estavam em voo conta como um evento só.
          if (epoch === s.epoch) {
            // Metade do limite efetivo; sem teto (infinito), metade do que estava em voo.
            const limit = this.effective(s)
            const base = Number.isFinite(limit) ? limit : s.inFlight + 1
            s.limit = Math.max(1, Math.floor(base / 2))
            s.epoch++
          }
        } else if (outcome === 'ok' && s.limit !== null && epoch === s.epoch) {
          if (++s.successes >= AIMD_INCREASE_AFTER) {
            s.successes = 0
            s.limit = s.limit + 1 >= s.cap ? null : s.limit + 1
          }
        }
        const waiters = [...s.waiters]
        s.waiters.clear()
        for (const w of waiters) w()
      }
    }
  }

  private slotFreed(s: LaneState, signal?: AbortSignal): Promise<void> {
    return new Promise((resolve, reject) => {
      const wake = (): void => {
        signal?.removeEventListener('abort', onAbort)
        resolve()
      }
      const onAbort = (): void => {
        s.waiters.delete(wake)
        reject(signal?.reason)
      }
      s.waiters.add(wake)
      signal?.addEventListener('abort', onAbort, { once: true })
    })
  }

  /** Pausa a faixa até `untilMs` (nunca encurta um cooldown já maior). */
  cooldown(lane: RateLane, untilMs: number): void {
    const s = this.lanes[lane]
    s.cooldownUntil = Math.max(s.cooldownUntil, untilMs)
  }

  cooldownUntil(lane: RateLane): number | null {
    const until = this.lanes[lane].cooldownUntil
    return until > this.now() ? until : null
  }

  private async waitFor(lane: RateLane): Promise<WaitInfo | null> {
    const s = this.lanes[lane]
    const now = this.now()
    if (s.cooldownUntil > now) return { reason: 'cooldown', untilMs: s.cooldownUntil }
    const cfg = await this.d.config()
    s.cap = (lane === 'free' ? cfg.freeMaxInFlight : cfg.paidMaxInFlight) ?? Infinity
    if (s.inFlight === 0 && s.limit !== null && now - s.lastActivity > AIMD_IDLE_RESET_MS) {
      s.limit = null
      s.successes = 0
    }
    if (s.limit !== null && s.limit >= s.cap) s.limit = null
    const rpm = lane === 'free' ? cfg.freeRpm : cfg.paidRpm
    s.sent = s.sent.filter((t) => t > now - WINDOW_MS)
    if (rpm === null || s.sent.length < rpm) return null
    // A vaga abre quando a (len - rpm + 1)-ésima mais antiga sai da janela.
    const oldest = s.sent[s.sent.length - rpm]
    return { reason: 'rate-limit', untilMs: oldest + WINDOW_MS }
  }
}
