import type { FormatId } from '../core/types'
import { DEFAULT_EVENT_FORMAT, parseEventFormat, type EventFormat } from './event-format'

export interface ScannedEvent {
  /** Offset do primeiro caractere de `Dialogue:`. */
  start: number
  /** Offset logo após o último caractere do conteúdo (antes do EOL). */
  end: number
  /** 1-based. */
  line: number
  /** Colunas vigentes para este evento. */
  format: EventFormat
}

export interface FormatNote {
  /** `missing`: nenhum `Format:` antes do primeiro evento; `invalid`: `Format:` inutilizável. */
  reason: 'missing' | 'invalid'
  line: number
}

export interface ScanResult {
  events: ScannedEvent[]
  dialect: Extract<FormatId, 'ass' | 'ssa'>
  formatNotes: FormatNote[]
}

const SECTION = /^\s*\[([^\]]*)\]\s*$/
const FORMAT_LINE = /^\s*Format\s*:(.*)$/i
const SCRIPT_TYPE = /^\s*ScriptType\s*:\s*(.*?)\s*$/i
const DIALOGUE = /^Dialogue:/i

/**
 * Percorre o arquivo linha a linha e localiza os `Dialogue:` de `[Events]`. Todo o resto
 * (Script Info, estilos, `Comment:`, fontes, `;`, linhas em branco) é trivia: o consumidor
 * a recupera por `input.slice(prevEnd, event.start)`.
 */
export function scanEvents(input: string): ScanResult {
  const events: ScannedEvent[] = []
  const formatNotes: FormatNote[] = []
  let section = ''
  let scriptType: string | null = null
  let sawV4Styles = false
  let format: EventFormat | null = null
  let formatReported = false

  let pos = 0
  let no = 0
  while (pos < input.length) {
    no++
    let end = pos
    while (end < input.length && input.charCodeAt(end) !== 10 && input.charCodeAt(end) !== 13) end++
    const text = input.slice(pos, end)
    let next = end
    if (input.charCodeAt(end) === 13 && input.charCodeAt(end + 1) === 10) next = end + 2
    else if (end < input.length) next = end + 1

    const header = SECTION.exec(text)
    if (header) {
      section = header[1].trim().toLowerCase()
      if (section === 'v4 styles') sawV4Styles = true
    } else if (section === 'script info') {
      const st = SCRIPT_TYPE.exec(text)
      if (st && scriptType === null) scriptType = st[1].toLowerCase()
    } else if (section === 'events') {
      const f = FORMAT_LINE.exec(text)
      if (f) {
        format = parseEventFormat(f[1])
        if (!format) formatNotes.push({ reason: 'invalid', line: no })
        formatReported = true
      } else if (DIALOGUE.test(text)) {
        if (!format && !formatReported) {
          formatNotes.push({ reason: 'missing', line: no })
          formatReported = true
        }
        events.push({ start: pos, end, line: no, format: format ?? DEFAULT_EVENT_FORMAT })
      }
    }
    pos = next
  }

  const dialect =
    scriptType !== null ? (scriptType === 'v4.00' ? 'ssa' : 'ass') : sawV4Styles ? 'ssa' : 'ass'
  return { events, dialect, formatNotes }
}
