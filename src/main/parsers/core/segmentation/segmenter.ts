import type { Cue, Item } from '../types'
import { buildPayload, findMarkerCollision, type Skeleton } from './payload-codec'

export interface TranslationUnit {
  /** Ordinal do cue no documento: a chave do JSON `{ "ID": "Translation" }`. */
  readonly cueId: number
  /** Texto com marcadores, enviado ao LLM. */
  readonly payload: string
  readonly skeleton: Skeleton
}

export type SkipReason =
  'SKIPPED_NO_LETTERS' | 'SKIPPED_EMPTY_BLOCK' | 'SKIPPED_DRAWING' | 'SKIPPED_FRAGMENT'
export type UntranslatedReason =
  | 'UNTRANSLATED_ORPHAN_TEXT'
  | 'UNTRANSLATED_BAD_TIMING'
  | 'UNTRANSLATED_MARKER_COLLISION'
  | 'UNTRANSLATED_KARAOKE'
  | 'UNTRANSLATED_BAD_EVENT'
  /** Camada de LLM: a linha esgotou as tentativas de validação. */
  | 'UNTRANSLATED_VALIDATION_FAILED'
  /** Camada de LLM: bloqueada pela moderação do provedor. */
  | 'UNTRANSLATED_CONTENT_FILTERED'

export type Classification =
  | { status: 'translatable'; unit: TranslationUnit }
  | { status: 'skipped'; reason: SkipReason }
  | { status: 'untranslated'; reason: UntranslatedReason; params?: Record<string, string> }

const HAS_LETTER = /\p{L}/u
/** Desenho vetorial ASS: `\p1`, `\p2`… (`\p0` encerra; `\pos` não casa: `p` seguido de dígito). */
const DRAWING = /\\p0*[1-9]/
/** Karaokê ASS: `\k`, `\K`, `\kf`, `\ko` seguidos de duração. */
const KARAOKE = /\\(?:kf|ko|k|K)\d/

/** Animação/posicionamento por evento: `\t(`, `\move`, `\org`, `\pos`. */
const ANIMATED = /\\(?:t\(|move|org)/
const POSITIONED = /\\(?:pos|move)\(/
/** Fragmento de karaokê tipografado: 1 evento por letra/sílaba (até 4 caracteres, sem espaço). */
const FRAGMENT_MAX_CHARS = 4

/**
 * Karaokê "typeset" (sem `\k`): cada letra/sílaba é um evento próprio, posicionado e animado.
 * Traduzir um fragmento ("shii", "k") não tem sentido e corrompe o efeito; o texto vira ruído.
 */
function isKaraokeFragment(cue: Cue<unknown>): boolean {
  const text = cue.nodes
    .filter((n) => n.type === 'text')
    .map((n) => n.value)
    .join('')
    .trim()
  if (text === '' || /\s/u.test(text) || [...text].length > FRAGMENT_MAX_CHARS) return false
  const overrides = cue.nodes.filter((n) => n.type === 'tag' && n.kind === 'override')
  const raw = overrides.map((n) => n.raw).join('')
  if ([...text].length === 1) return POSITIONED.test(raw)
  return POSITIONED.test(raw) && ANIMATED.test(raw)
}

function hasOverride(cue: Cue<unknown>, re: RegExp): boolean {
  return cue.nodes.some((n) => n.type === 'tag' && n.kind === 'override' && re.test(n.raw))
}

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
      case 'bad-event':
        return { status: 'untranslated', reason: 'UNTRANSLATED_BAD_EVENT' }
    }
  }
  return classifyCue(item)
}

export function classifyCue(cue: Cue<unknown>): Classification {
  // Reconhecido pelas tags, não pelo formato: o núcleo continua agnóstico.
  if (hasOverride(cue, DRAWING)) return { status: 'skipped', reason: 'SKIPPED_DRAWING' }
  if (hasOverride(cue, KARAOKE)) return { status: 'untranslated', reason: 'UNTRANSLATED_KARAOKE' }
  if (isKaraokeFragment(cue)) return { status: 'skipped', reason: 'SKIPPED_FRAGMENT' }
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
