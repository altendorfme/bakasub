import type { SettingsRepository } from '../database/repositories/settings.repository'
import { SETTINGS_SCHEMA, type SettingKey, type SettingValue } from './settings-schema'

/** Configurações tipadas e validadas pelo registro `SETTINGS_SCHEMA`. */
export class SettingsService {
  constructor(
    private readonly repo: SettingsRepository,
    private readonly onInvalid: (key: string, error: unknown) => void = () => undefined
  ) {}

  async get<K extends SettingKey>(key: K): Promise<SettingValue<K>> {
    const entry = SETTINGS_SCHEMA[key]
    const raw = await this.repo.get(key)
    if (raw === undefined) return entry.default as SettingValue<K>
    const parsed = entry.schema.safeParse(raw)
    if (!parsed.success) {
      this.onInvalid(key, parsed.error)
      return entry.default as SettingValue<K>
    }
    return parsed.data as SettingValue<K>
  }

  async set<K extends SettingKey>(key: K, value: SettingValue<K>): Promise<void> {
    await this.repo.set(key, SETTINGS_SCHEMA[key].schema.parse(value))
  }
}
