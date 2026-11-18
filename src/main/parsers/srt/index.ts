import type { SubtitleFormat } from '../core/format'
import { lexInline } from './inline-lexer'
import { parseSrt } from './srt-parser'
import { repairSrt } from './srt-repair'
import { serializeSrt } from './srt-serializer'
import type { SrtCueData } from './types'

export const srtFormat: SubtitleFormat<SrtCueData> = {
  id: 'srt',
  lexInline,
  parse: parseSrt,
  serialize: serializeSrt,
  serializeRepaired: repairSrt
}

export type { SrtCueData } from './types'
