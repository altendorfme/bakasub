import { eq } from 'drizzle-orm'
import type { Database } from '../init'
import { secrets, vaultKeys } from '../schema'

export interface SecretRow {
  readonly ciphertext: Buffer
  readonly iv: Buffer
  readonly tag: Buffer
  readonly keyVersion: number
}

export interface VaultKeyRow {
  readonly version: number
  readonly wrapped: Buffer
  readonly protection: 'os' | 'none'
}

/** Acesso cru a `secrets` e `vault_keys`. Nunca decifra: isso é do `SecretVault`. */
export class SecretsRepository {
  constructor(private readonly db: Database) {}

  async get(key: string): Promise<SecretRow | null> {
    const [row] = await this.db.select().from(secrets).where(eq(secrets.key, key))
    return row ?? null
  }

  async put(key: string, row: SecretRow): Promise<void> {
    const updatedAt = new Date()
    await this.db
      .insert(secrets)
      .values({ key, ...row, updatedAt })
      .onConflictDoUpdate({ target: secrets.key, set: { ...row, updatedAt } })
  }

  async delete(key: string): Promise<void> {
    await this.db.delete(secrets).where(eq(secrets.key, key))
  }

  async latestKey(): Promise<VaultKeyRow | null> {
    const rows = await this.db.select().from(vaultKeys)
    return rows.sort((a, b) => b.version - a.version)[0] ?? null
  }

  /** Grava (ou reembrulha) a chave mestra. */
  async putKey(row: VaultKeyRow): Promise<void> {
    await this.db
      .insert(vaultKeys)
      .values(row)
      .onConflictDoUpdate({
        target: vaultKeys.version,
        set: { wrapped: row.wrapped, protection: row.protection }
      })
  }

  /** Recomeço do cofre: descarta chaves mestras e todos os segredos, atomicamente. */
  async reset(): Promise<void> {
    await this.db.transaction(async (tx) => {
      await tx.delete(secrets)
      await tx.delete(vaultKeys)
    })
  }
}
