import type { AppliedFix, DiagnosticCode } from '../core/diagnostics'
import type { RepairOptions, RepairResult } from '../core/format'
import { nodesRaw } from '../core/nodes'
import type { Eol, Node, SubtitleDocument } from '../core/types'
import { escapeVttText } from './inline-lexer'
import { formatVttTimestamp, parseVttTiming } from './timing-line'
import type { VttCueData } from './types'

const EOL_RE = /\r\n|\r|\n/g
const ARROW = '-->'

/**
 * Normaliza um trecho entre itens (separador + trivia): linhas só de espaços ficam vazias e o EOL
 * é unificado. Trivia (NOTE/STYLE/REGION/cabeçalho) é preservada linha a linha.
 */
function normalizeGap(gap: string, eol: Eol): { value: string; stripped: boolean } {
  let stripped = false
  const value = gap
    .split(EOL_RE)
    .map((l) => {
      if (l !== '' && /^\s*$/.test(l)) {
        stripped = true
        return ''
      }
      return l
    })
    .join(eol)
  return { value, stripped }
}

/** Garante que o trecho termine numa linha em branco (dois EOLs após o último conteúdo). */
function endWithBlankLine(gap: string, eol: Eol): string {
  if (gap === '') return ''
  if (gap.endsWith(eol + eol)) return gap
  return gap.endsWith(eol) ? gap + eol : gap + eol + eol
}

/** Texto do cue: `-->` cru vira `--&gt;`; texto novo sai escapado; EOL unificado. */
function cueText(nodes: readonly Node[], eol: Eol): { raw: string; arrow: boolean } {
  let arrow = false
  const fixed = nodes.map((n): Node => {
    if (n.type === 'br') return { ...n, raw: eol }
    if (n.type === 'text' && n.raw?.includes(ARROW)) {
      arrow = true
      return { ...n, raw: n.raw.replaceAll(ARROW, '--&gt;') }
    }
    return n
  })
  return { raw: nodesRaw(fixed, escapeVttText), arrow }
}

/**
 * Serializa aplicando SOMENTE correções `auto` (ver FIX_POLICY). Relatos (fim<início, cue vazio)
 * e configurações do cue são preservados. Idempotente.
 */
export function repairVtt(
  doc: SubtitleDocument<VttCueData>,
  options: RepairOptions = {}
): RepairResult {
  const eol = doc.meta.dominantEol
  const applied: AppliedFix[] = []
  const fixed = (code: DiagnosticCode, ref?: AppliedFix['ref'], line?: number): void => {
    applied.push({ code, ref, line })
  }

  if (doc.meta.eol === 'mixed') fixed('VTT_EOL_MIXED', undefined, 1)
  const missingHeader = doc.diagnostics.some((d) => d.code === 'VTT_HEADER_MISSING')
  if (missingHeader) fixed('VTT_HEADER_MISSING', undefined, 1)

  let out = missingHeader ? `WEBVTT${eol}${eol}` : ''
  let emitted = 0
  let prevUnparsed = false
  /** Trivia que antecedia um bloco descartado: passa para o item seguinte. */
  let carry = ''

  for (const item of doc.items) {
    const gap = normalizeGap(item.leading, eol)
    let lead = carry + gap.value
    carry = ''
    // Sem cabeçalho original, as linhas em branco iniciais já vêm do cabeçalho inserido.
    if (emitted === 0 && missingHeader) lead = lead.replace(/^(?:\r\n|\r|\n)+/, '')
    // Antes do primeiro item só há algo a separar se houver cabeçalho/trivia. Um cue colado a
    // linhas órfãs do mesmo bloco não é separado: o identificador viraria trivia (ex.: "NOTE x").
    const gluedToOrphan = prevUnparsed && !/\S/.test(lead) && (lead.match(EOL_RE)?.length ?? 0) < 2
    const needsBlank = (emitted > 0 || lead !== '') && !gluedToOrphan
    const separated = needsBlank ? endWithBlankLine(lead, eol) : lead

    if (item.kind === 'unparsed') {
      if (options.unparsed === 'drop') {
        fixed('VTT_UNPARSEABLE_BLOCK', { kind: 'block', blockIndex: item.blockIndex }, item.line)
        carry = lead.replace(/(?:\r\n|\r|\n)+$/, '')
        continue
      }
      out += separated + item.raw.replace(EOL_RE, eol)
      emitted++
      prevUnparsed = true
      continue
    }

    const ref = { kind: 'cue', cueId: item.id } as const
    if (gap.stripped || (needsBlank && separated !== lead))
      fixed('VTT_MISSING_BLANK_LINE', ref, item.line)

    const f = item.format
    const quirks = parseVttTiming(f.timingRaw)
    let timing = f.timingRaw
    if (quirks?.quirks.format) {
      timing = `${formatVttTimestamp(item.start.ms, quirks.hours.start)} --> ${formatVttTimestamp(item.end.ms, quirks.hours.end)}${f.settings}`
      fixed('VTT_TIME_FORMAT', ref, item.line)
    }

    const body = cueText(item.nodes, eol)
    if (body.arrow) fixed('VTT_ARROW_IN_TEXT', ref, item.line)

    out += separated
    if (f.identifier) out += f.identifier.raw + eol
    out += timing + (item.nodes.length > 0 ? eol + body.raw : '')
    emitted++
    prevUnparsed = false
  }

  return { text: out + carry + normalizeGap(doc.trailing, eol).value, applied }
}
