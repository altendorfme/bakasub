import { nodesRaw } from '../core/nodes'
import type { SubtitleDocument } from '../core/types'
import type { SrtCueData } from './types'

/** Exato: reproduz o texto decodificado de entrada byte a byte. */
export function serializeSrt(doc: SubtitleDocument<SrtCueData>): string {
  let out = ''
  for (const item of doc.items) {
    out += item.leading
    if (item.kind === 'unparsed') {
      out += item.raw
    } else {
      const f = item.format
      if (f.index) out += f.index.raw + f.index.eol
      out += f.timingRaw + f.timingEol + nodesRaw(item.nodes)
    }
  }
  return out + doc.trailing
}
