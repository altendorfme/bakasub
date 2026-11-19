import type { Timecode } from '../core/types'

const TIME = String.raw`(?:(\d+):)?(\d{1,2}):(\d{1,2})(?:([.,])(\d{1,3}))?`
const TIMING = new RegExp(String.raw`^(\s*)(${TIME})(\s*)-->(\s*)(${TIME})((?:[ \t].*)?)$`)
const CANONICAL_TIME = /^(?:\d{2,}:)?\d{2}:\d{2}\.\d{3}$/

export interface ParsedVttTiming {
  readonly start: Timecode
  readonly end: Timecode
  /** Configurações do cue (`align:`, `position:`…), cruas e com o espaço inicial. */
  readonly settings: string
  /** Hora/minuto/segundo/milésimos fora do canônico, vírgula, ou espaçamento do `-->`. */
  readonly quirks: { readonly format: boolean }
  /** O timestamp foi escrito com hora (preservado no reparo). */
  readonly hours: { readonly start: boolean; readonly end: boolean }
}

function toMs(h: string | undefined, m: string, s: string, frac: string | undefined): number {
  // Mesmo critério do SRT (e do ffmpeg): a fração é um inteiro de milissegundos.
  return ((Number(h ?? 0) * 60 + Number(m)) * 60 + Number(s)) * 1000 + (frac ? Number(frac) : 0)
}

/** `null` se a linha não for um timing reconhecível. */
export function parseVttTiming(line: string): ParsedVttTiming | null {
  const m = TIMING.exec(line)
  if (!m) return null
  const [
    ,
    lead,
    startRaw,
    h1,
    m1,
    s1,
    ,
    f1,
    wsBefore,
    wsAfter,
    endRaw,
    h2,
    m2,
    s2,
    ,
    f2,
    settings
  ] = m
  const format =
    lead !== '' ||
    wsBefore !== ' ' ||
    wsAfter !== ' ' ||
    !CANONICAL_TIME.test(startRaw) ||
    !CANONICAL_TIME.test(endRaw)
  return {
    start: { ms: toMs(h1, m1, s1, f1), raw: startRaw },
    end: { ms: toMs(h2, m2, s2, f2), raw: endRaw },
    settings,
    quirks: { format },
    hours: { start: h1 !== undefined, end: h2 !== undefined }
  }
}

/** `mm:ss.ttt`, ou `hh:mm:ss.ttt` quando passa de 1h ou quando `withHours`. */
export function formatVttTimestamp(ms: number, withHours: boolean): string {
  const pad = (n: number, w: number): string => String(n).padStart(w, '0')
  const h = Math.floor(ms / 3_600_000)
  const base = `${pad(Math.floor(ms / 60_000) % 60, 2)}:${pad(Math.floor(ms / 1000) % 60, 2)}.${pad(ms % 1000, 3)}`
  return withHours || h > 0 ? `${pad(h, 2)}:${base}` : base
}
