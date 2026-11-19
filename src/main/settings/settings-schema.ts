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
  /** Jobs executados ao mesmo tempo. */
  'jobs.concurrency': { schema: z.number().int().min(1).max(4), default: 2 },
  /** Idiomas de origem preferidos (ordem) na seleção automática de faixas do batch. */
  'tracks.preferredSourceLangs': {
    schema: z.array(z.string().min(1).max(35)).max(10),
    default: ['en']
  }
} as const satisfies Record<string, { schema: z.ZodType; default: unknown }>

export type SettingKey = keyof typeof SETTINGS_SCHEMA
export type SettingValue<K extends SettingKey> = z.infer<(typeof SETTINGS_SCHEMA)[K]['schema']>
