import type { HashedUnit } from '../memory/context-hash'
import { validateTranslation, type InlineLexer, type Issue } from '../parsers'
import { buildContext, DEFAULT_CONTEXT_WINDOW } from './chunker'
import type { LlmLog, LlmSession } from './llm-session'
import { buildRepairMessage, buildTranslateMessage } from './prompt-builder'
import { parseTranslations } from './response-parser'
import { estimateTokens } from './token-estimate'

/** 1 tradução + 2 reparos. */
export const MAX_CONTENT_ATTEMPTS = 3
/** Divisões por moderação até isolar a(s) linha(s) bloqueada(s). */
const MAX_MODERATION_SPLITS = 3
const RESPONSE_LOG_LIMIT = 2048

export type LineFailureReason = 'UNTRANSLATED_VALIDATION_FAILED' | 'UNTRANSLATED_CONTENT_FILTERED'

export interface LineFailure {
  readonly cueId: number
  readonly reason: LineFailureReason
  readonly issues: readonly Issue[]
}

export interface ChunkSink {
  /** Traduções validadas de uma rodada (o chamador grava no Job Memory). */
  accept(entries: readonly { unit: HashedUnit; translated: string }[]): Promise<void>
  fail(failure: LineFailure): void
}

interface Attempt {
  count: number
  returned: string | null
  issues: Issue[]
}

/**
 * Ciclo de um chunk: traduzir -> validar por linha -> aceitar as válidas -> reparar só as
 * inválidas (até 3 tentativas por linha). `length` divide ao meio; moderação divide até isolar.
 * Sequencial: cada rodada usa as traduções já conhecidas como contexto.
 */
export class ChunkTranslator {
  constructor(
    private readonly session: LlmSession,
    private readonly env: {
      system: string
      media?: string
      timeline: readonly HashedUnit[]
      known: Map<number, string>
      lexInline: InlineLexer
      maxCompletionTokens: number | null
      log: LlmLog
    },
    private readonly sink: ChunkSink
  ) {}

  run(lines: readonly HashedUnit[]): Promise<void> {
    return this.runLines(lines, 0)
  }

  private async runLines(lines: readonly HashedUnit[], moderationDepth: number): Promise<void> {
    const attempts = new Map<number, Attempt>(
      lines.map((u) => [u.cueId, { count: 0, returned: null, issues: [] }])
    )
    let pending = [...lines]

    while (pending.length > 0) {
      const repair = pending.some((u) => attempts.get(u.cueId)!.count > 0)
      const res = await this.session.request(
        [
          { role: 'system', content: this.env.system },
          { role: 'user', content: this.message(pending, attempts, repair) }
        ],
        pending.map((u) => u.cueId),
        this.maxTokens(pending)
      )

      if (res.type === 'moderated') {
        if (pending.length > 1 && moderationDepth < MAX_MODERATION_SPLITS) {
          for (const half of halves(pending)) await this.runLines(half, moderationDepth + 1)
        } else
          for (const u of pending)
            this.sink.fail({ cueId: u.cueId, reason: 'UNTRANSLATED_CONTENT_FILTERED', issues: [] })
        return
      }

      if (res.finishReason === 'length' && pending.length > 1) {
        for (const half of halves(pending)) await this.runLines(half, moderationDepth)
        return
      }

      const parsed = parseTranslations(
        res.content,
        pending.map((u) => u.cueId)
      )
      const accepted: { unit: HashedUnit; translated: string }[] = []
      if (!parsed.ok) {
        this.env.log.warn(`unparseable response: ${res.content.slice(0, RESPONSE_LOG_LIMIT)}`)
        for (const u of pending) {
          const a = attempts.get(u.cueId)!
          a.count++
          // Sem nada aproveitável: a próxima rodada usa o prompt de tradução, não o de reparo.
          a.returned = null
          a.issues = []
        }
      } else {
        if (parsed.extra.length) this.env.log.debug(`ignored extra ids: ${parsed.extra.join(',')}`)
        for (const u of pending) {
          const a = attempts.get(u.cueId)!
          a.count++
          const value = parsed.values.get(u.cueId)
          if (value === undefined) {
            a.returned = ''
            a.issues = []
            continue
          }
          const issues = validateTranslation(u.unit, value, this.env.lexInline)
          if (issues.length === 0) accepted.push({ unit: u, translated: value })
          else {
            a.returned = value
            a.issues = issues
          }
        }
        if (accepted.length < pending.length)
          this.env.log.warn(
            `invalid lines in response: ${res.content.slice(0, RESPONSE_LOG_LIMIT)}`
          )
      }

      if (accepted.length) {
        await this.sink.accept(accepted)
        for (const e of accepted) this.env.known.set(e.unit.cueId, e.translated)
      }

      const done = new Set(accepted.map((e) => e.unit.cueId))
      const next: HashedUnit[] = []
      for (const u of pending) {
        if (done.has(u.cueId)) continue
        const a = attempts.get(u.cueId)!
        if (a.count >= MAX_CONTENT_ATTEMPTS)
          this.sink.fail({
            cueId: u.cueId,
            reason: 'UNTRANSLATED_VALIDATION_FAILED',
            issues: a.issues
          })
        else next.push(u)
      }
      pending = next
    }
  }

  private message(
    pending: readonly HashedUnit[],
    attempts: ReadonlyMap<number, Attempt>,
    repair: boolean
  ): string {
    const context = buildContext(this.env.timeline, pending, this.env.known, DEFAULT_CONTEXT_WINDOW)
    const hasFeedback = pending.some((u) => attempts.get(u.cueId)!.returned !== null)
    if (repair && hasFeedback)
      return buildRepairMessage({
        media: this.env.media,
        context,
        failures: pending.map((u) => ({
          unit: u.unit,
          returned: attempts.get(u.cueId)!.returned,
          issues: attempts.get(u.cueId)!.issues
        }))
      })
    return buildTranslateMessage({
      media: this.env.media,
      context,
      targets: pending.map((u) => ({ cueId: u.cueId, payload: u.unit.payload }))
    })
  }

  /** ~2,5× o `<target>` + overhead do JSON, com piso; limitado pelo máximo do modelo. */
  private maxTokens(pending: readonly HashedUnit[]): number {
    const target = pending.reduce((n, u) => n + estimateTokens(u.unit.payload), 0)
    const want = Math.max(256, Math.ceil(target * 2.5) + pending.length * 8)
    return this.env.maxCompletionTokens ? Math.min(want, this.env.maxCompletionTokens) : want
  }
}

function halves<T>(xs: readonly T[]): T[][] {
  const mid = Math.ceil(xs.length / 2)
  return [xs.slice(0, mid), xs.slice(mid)]
}
