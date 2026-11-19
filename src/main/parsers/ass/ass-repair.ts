import type { AppliedFix } from '../core/diagnostics'
import type { RepairOptions, RepairResult } from '../core/format'
import { nodesRaw } from '../core/nodes'
import type { SubtitleDocument } from '../core/types'
import type { AssCueData } from './types'

const EOL_RE = /\r\n|\r|\n/g

/**
 * Única correção `auto` do ASS: unificar o EOL no dominante. Tempo fora do padrão, `Format:`
 * ausente e fim<início são só relato, e não há trim (espaços finais do `Text` podem importar).
 * O `Text` nunca contém EOL (o evento ocupa uma linha), então só `leading`/`trailing` mudam.
 */
export function repairAss(
  doc: SubtitleDocument<AssCueData>,
  options: RepairOptions = {}
): RepairResult {
  const eol = doc.meta.dominantEol
  const applied: AppliedFix[] = []
  if (doc.meta.eol === 'mixed') applied.push({ code: 'ASS_EOL_MIXED', line: 1 })

  let out = ''
  for (const item of doc.items) {
    if (item.kind === 'unparsed') {
      if (options.unparsed === 'drop') {
        // O EOL da linha descartada vive no `leading` do item seguinte: nada fica em branco.
        applied.push({
          code: 'ASS_UNPARSEABLE_EVENT',
          ref: { kind: 'block', blockIndex: item.blockIndex },
          line: item.line
        })
        continue
      }
      out += item.leading.replace(EOL_RE, eol) + item.raw
    } else {
      out += item.leading.replace(EOL_RE, eol) + item.format.prefix + nodesRaw(item.nodes)
    }
  }
  return { text: out + doc.trailing.replace(EOL_RE, eol), applied }
}
