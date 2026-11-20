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

  /**
   * `null` deletes the row: the column is NOT NULL (Drizzle's JSON mode writes `null` as SQL
   * NULL), and every nullable setting defaults to `null`, so a missing row reads back the same.
   */
  async set(key: string, value: unknown): Promise<void> {
    if (value === null || value === undefined) {
      await this.db.delete(settings).where(eq(settings.key, key))
      return
    }
    const updatedAt = new Date()
    await this.db
      .insert(settings)
      .values({ key, value, updatedAt })
      .onConflictDoUpdate({ target: settings.key, set: { value, updatedAt } })
  }
}
