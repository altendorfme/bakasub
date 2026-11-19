import { nodesRaw } from '../core/nodes'
import type { SubtitleDocument } from '../core/types'
import { escapeVttText } from './inline-lexer'
import type { VttCueData } from './types'

/** Exato para o documento parseado; texto novo (sem `raw`) sai escapado. */
export function serializeVtt(doc: SubtitleDocument<VttCueData>): string {
  let out = ''
  for (const item of doc.items) {
    out += item.leading
    if (item.kind === 'unparsed') {
      out += item.raw
      continue
    }
    const f = item.format
    if (f.identifier) out += f.identifier.raw + f.identifier.eol
    out += f.timingRaw + f.timingEol + nodesRaw(item.nodes, escapeVttText)
  }
  return out + doc.trailing
}
