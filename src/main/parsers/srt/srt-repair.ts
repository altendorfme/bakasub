import type { AppliedFix, DiagnosticCode } from '../core/diagnostics'
import type { RepairOptions, RepairResult } from '../core/format'
import { nodesRaw } from '../core/nodes'
import type { Eol, Node, SubtitleDocument } from '../core/types'
import { formatTimecode, parseTimingLine } from './timing-line'
import type { SrtCueData } from './types'

const EOL_RE = /\r\n|\r|\n/g

/** Reduz um separador a EOLs puros (remove espaços/tabs de linhas "em branco") e unifica o EOL. */
function normalizeSeparator(s: string, eol: Eol): { value: string; stripped: boolean } {
  const onlyEols = (s.match(EOL_RE) ?? []).map(() => eol).join('')
  return { value: onlyEols, stripped: s.replace(EOL_RE, '') !== '' }
}

function trimLineEnds(nodes: readonly Node[]): { nodes: Node[]; changed: boolean } {
  let changed = false
  const out = nodes.map((n, k): Node => {
    if (n.type !== 'text') return n
    const atLineEnd = k === nodes.length - 1 || nodes[k + 1].type === 'br'
    if (!atLineEnd) return n
    const trimmed = n.value.replace(/[ \t]+$/, '')
    if (trimmed === n.value) return n
    changed = true
    return trimmed === '' ? n : { type: 'text', value: trimmed }
  })
  // Texto composto só de espaços no fim da linha desaparece por inteiro.
  return { nodes: out.filter((n) => !(n.type === 'text' && /^[ \t]*$/.test(n.value))), changed }
}

/**
 * Serializa aplicando SOMENTE correções `auto` (ver FIX_POLICY). Itens `report`
 * (fim<início, sobreposição, cue vazio, coordenadas) são preservados.
 * Idempotente: reparar o resultado não aplica nada.
 */
export function repairSrt(
  doc: SubtitleDocument<SrtCueData>,
  options: RepairOptions = {}
): RepairResult {
  const eol = doc.meta.dominantEol
  const dropUnparsed = options.unparsed === 'drop'
  const applied: AppliedFix[] = []
  const fixed = (code: DiagnosticCode, ref: AppliedFix['ref'], line?: number): void => {
    applied.push({ code, ref, line })
  }

  if (doc.meta.eol === 'mixed') applied.push({ code: 'SRT_EOL_MIXED', line: 1 })

  const seenIndexes = new Set<number>()
  let out = ''
  let emitted = 0

  for (const item of doc.items) {
    if (item.kind === 'unparsed') {
      if (dropUnparsed) {
        fixed('SRT_UNPARSEABLE_BLOCK', { kind: 'block', blockIndex: item.blockIndex }, item.line)
        continue
      }
      const sep = normalizeSeparator(item.leading, eol)
      if (sep.stripped)
        fixed('SRT_TRAILING_WS', { kind: 'block', blockIndex: item.blockIndex }, item.line)
      out += (emitted === 0 ? '' : ensureBlankLine(sep.value, eol)) + item.raw.replace(EOL_RE, eol)
      emitted++
      continue
    }

    const f = item.format
    const ref = { kind: 'cue', cueId: item.id } as const
    const sep = normalizeSeparator(item.leading, eol)
    if (sep.stripped) fixed('SRT_TRAILING_WS', ref, item.line)
    if (emitted > 0 && (sep.value.match(EOL_RE)?.length ?? 0) < 2) {
      fixed('SRT_MISSING_BLANK_LINE', ref, item.line)
    }

    // Índice: sempre o ordinal (1..N).
    const canonicalIndex = String(item.id)
    if (f.index === null) fixed('SRT_INDEX_MISSING', ref, item.line)
    else if (f.index.raw !== canonicalIndex) {
      const n = Number(f.index.raw.trim())
      if (f.index.raw.trim() === canonicalIndex) fixed('SRT_TRAILING_WS', ref, item.line)
      else if (seenIndexes.has(n)) fixed('SRT_INDEX_DUPLICATE', ref, item.line)
      else fixed('SRT_INDEX_GAP', ref, item.line)
    }
    if (f.index) seenIndexes.add(Number(f.index.raw.trim()))

    // Timing: regenera a partir de `ms`; preserva coordenadas (relato) normalizando o espaçamento.
    const timingLine = f.index ? item.line + 1 : item.line
    const extras = f.extras.trim()
    const timing = `${formatTimecode(item.start.ms)} --> ${formatTimecode(item.end.ms)}${extras ? ` ${extras}` : ''}`
    if (timing !== f.timingRaw) {
      const quirks = parseTimingLine(f.timingRaw)?.quirks
      const before = applied.length
      if (quirks?.dotSeparator) fixed('SRT_TIME_DOT_SEPARATOR', ref, timingLine)
      if (quirks?.padding) fixed('SRT_TIME_PADDING', ref, timingLine)
      if (quirks?.arrowSpacing) fixed('SRT_ARROW_SPACING', ref, timingLine)
      if (f.extras !== '' && extras === '') fixed('SRT_TRAILING_WS', ref, timingLine)
      // Reescrita sem quirk específico (ex.: 75 minutos -> 01:15:00): é normalização de padding.
      if (applied.length === before) fixed('SRT_TIME_PADDING', ref, timingLine)
    }

    // Texto
    const trimmed = trimLineEnds(item.nodes)
    if (trimmed.changed) fixed('SRT_TRAILING_WS', ref, item.line)
    const nodes = trimmed.nodes.map((n): Node => (n.type === 'br' ? { ...n, raw: eol } : n))

    const header = `${canonicalIndex}${eol}${timing}`
    const cueRaw = nodes.length > 0 ? `${header}${eol}${nodesRaw(nodes)}` : header
    out += (emitted === 0 ? '' : ensureBlankLine(sep.value, eol)) + cueRaw
    emitted++
  }

  const trailing = normalizeSeparator(doc.trailing, eol)
  if (trailing.stripped) applied.push({ code: 'SRT_TRAILING_WS' })
  return { text: out + trailing.value, applied }
}

/** Garante ao menos uma linha em branco (dois EOLs) entre itens. */
function ensureBlankLine(sep: string, eol: Eol): string {
  return (sep.match(EOL_RE)?.length ?? 0) < 2 ? eol + eol : sep
}
