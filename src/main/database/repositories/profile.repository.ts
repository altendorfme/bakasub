import { asc, eq } from 'drizzle-orm'
import type { Database } from '../init'
import { profiles } from '../schema'

export type ProfileRow = typeof profiles.$inferSelect
export type ProfileValues = Omit<typeof profiles.$inferInsert, 'id' | 'createdAt'>

export class ProfileRepository {
  constructor(private readonly db: Database) {}

  list(): Promise<ProfileRow[]> {
    return this.db.select().from(profiles).orderBy(asc(profiles.name))
  }

  async get(id: number): Promise<ProfileRow | null> {
    const [row] = await this.db.select().from(profiles).where(eq(profiles.id, id))
    return row ?? null
  }

  async findByName(name: string): Promise<ProfileRow | null> {
    const [row] = await this.db.select().from(profiles).where(eq(profiles.name, name))
    return row ?? null
  }

  async insert(values: ProfileValues): Promise<ProfileRow> {
    const [row] = await this.db.insert(profiles).values(values).returning()
    return row
  }

  async update(id: number, values: ProfileValues): Promise<ProfileRow | null> {
    const [row] = await this.db.update(profiles).set(values).where(eq(profiles.id, id)).returning()
    return row ?? null
  }

  async delete(id: number): Promise<boolean> {
    const res = await this.db.delete(profiles).where(eq(profiles.id, id))
    return res.rowsAffected > 0
  }
}
