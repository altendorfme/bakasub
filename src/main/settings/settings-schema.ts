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
  /** `debug` = log detalhado (tela Settings: "Verbose logging"). Vale na hora. */
  'logs.level': { schema: z.enum(['info', 'debug']), default: 'info' as 'info' | 'debug' },
  /** Jobs executados ao mesmo tempo. */
  'jobs.concurrency': { schema: z.number().int().min(1).max(4), default: 2 },
  /** Preflight: o job segue sozinho se o custo máximo estimado (USD) ficar abaixo disto. `null` = sempre perguntar. */
  'preflight.autoConfirmBelowUsd': {
    schema: z.number().min(0).max(1000).nullable(),
    default: null
  },
  /** Idiomas de origem preferidos (ordem) na seleção automática de faixas do batch. */
  'tracks.preferredSourceLangs': {
    schema: z.array(z.string().min(1).max(35)).max(10),
    default: ['en']
  }
} as const satisfies Record<string, { schema: z.ZodType; default: unknown }>

export type SettingKey = keyof typeof SETTINGS_SCHEMA
export type SettingValue<K extends SettingKey> = z.infer<(typeof SETTINGS_SCHEMA)[K]['schema']>
