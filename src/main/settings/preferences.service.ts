import { z } from 'zod'
import type { PublicSettings } from '../../shared/ipc-contract'
import { AppError } from '../errors'
import { canonicalTag } from '../media/languages'
import { SETTINGS_SCHEMA, type SettingKey } from './settings-schema'
import type { SettingsService } from './settings.service'

/** As únicas chaves que o renderer lê e altera. Chaves internas (cache de modelos) ficam de fora. */
export const PUBLIC_SETTING_KEYS = [
  'translation.defaultModel',
  'translation.defaultTargetLang',
  'translation.defaultPresetId',
  'translation.targetLangs',
  'models.favorites',
  'jobs.concurrency',
  'preflight.autoConfirmBelowUsd',
  'tracks.preferredSourceLangs',
  'logs.level',
  'updates.autoCheck',
  'ui.language',
  'llm.rateLimit.freeRpm',
  'llm.rateLimit.paidRpm',
  'llm.rateLimit.freeTier',
  'llm.retry.maxThrottled',
  'llm.retry.maxTransient',
  'llm.retry.baseDelayMs',
  'llm.retry.maxDelayMs',
  'llm.retry.chunkRounds',
  'llm.concurrency.perJob',
  'llm.concurrency.paidMaxInFlight',
  'llm.concurrency.freeMaxInFlight'
] as const satisfies readonly (keyof PublicSettings & SettingKey)[]

type PublicKey = (typeof PUBLIC_SETTING_KEYS)[number]

const PatchSchema = z
  .object(
    Object.fromEntries(PUBLIC_SETTING_KEYS.map((k) => [k, SETTINGS_SCHEMA[k].schema.optional()]))
  )
  .strict()

const canonicalLangs = (tags: readonly string[]): string[] => {
  const out: string[] = []
  for (const tag of tags) {
    const c = canonicalTag(tag)
    if (!c) throw new AppError('INVALID_INPUT', `Invalid language tag: ${tag}`)
    if (!out.includes(c)) out.push(c)
  }
  return out
}

const same = (a: unknown, b: unknown): boolean => JSON.stringify(a) === JSON.stringify(b)

/**
 * Leitura e escrita das configurações públicas, com as regras que ligam chaves entre si:
 * o modelo padrão está sempre nos favoritos, o idioma padrão sempre nos idiomas de destino,
 * e o preset padrão existe. Ficam aqui (Main), não só na UI, para valer em qualquer caminho.
 */
export class PreferencesService {
  constructor(
    private readonly d: {
      settings: SettingsService
      presetExists: (id: string) => Promise<boolean>
      /** Chaves que mudaram de fato (ex.: concorrência => reprocessar a fila). */
      onChanged?: (keys: PublicKey[]) => void
    }
  ) {}

  async snapshot(): Promise<PublicSettings> {
    const entries = await Promise.all(
      PUBLIC_SETTING_KEYS.map(async (k) => [k, await this.d.settings.get(k)] as const)
    )
    return Object.fromEntries(entries) as unknown as PublicSettings
  }

  async update(raw: Partial<PublicSettings>): Promise<PublicSettings> {
    const parsed = PatchSchema.safeParse(raw)
    if (!parsed.success) throw new AppError('INVALID_INPUT', parsed.error.message)
    const patch = parsed.data as Partial<PublicSettings>
    const current = await this.snapshot()
    const next: PublicSettings = { ...current, ...patch }

    next['translation.targetLangs'] = canonicalLangs(next['translation.targetLangs'])
    next['tracks.preferredSourceLangs'] = canonicalLangs(next['tracks.preferredSourceLangs'])
    if (next['translation.defaultTargetLang'] !== null)
      next['translation.defaultTargetLang'] = canonicalLangs([
        next['translation.defaultTargetLang']
      ])[0]
    next['models.favorites'] = [...new Set(next['models.favorites'])]

    this.keepDefaultInList(
      next,
      patch,
      'translation.defaultModel',
      'models.favorites',
      'The default model cannot be removed from favorites'
    )
    this.keepDefaultInList(
      next,
      patch,
      'translation.defaultTargetLang',
      'translation.targetLangs',
      'The default target language cannot be removed'
    )

    if (next['llm.retry.baseDelayMs'] > next['llm.retry.maxDelayMs'])
      throw new AppError('SETTINGS_CONFLICT', 'The base retry delay exceeds the maximum delay')

    if (
      'translation.defaultPresetId' in patch &&
      !(await this.d.presetExists(next['translation.defaultPresetId']))
    )
      throw new AppError(
        'PRESET_NOT_FOUND',
        `Preset ${next['translation.defaultPresetId']} not found`
      )

    const changed = PUBLIC_SETTING_KEYS.filter((k) => !same(current[k], next[k]))
    for (const k of changed) await this.d.settings.set(k, next[k] as never)
    if (changed.length > 0) this.d.onChanged?.(changed)
    return next
  }

  /** Volta as chaves ao padrão de fábrica (Settings → "Restore defaults"), com as mesmas regras. */
  async reset(keys: readonly string[]): Promise<PublicSettings> {
    const unknown = keys.filter((k) => !(PUBLIC_SETTING_KEYS as readonly string[]).includes(k))
    if (unknown.length)
      throw new AppError('INVALID_INPUT', `Unknown settings: ${unknown.join(', ')}`)
    const patch = Object.fromEntries(
      (keys as PublicKey[]).map((k) => [k, SETTINGS_SCHEMA[k].default])
    ) as Partial<PublicSettings>
    return this.update(patch)
  }

  /**
   * Patch que muda o padrão: o novo padrão entra na lista. Patch que só mexe na lista e tira o
   * padrão atual: conflito (o usuário precisa escolher outro padrão antes).
   */
  private keepDefaultInList(
    next: PublicSettings,
    patch: Partial<PublicSettings>,
    defaultKey: 'translation.defaultModel' | 'translation.defaultTargetLang',
    listKey: 'models.favorites' | 'translation.targetLangs',
    message: string
  ): void {
    const value = next[defaultKey]
    if (value === null || next[listKey].includes(value)) return
    if (defaultKey in patch) next[listKey] = [...next[listKey], value]
    else throw new AppError('SETTINGS_CONFLICT', message)
  }
}
