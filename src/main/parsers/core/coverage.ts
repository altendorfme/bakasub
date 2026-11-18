import type { DiagnosticCode, ItemRef } from './diagnostics'
import { nodeRaw } from './nodes'
import { classify, type SkipReason, type UntranslatedReason } from './segmentation/segmenter'
import type { Cue, Item, SubtitleDocument } from './types'

export type CoverageReason = SkipReason | UntranslatedReason

export interface CoverageEntry {
  readonly ref: ItemRef
  /** `skipped` é benigno (nada a traduzir); `untranslated` deixa conteúdo no idioma original. */
  readonly status: 'skipped' | 'untranslated'
  readonly severity: 'info' | 'warn'
  readonly reason: CoverageReason
  /** Parâmetros para a UI localizar a mensagem; o Main nunca envia texto localizado. */
  readonly params: Readonly<Record<string, string | number>>
  readonly location: {
    readonly line: number
    readonly endLine: number
    readonly startMs?: number
    readonly endMs?: number
  }
  /** Até 120 caracteres, com quebras de linha e controles visíveis. O bruto fica sob demanda. */
  readonly excerpt: string
  /** O que acontece com o bloco na saída. */
  readonly outcome: 'kept-original' | 'omitted'
  readonly cause?: DiagnosticCode
  readonly actions: readonly ('edit-raw' | 'ignore')[]
}

export interface CoverageReport {
  readonly totals: {
    readonly cues: number
    readonly blocks: number
    readonly translatable: number
    readonly skipped: number
    readonly untranslated: number
  }
  readonly byReason: Readonly<Partial<Record<CoverageReason, number>>>
  /** `untranslated` primeiro (é o que o usuário precisa olhar), depois `skipped`; ordem do documento. */
  readonly entries: readonly CoverageEntry[]
  /** `true` quando `entries` foi cortado por `maxEntries` (os totais continuam completos). */
  readonly truncated: boolean
}

export interface CoverageOptions {
  /** Padrão: 500. */
  maxEntries?: number
  /** Deve refletir a opção de exportação; define `outcome` dos blocos não parseados. */
  unparsed?: 'keep' | 'drop'
}

const EXCERPT_MAX = 120

function excerptOf(raw: string): string {
  const visible = raw
    .replace(/\r\n|\r|\n/g, ' ⏎ ')
    // Controles C0/DEL ficam visíveis (␀, ␉…).
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u001f\u007f]/g, (c) =>
      String.fromCharCode(0x2400 + (c.charCodeAt(0) % 0x80))
    )
  const chars = [...visible]
  return chars.length > EXCERPT_MAX ? chars.slice(0, EXCERPT_MAX - 1).join('') + '…' : visible
}

function cueRaw(cue: Cue<unknown>): string {
  return cue.nodes.map(nodeRaw).join('')
}

function toEntry(item: Item<unknown>, opts: CoverageOptions): CoverageEntry | null {
  const c = classify(item)
  if (c.status === 'translatable') return null

  const base = {
    status: c.status,
    severity: c.status === 'skipped' ? ('info' as const) : ('warn' as const),
    reason: c.reason,
    params: ('params' in c && c.params ? c.params : {}) as Record<string, string>
  }

  if (item.kind === 'unparsed') {
    return {
      ...base,
      ref: { kind: 'block', blockIndex: item.blockIndex },
      location: { line: item.line, endLine: item.endLine },
      excerpt: excerptOf(item.raw),
      outcome: opts.unparsed === 'drop' ? 'omitted' : 'kept-original',
      cause: 'SRT_UNPARSEABLE_BLOCK',
      actions: c.status === 'skipped' ? ['ignore'] : ['edit-raw', 'ignore']
    }
  }

  return {
    ...base,
    ref: { kind: 'cue', cueId: item.id },
    location: {
      line: item.line,
      endLine: item.endLine,
      startMs: item.start.ms,
      endMs: item.end.ms
    },
    excerpt: excerptOf(cueRaw(item)),
    outcome: 'kept-original',
    cause: c.reason === 'UNTRANSLATED_MARKER_COLLISION' ? 'SEG_MARKER_COLLISION' : undefined,
    actions: c.status === 'skipped' ? ['ignore'] : ['edit-raw', 'ignore']
  }
}

/** Parte do preflight: o que NÃO será traduzido, onde e por quê. Função pura sobre o documento. */
export function analyzeCoverage(
  doc: SubtitleDocument<unknown>,
  opts: CoverageOptions = {}
): CoverageReport {
  const maxEntries = opts.maxEntries ?? 500
  const untranslated: CoverageEntry[] = []
  const skipped: CoverageEntry[] = []
  const byReason: Partial<Record<CoverageReason, number>> = {}
  let cues = 0
  let blocks = 0
  let translatable = 0

  doc.items.forEach((item) => {
    if (item.kind === 'cue') cues++
    else blocks++
    const entry = toEntry(item, opts)
    if (!entry) {
      translatable++
      return
    }
    byReason[entry.reason] = (byReason[entry.reason] ?? 0) + 1
    ;(entry.status === 'untranslated' ? untranslated : skipped).push(entry)
  })

  const all = [...untranslated, ...skipped]
  return {
    totals: {
      cues,
      blocks,
      translatable,
      skipped: skipped.length,
      untranslated: untranslated.length
    },
    byReason,
    entries: all.slice(0, maxEntries),
    truncated: all.length > maxEntries
  }
}
