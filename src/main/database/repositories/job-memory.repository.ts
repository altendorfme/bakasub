import { and, count, eq, inArray, lt, min, sql } from 'drizzle-orm'
import type { Database } from '../init'
import { jobMemory } from '../schema'

/** Tudo que separa traduções além do context hash. Valores já canonizados (ver `memory-key.ts`). */
export interface MemoryKey {
  readonly targetLang: string
  readonly model: string
  readonly promptHash: string
}

export interface MemoryEntry {
  readonly contextHash: string
  /** Payload de origem (com marcadores). */
  readonly sourceText: string
  /** Payload traduzido (com marcadores). */
  readonly translatedText: string
}

export interface MemoryHit extends MemoryEntry {
  readonly id: number
  readonly updatedAt: Date
  readonly lastUsedAt: Date
}

export interface MemoryStats {
  readonly rows: number
  /** Bytes em disco da tabela + índices (`dbstat`). */
  readonly bytes: number
  readonly oldestUsedAt: Date | null
}

export type PruneScope = { readonly olderThan: Date } | 'all'

/** Linhas por statement: 7 parâmetros por linha fica bem abaixo do limite do SQLite. */
const BATCH = 500

function chunks<T>(xs: readonly T[], size = BATCH): T[][] {
  const out: T[][] = []
  for (let i = 0; i < xs.length; i += size) out.push(xs.slice(i, i + size))
  return out
}

/** Acesso a dados do Job Memory. Só SQL: validação e política ficam no serviço. */
export class JobMemoryRepository {
  constructor(
    private readonly db: Database,
    private readonly now: () => number = Date.now
  ) {}

  async lookupMany(key: MemoryKey, hashes: readonly string[]): Promise<Map<string, MemoryHit>> {
    const hits = new Map<string, MemoryHit>()
    for (const part of chunks([...new Set(hashes)])) {
      const rows = await this.db
        .select()
        .from(jobMemory)
        .where(
          and(
            eq(jobMemory.targetLang, key.targetLang),
            eq(jobMemory.model, key.model),
            eq(jobMemory.promptHash, key.promptHash),
            inArray(jobMemory.contextHash, part)
          )
        )
      for (const r of rows) hits.set(r.contextHash, r)
    }
    return hits
  }

  /** Atômico: todas as entradas ou nenhuma (uma transação por chunk do LLM). */
  async upsertMany(key: MemoryKey, entries: readonly MemoryEntry[]): Promise<void> {
    if (entries.length === 0) return
    const at = new Date(this.now())
    await this.db.transaction(async (tx) => {
      for (const part of chunks(entries)) {
        await tx
          .insert(jobMemory)
          .values(part.map((e) => ({ ...e, ...key, updatedAt: at, lastUsedAt: at })))
          .onConflictDoUpdate({
            target: [
              jobMemory.contextHash,
              jobMemory.targetLang,
              jobMemory.model,
              jobMemory.promptHash
            ],
            set: {
              sourceText: sql`excluded.source_text`,
              translatedText: sql`excluded.translated_text`,
              updatedAt: at,
              lastUsedAt: at
            }
          })
      }
    })
  }

  /** Marca entradas como usadas (hits); base do prune "não usado há N dias". */
  async touch(ids: readonly number[]): Promise<void> {
    if (ids.length === 0) return
    const at = new Date(this.now())
    await this.db.transaction(async (tx) => {
      for (const part of chunks([...new Set(ids)]))
        await tx.update(jobMemory).set({ lastUsedAt: at }).where(inArray(jobMemory.id, part))
    })
  }

  /** Remove entradas e devolve as páginas livres ao disco (`auto_vacuum = INCREMENTAL`). */
  async prune(scope: PruneScope): Promise<{ deleted: number }> {
    const where = scope === 'all' ? undefined : lt(jobMemory.lastUsedAt, scope.olderThan)
    const res = await this.db.delete(jobMemory).where(where)
    // `execute()` do @libsql/client dá um único step, e `incremental_vacuum` libera uma página por
    // step. `executeMultiple` usa `sqlite3_exec`, que roda o statement até o fim.
    await this.db.$client.executeMultiple('PRAGMA incremental_vacuum;')
    return { deleted: res.rowsAffected }
  }

  async stats(): Promise<MemoryStats> {
    const [agg] = await this.db
      .select({ rows: count(), oldest: min(jobMemory.lastUsedAt) })
      .from(jobMemory)
    const size = await this.db.get<{ bytes: number | null }>(sql`
      SELECT SUM(pgsize) AS bytes FROM dbstat
      WHERE name IN (SELECT name FROM sqlite_schema WHERE tbl_name = 'job_memory')`)
    return {
      rows: agg.rows,
      bytes: Number(size?.bytes ?? 0),
      oldestUsedAt: agg.oldest ?? null
    }
  }
}
