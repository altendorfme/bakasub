import type { FreeQuotaStatus, FreeTierSetting } from '../../shared/ipc-contract'
import type { KeyInfo } from './openrouter-client'

/** Cotas diárias de modelos free do OpenRouter (UTC), por créditos comprados (total histórico). */
export const FREE_DAILY_LIMIT = { 'under-10': 50, 'over-10': 1000 } as const
const KEY_INFO_TTL_MS = 30_000

/**
 * Cota diária de modelos `:free`: patamar (menos/mais de US$ 10 comprados) lido de `GET /key`,
 * a não ser que o usuário fixe o patamar em Settings. Sem resposta, assume 50/dia.
 */
export class FreeQuota {
  private cached: { at: number; info: KeyInfo | null } | null = null
  private readonly now: () => number

  constructor(
    private readonly d: {
      keyInfo: (signal?: AbortSignal) => Promise<KeyInfo>
      tierSetting: () => Promise<FreeTierSetting>
      now?: () => number
    }
  ) {
    this.now = d.now ?? Date.now
  }

  /** Esquece o `/key` em cache (ex.: a API key mudou). */
  invalidate(): void {
    this.cached = null
  }

  async status(signal?: AbortSignal): Promise<FreeQuotaStatus> {
    const [setting, info] = await Promise.all([this.d.tierSetting(), this.info(signal)])
    const daily = info?.freeDaily ?? null
    if (setting !== 'auto') {
      const limit = FREE_DAILY_LIMIT[setting]
      const used = daily?.used ?? null
      return {
        tier: setting,
        source: 'override',
        limit,
        used,
        remaining: used === null ? null : Math.max(0, limit - used)
      }
    }
    if (!daily)
      return {
        tier: 'unknown',
        source: 'auto',
        limit: FREE_DAILY_LIMIT['under-10'],
        used: null,
        remaining: null
      }
    return {
      tier: daily.limit >= FREE_DAILY_LIMIT['over-10'] ? 'over-10' : 'under-10',
      source: 'auto',
      limit: daily.limit,
      used: daily.used,
      remaining: daily.remaining
    }
  }

  private async info(signal?: AbortSignal): Promise<KeyInfo | null> {
    const now = this.now()
    if (this.cached && now - this.cached.at < KEY_INFO_TTL_MS) return this.cached.info
    // Sem key, offline, 401…: a cota fica "desconhecida", nunca derruba quem perguntou.
    const info = await this.d.keyInfo(signal).catch(() => null)
    this.cached = { at: now, info }
    return info
  }
}
