import { eq } from 'drizzle-orm'
import type { Database } from '../init'
import { settings } from '../schema'

/** Acesso cru a `settings`. Tipagem e validação ficam no `SettingsService`. */
export class SettingsRepository {
  constructor(private readonly db: Database) {}

  async get(key: string): Promise<unknown> {
    const [row] = await this.db.select().from(settings).where(eq(settings.key, key))
    return row?.value
  }

  async set(key: string, value: unknown): Promise<void> {
    const updatedAt = new Date()
    await this.db
      .insert(settings)
      .values({ key, value, updatedAt })
      .onConflictDoUpdate({ target: settings.key, set: { value, updatedAt } })
  }
}
