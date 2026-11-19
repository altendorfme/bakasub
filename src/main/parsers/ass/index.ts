import type { SubtitleFormat } from '../core/format'
import type { FormatId } from '../core/types'
import { repairAss } from './ass-repair'
import { parseAss } from './ass-parser'
import { serializeAss } from './ass-serializer'
import { lexInline } from './inline-lexer'
import type { AssCueData } from './types'

function make(id: Extract<FormatId, 'ass' | 'ssa'>): SubtitleFormat<AssCueData> {
  return {
    id,
    lexInline,
    // O dialeto real (`doc.format`) vem do conteúdo, não do objeto usado para parsear.
    parse: parseAss,
    serialize: serializeAss,
    serializeRepaired: repairAss
  }
}

export const assFormat = make('ass')
export const ssaFormat = make('ssa')

export type { AssCueData } from './types'
