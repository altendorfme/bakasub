import type { SubtitleFormat } from '../core/format'
import { lexVttInline } from './inline-lexer'
import { repairVtt } from './vtt-repair'
import { parseVtt } from './vtt-parser'
import { serializeVtt } from './vtt-serializer'
import type { VttCueData } from './types'

export const vttFormat: SubtitleFormat<VttCueData> = {
  id: 'vtt',
  lexInline: lexVttInline,
  parse: parseVtt,
  serialize: serializeVtt,
  serializeRepaired: repairVtt
}

export type { VttCueData } from './types'
