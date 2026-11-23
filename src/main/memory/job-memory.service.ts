import type {
  JobMemoryRepository,
  MemoryKey,
  MemoryStats
} from '../database/repositories/job-memory.repository'
import { AppError } from '../errors'
import { validateTranslation, type InlineLexer, type SubtitleDocument } from '../parsers'
import { computeContextHashes, type HashedUnit } from './context-hash'
import { canonicalLang, promptHash } from './memory-key'

const DAY_MS = 86_400_000

export type PruneDays = 1 | 3 | 7 | 30

/** Tudo que um job precisa para consultar/gravar o cache: chave canônica + lexer do formato. */
export interface MemoryContext {
  readonly key: MemoryKey
  /** Lexer do formato, para validar payloads contra o esqueleto atual. */
  readonly lexInline: InlineLexer
  readonly sourceLang?: string
}

export interface MemoryHitResult {
  /** Payload traduzido, já validado contra o esqueleto do cue atual. */
  readonly translated: string
  readonly unit: HashedUnit
}

export interface DocumentLookup {
  /** Por `cueId`. */
  readonly hits: ReadonlyMap<number, MemoryHitResult>
  /**
   * Cues traduzíveis sem tradução válida em cache, em ordem de documento, um por context hash:
   * o primeiro de cada grupo representa os demais (ver `copies`).
   */
  readonly misses: readonly HashedUnit[]
  /**
   * Misses com o mesmo context hash de um representante em `misses`, por `cueId` dele: mesma
   * chave de cache, logo mesma tradução (ex.: letreiro animado quadro a quadro). Traduz-se só o
   * representante e a tradução é reaplicada em cada cópia.
   */
  readonly copies: ReadonlyMap<number, readonly HashedUnit[]>
}

export interface ChunkEntry {
  readonly hashed: HashedUnit
  /** Payload traduzido devolvido pelo LLM. */
  readonly translated: string
}

export interface CommitResult {
  readonly written: number
  /** `cueId`s cuja tradução não validou e não foi gravada. */
  readonly rejected: readonly number[]
}

export interface JobMemoryServiceOptions {
  now?: () => number
  /** `true` enquanto houver job ativo; o prune é recusado nesse estado. */
  isBusy?: () => boolean
}

/**
 * Política do Job Memory sobre o repositório: lookup validado, escrita por chunk e prune.
 * Todo hit passa por `validateTranslation` (corrompido ou incompatível = miss); toda escrita é
 * uma transação por chunk, iniciada só se o job não foi cancelado.
 */
export class JobMemoryService {
  private readonly inflight = new Set<Promise<unknown>>()
  /** Fim da fila de escritas (ver `write`). */
  private writes: Promise<unknown> = Promise.resolve()
  private disposed = false
  private readonly now: () => number
  private readonly isBusy: () => boolean

  constructor(
    private readonly repo: JobMemoryRepository,
    options: JobMemoryServiceOptions = {}
  ) {
    this.now = options.now ?? Date.now
    this.isBusy = options.isBusy ?? (() => false)
  }

  /** Canoniza idioma e glossário. Lança `RangeError` para tag de idioma inválida. */
  static context(input: {
    targetLang: string
    model: string
    glossary: readonly unknown[]
    /** Orientação de estilo do preset (entra na chave junto com o glossário). */
    stylePrompt?: string
    /** Obra do job (`mediaScope(spec.media?.details)`); ausente = `''` (cache sem obra). */
    mediaScope?: string
    lexInline: InlineLexer
    sourceLang?: string
  }): MemoryContext {
    return {
      key: {
        targetLang: canonicalLang(input.targetLang),
        model: input.model,
        promptHash: promptHash(input.glossary, input.stylePrompt),
        mediaScope: input.mediaScope ?? ''
      },
      lexInline: input.lexInline,
      sourceLang: input.sourceLang
    }
  }

  async lookupDocument(
    doc: SubtitleDocument<unknown>,
    ctx: MemoryContext,
    options: {
      /** Consulta sem marcar uso (preflight); um preflight cancelado não segura entradas. */
      peek?: boolean
      /**
       * Job com "ignorar traduções salvas": nenhum hit (nem consulta ao banco), tudo é miss. As
       * cópias continuam agrupadas: o mesmo context hash é a mesma linha do cache, e a gravação
       * do representante sobrescreve a entrada antiga.
       */
      skip?: boolean
    } = {}
  ): Promise<DocumentLookup> {
    const units = computeContextHashes(doc, { sourceLang: ctx.sourceLang })
    const rows = options.skip
      ? new Map<string, never>()
      : await this.repo.lookupMany(
          ctx.key,
          units.map((u) => u.hash)
        )

    const hits = new Map<number, MemoryHitResult>()
    const misses: HashedUnit[] = []
    const copies = new Map<number, HashedUnit[]>()
    const representative = new Map<string, number>()
    const touched: number[] = []
    for (const u of units) {
      const row = rows.get(u.hash)
      const valid =
        row !== undefined &&
        row.sourceText === u.unit.payload &&
        validateTranslation(u.unit, row.translatedText, ctx.lexInline).length === 0
      if (valid) {
        hits.set(u.cueId, { translated: row.translatedText, unit: u })
        touched.push(row.id)
        continue
      }
      const rep = representative.get(u.hash)
      if (rep === undefined) {
        representative.set(u.hash, u.cueId)
        misses.push(u)
      } else {
        const group = copies.get(rep)
        if (group) group.push(u)
        else copies.set(rep, [u])
      }
    }
    if (!options.peek) await this.write(() => this.repo.touch(touched))
    return { hits, misses, copies }
  }

  /**
   * Grava um chunk validado numa única transação. Abortado antes de começar => `CANCELLED` e
   * nada é gravado; uma transação já iniciada termina (é curta) e o shutdown espera por ela.
   */
  async commitChunk(
    ctx: MemoryContext,
    entries: readonly ChunkEntry[],
    signal?: AbortSignal
  ): Promise<CommitResult> {
    if (this.disposed || signal?.aborted)
      throw new AppError('CANCELLED', 'Job memory write cancelled')

    const rejected: number[] = []
    const valid = entries.filter((e) => {
      const ok = validateTranslation(e.hashed.unit, e.translated, ctx.lexInline).length === 0
      if (!ok) rejected.push(e.hashed.cueId)
      return ok
    })
    await this.write(() =>
      this.repo.upsertMany(
        ctx.key,
        valid.map((e) => ({
          contextHash: e.hashed.hash,
          sourceText: e.hashed.unit.payload,
          translatedText: e.translated
        }))
      )
    )
    return { written: valid.length, rejected }
  }

  stats(): Promise<MemoryStats> {
    return this.repo.stats()
  }

  /** Remove entradas não usadas há mais de N dias (ou todas). Recusado com job ativo. */
  async prune(scope: PruneDays | 'all'): Promise<{ deleted: number }> {
    if (this.isBusy())
      throw new AppError('MEMORY_BUSY', 'Cannot prune the job memory while a job is running')
    return this.write(() =>
      this.repo.prune(
        scope === 'all' ? 'all' : { olderThan: new Date(this.now() - scope * DAY_MS) }
      )
    )
  }

  /** Para o shutdown: recusa novas escritas e espera as que estão em andamento. */
  async dispose(): Promise<void> {
    this.disposed = true
    await Promise.allSettled([...this.inflight])
  }

  /**
   * Escritas em fila única no processo. As transações do libsql pegam conexões distintas do
   * pool e a espera por lock do SQLite é síncrona (trava a thread): duas transações de escrita
   * simultâneas (lanes paralelas, jobs concorrentes) dariam SQLITE_BUSY ou congelariam o main.
   */
  private write<T>(fn: () => Promise<T>): Promise<T> {
    const p = this.writes.then(fn, fn)
    this.writes = p.catch(() => undefined)
    return this.track(p)
  }

  private track<T>(p: Promise<T>): Promise<T> {
    this.inflight.add(p)
    void p.finally(() => this.inflight.delete(p)).catch(() => undefined)
    return p
  }
}
