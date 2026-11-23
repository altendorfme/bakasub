import type { HashedUnit } from '../memory/context-hash'
import { validateTranslation, type InlineLexer, type Issue } from '../parsers'
import { buildContext, DEFAULT_CONTEXT_WINDOW } from './chunker'
import { FatalLlmError, type LlmLog, type LlmSession } from './llm-session'
import { buildRepairMessage, buildTranslateMessage } from './prompt-builder'
import { reasoningStarved } from './reasoning'
import { parseTranslations } from './response-parser'
import { estimateTokens } from './token-estimate'

/** 1 tradução + 2 reparos. */
export const MAX_CONTENT_ATTEMPTS = 3
/** Divisões por moderação até isolar a(s) linha(s) bloqueada(s). */
const MAX_MODERATION_SPLITS = 3
const RESPONSE_LOG_LIMIT = 2048
/** Folga de `max_tokens` para modelos cujo raciocínio não pode ser desligado. */
export const REASONING_SLACK_TOKENS = 1024
/**
 * Teto do multiplicador de orçamento quando o raciocínio esgota `max_tokens` (1x -> 2x -> 4x):
 * no máximo 2 requisições extras antes de `LLM_REASONING_BUDGET`.
 */
export const MAX_BUDGET_FACTOR = 4

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
 * inválidas (até 3 tentativas por linha). `length` com a saída gasta em raciocínio repete o
 * mesmo chunk com orçamento maior; `length` com texto longo divide ao meio; moderação divide
 * até isolar. Sequencial: cada rodada usa as traduções já conhecidas como contexto.
 */
export class ChunkTranslator {
  /**
   * Multiplicador do `max_tokens`. Sobe (2x, até `MAX_BUDGET_FACTOR`) quando o raciocínio esgota
   * o orçamento e fica para os próximos chunks da lane: o mesmo modelo vai raciocinar parecido,
   * e `max_tokens` é teto, não cobrança.
   */
  private budgetFactor = 1

  constructor(
    private readonly session: LlmSession,
    private readonly env: {
      system: string
      timeline: readonly HashedUnit[]
      known: Map<number, string>
      lexInline: InlineLexer
      maxCompletionTokens: number | null
      /** Tokens somados ao `max_tokens` quando o raciocínio não pode ser desligado. */
      reasoningSlack?: number
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
      const maxTokens = this.maxTokens(pending)
      const res = await this.session.request(
        [
          { role: 'system', content: this.env.system },
          { role: 'user', content: this.message(pending, attempts, repair) }
        ],
        pending.map((u) => u.cueId),
        maxTokens
      )

      if (res.type === 'moderated') {
        if (pending.length > 1 && moderationDepth < MAX_MODERATION_SPLITS) {
          for (const half of halves(pending)) await this.runLines(half, moderationDepth + 1)
        } else
          for (const u of pending)
            this.sink.fail({ cueId: u.cueId, reason: 'UNTRANSLATED_CONTENT_FILTERED', issues: [] })
        return
      }

      if (res.finishReason === 'length' && reasoningStarved(res, estimateTokens)) {
        // Dividir não resolve: cada metade raciocina de novo e repete System + <context>.
        // Mesmo chunk, orçamento maior, sem gastar tentativa de conteúdo.
        if (this.grow(pending, maxTokens)) {
          this.env.log.warn(
            `reasoning used the output budget (reasoning=${res.reasoningTokens ?? '?'}/` +
              `${res.completionTokens ?? '?'} tokens, max_tokens=${maxTokens}); ` +
              `retrying ${pending.length} lines with budget x${this.budgetFactor}`
          )
          continue
        }
        throw new FatalLlmError(
          'LLM_REASONING_BUDGET',
          `The model spent its output budget on reasoning (reasoning=${res.reasoningTokens ?? '?'}/` +
            `${res.completionTokens ?? '?'} tokens at max_tokens=${maxTokens})`
        )
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
        context,
        failures: pending.map((u) => ({
          unit: u.unit,
          returned: attempts.get(u.cueId)!.returned,
          issues: attempts.get(u.cueId)!.issues
        }))
      })
    return buildTranslateMessage({
      context,
      targets: pending.map((u) => ({ cueId: u.cueId, payload: u.unit.payload }))
    })
  }

  /**
   * ~2,5× o `<target>` + overhead do JSON, com piso, + folga de raciocínio, vezes o
   * `budgetFactor`; limitado pelo máximo do modelo.
   */
  private maxTokens(pending: readonly HashedUnit[]): number {
    const target = pending.reduce((n, u) => n + estimateTokens(u.unit.payload), 0)
    const base =
      Math.max(256, Math.ceil(target * 2.5) + pending.length * 8) + (this.env.reasoningSlack ?? 0)
    const want = base * this.budgetFactor
    return this.env.maxCompletionTokens ? Math.min(want, this.env.maxCompletionTokens) : want
  }

  /** Dobra o orçamento, se ainda cabe (teto do fator e do modelo). `false` = não há para onde subir. */
  private grow(pending: readonly HashedUnit[], current: number): boolean {
    while (this.budgetFactor < MAX_BUDGET_FACTOR) {
      this.budgetFactor = Math.min(this.budgetFactor * 2, MAX_BUDGET_FACTOR)
      if (this.maxTokens(pending) > current) return true
    }
    return false
  }
}

function halves<T>(xs: readonly T[]): T[][] {
  const mid = Math.ceil(xs.length / 2)
  return [xs.slice(0, mid), xs.slice(mid)]
}
