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
}

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
}

/**
 * Limitador proativo, único no processo e compartilhado por todos os jobs: janela deslizante
 * de 60 s por faixa e cooldown da faixa inteira depois de um 429. A config é lida a cada
 * `acquire`, então mudanças em Settings valem para jobs em andamento.
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
    const lane = (): LaneState => ({ sent: [], cooldownUntil: 0, tail: Promise.resolve() })
    this.lanes = { free: lane(), paid: lane() }
  }

  /** Espera a vez na faixa. Rejeita com o motivo do `signal` se cancelado (sem gastar vaga). */
  async acquire(
    lane: RateLane,
    o: { signal?: AbortSignal; onWait?: (w: WaitInfo) => void } = {}
  ): Promise<void> {
    const s = this.lanes[lane]
    const prev = s.tail
    let release!: () => void
    s.tail = new Promise((r) => (release = r))
    try {
      await prev
      for (;;) {
        if (o.signal?.aborted) throw o.signal.reason
        const wait = await this.waitFor(lane)
        if (!wait) {
          s.sent.push(this.now())
          return
        }
        o.onWait?.(wait)
        await this.d.sleep(wait.untilMs - this.now(), o.signal)
      }
    } finally {
      release()
    }
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
    const rpm = lane === 'free' ? cfg.freeRpm : cfg.paidRpm
    s.sent = s.sent.filter((t) => t > now - WINDOW_MS)
    if (rpm === null || s.sent.length < rpm) return null
    // A vaga abre quando a (len - rpm + 1)-ésima mais antiga sai da janela.
    const oldest = s.sent[s.sent.length - rpm]
    return { reason: 'rate-limit', untilMs: oldest + WINDOW_MS }
  }
}
