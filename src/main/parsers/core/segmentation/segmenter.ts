import type { Cue, Item } from '../types'
import { buildPayload, findMarkerCollision, type Skeleton } from './payload-codec'

export interface TranslationUnit {
  /** Ordinal do cue no documento: a chave do JSON `{ "ID": "Translation" }`. */
  readonly cueId: number
  /** Texto com marcadores, enviado ao LLM. */
  readonly payload: string
  readonly skeleton: Skeleton
}

export type SkipReason = 'SKIPPED_NO_LETTERS' | 'SKIPPED_EMPTY_BLOCK'
export type UntranslatedReason =
  | 'UNTRANSLATED_ORPHAN_TEXT'
  | 'UNTRANSLATED_BAD_TIMING'
  | 'UNTRANSLATED_MARKER_COLLISION'
  /** Reservado para a camada de LLM (chunk esgotou as tentativas). */
  | 'UNTRANSLATED_VALIDATION_FAILED'

export type Classification =
  | { status: 'translatable'; unit: TranslationUnit }
  | { status: 'skipped'; reason: SkipReason }
  | { status: 'untranslated'; reason: UntranslatedReason; params?: Record<string, string> }

const HAS_LETTER = /\p{L}/u

/**
 * Única fonte de verdade sobre "isto vai para o LLM?". Tanto a segmentação quanto o relatório
 * de cobertura passam por aqui, então o relatório não pode divergir do pipeline.
 */
export function classify(item: Item<unknown>): Classification {
  if (item.kind === 'unparsed') {
    switch (item.reason) {
      case 'empty-block':
        return { status: 'skipped', reason: 'SKIPPED_EMPTY_BLOCK' }
      case 'bad-timing':
        return { status: 'untranslated', reason: 'UNTRANSLATED_BAD_TIMING' }
      case 'orphan-text':
        return { status: 'untranslated', reason: 'UNTRANSLATED_ORPHAN_TEXT' }
    }
  }
  return classifyCue(item)
}

export function classifyCue(cue: Cue<unknown>): Classification {
  const hasLetters = cue.nodes.some((n) => n.type === 'text' && HAS_LETTER.test(n.value))
  if (!hasLetters) return { status: 'skipped', reason: 'SKIPPED_NO_LETTERS' }

  const collision = findMarkerCollision(cue.nodes)
  if (collision) {
    return {
      status: 'untranslated',
      reason: 'UNTRANSLATED_MARKER_COLLISION',
      params: { marker: collision }
    }
  }

  const { payload, skeleton } = buildPayload(cue.nodes)
  return { status: 'translatable', unit: { cueId: cue.id, payload, skeleton } }
}

/** `null` quando o cue não deve ir ao LLM (sem letras ou com colisão de marcador). */
export function toTranslationUnit(cue: Cue<unknown>): TranslationUnit | null {
  const c = classifyCue(cue)
  return c.status === 'translatable' ? c.unit : null
}
