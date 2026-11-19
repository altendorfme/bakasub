import { asc, eq } from 'drizzle-orm'
import type { Database } from '../init'
import { presets } from '../schema'

export type PresetRow = typeof presets.$inferSelect
export type PresetValues = Omit<typeof presets.$inferInsert, 'id' | 'createdAt'>

/** Só presets personalizados (os embutidos não estão no banco). */
export class PresetRepository {
  constructor(private readonly db: Database) {}

  list(): Promise<PresetRow[]> {
    return this.db.select().from(presets).orderBy(asc(presets.createdAt), asc(presets.name))
  }

  async get(id: string): Promise<PresetRow | null> {
    const [row] = await this.db.select().from(presets).where(eq(presets.id, id))
    return row ?? null
  }

  async findByName(name: string): Promise<PresetRow | null> {
    const [row] = await this.db.select().from(presets).where(eq(presets.name, name))
    return row ?? null
  }

  async insert(id: string, values: PresetValues): Promise<PresetRow> {
    const [row] = await this.db
      .insert(presets)
      .values({ id, ...values })
      .returning()
    return row
  }

  /** Tudo ou nada (import). */
  async insertMany(rows: readonly { id: string; values: PresetValues }[]): Promise<PresetRow[]> {
    if (rows.length === 0) return []
    return this.db.transaction(async (tx) => {
      const out: PresetRow[] = []
      for (const r of rows) {
        const [row] = await tx
          .insert(presets)
          .values({ id: r.id, ...r.values })
          .returning()
        out.push(row)
      }
      return out
    })
  }

  async update(id: string, values: PresetValues): Promise<PresetRow | null> {
    const [row] = await this.db.update(presets).set(values).where(eq(presets.id, id)).returning()
    return row ?? null
  }

  async delete(id: string): Promise<boolean> {
    return (await this.db.delete(presets).where(eq(presets.id, id))).rowsAffected > 0
  }
}
