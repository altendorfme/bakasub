import { z } from 'zod'

/**
 * Registro único das configurações comuns: chave -> schema + default. Ler uma chave ausente ou
 * com valor inválido devolve o default. Segredos NÃO entram aqui (ver `SecretVault`).
 */
export const SETTINGS_SCHEMA = {
  /** Catálogo de `/api/v1/models` com TTL (ver `src/main/llm/model-catalog.ts`). */
  'models.cache': {
    schema: z
      .object({
        fetchedAt: z.number(),
        /** Itens já normalizados; o `ModelCatalog` revalida cada um ao ler. */
        models: z.array(z.unknown())
      })
      .nullable(),
    default: null
  },
  /** Modelo OpenRouter usado quando o preset não define um. */
  'translation.defaultModel': { schema: z.string().min(1).max(200).nullable(), default: null },
  /** Sem padrão de fábrica: o onboarding obriga o usuário a escolher. Sempre está em `targetLangs`. */
  'translation.defaultTargetLang': {
    schema: z.string().min(1).max(35).nullable(),
    default: null as string | null
  },
  /** Idiomas de destino habilitados pelo usuário (tela Languages). BCP-47 canônico. */
  'translation.targetLangs': {
    schema: z.array(z.string().min(1).max(35)).max(30),
    default: [] as string[]
  },
  /** Modelos favoritos (ids do OpenRouter): os únicos oferecidos ao traduzir. Contém o padrão. */
  'models.favorites': {
    schema: z.array(z.string().min(1).max(200)).max(50),
    default: [] as string[]
  },
  /** Preset usado quando o job não escolhe um. */
  'translation.defaultPresetId': { schema: z.string().min(1).max(64), default: 'builtin:series' },
  /** Idioma da interface e dos guias. `null` = seguir o idioma do sistema. */
  'ui.language': {
    schema: z.enum(['en', 'pt-BR']).nullable(),
    default: null as 'en' | 'pt-BR' | null
  },
  /** `debug` = log detalhado (tela Settings: "Verbose logging"). Vale na hora. */
  'logs.level': { schema: z.enum(['info', 'debug']), default: 'info' as 'info' | 'debug' },
  /** Jobs executados ao mesmo tempo. */
  'jobs.concurrency': { schema: z.number().int().min(1).max(4), default: 2 },
  /** Preflight: o job segue sozinho se o custo máximo estimado (USD) ficar abaixo disto. `null` = sempre perguntar. */
  'preflight.autoConfirmBelowUsd': {
    schema: z.number().min(0).max(1000).nullable(),
    default: null
  },
  /**
   * Avançado: limites e retry das chamadas ao OpenRouter (ver docs/rate-limits.md). Lidos a cada
   * requisição, então valem para jobs em andamento. `freeRpm` 20 = limite do OpenRouter.
   */
  'llm.rateLimit.freeRpm': { schema: z.number().int().min(1).max(60), default: 20 },
  /** `null` = sem teto (o OpenRouter não limita modelos pagos; o provedor pode devolver 429). */
  'llm.rateLimit.paidRpm': {
    schema: z.number().int().min(1).max(1000).nullable(),
    default: null as number | null
  },
  /** Patamar da cota diária free: `auto` lê `GET /key`; `under-10` = 50/dia, `over-10` = 1000/dia. */
  'llm.rateLimit.freeTier': {
    schema: z.enum(['auto', 'under-10', 'over-10']),
    default: 'auto' as 'auto' | 'under-10' | 'over-10'
  },
  'llm.retry.maxThrottled': { schema: z.number().int().min(1).max(10), default: 5 },
  'llm.retry.maxTransient': { schema: z.number().int().min(1).max(10), default: 3 },
  'llm.retry.baseDelayMs': { schema: z.number().int().min(250).max(10_000), default: 1000 },
  'llm.retry.maxDelayMs': { schema: z.number().int().min(1000).max(120_000), default: 30_000 },
  /** Rodadas extras de um chunk (60 s, 120 s…) depois de esgotar o retry de transporte. */
  'llm.retry.chunkRounds': { schema: z.number().int().min(0).max(5), default: 2 },
  /** Idiomas de origem preferidos (ordem) na seleção automática de faixas do batch. */
  'tracks.preferredSourceLangs': {
    schema: z.array(z.string().min(1).max(35)).max(10),
    default: ['en']
  }
} as const satisfies Record<string, { schema: z.ZodType; default: unknown }>

export type SettingKey = keyof typeof SETTINGS_SCHEMA
export type SettingValue<K extends SettingKey> = z.infer<(typeof SETTINGS_SCHEMA)[K]['schema']>
