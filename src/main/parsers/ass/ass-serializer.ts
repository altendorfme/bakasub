import { nodesRaw } from '../core/nodes'
import type { SubtitleDocument } from '../core/types'
import type { AssCueData } from './types'

/** Exato: reproduz o texto decodificado de entrada byte a byte. */
export function serializeAss(doc: SubtitleDocument<AssCueData>): string {
  let out = ''
  for (const item of doc.items) {
    out += item.leading
    out += item.kind === 'unparsed' ? item.raw : item.format.prefix + nodesRaw(item.nodes)
  }
  return out + doc.trailing
}
