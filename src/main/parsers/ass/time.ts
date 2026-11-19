import type { Timecode } from '../core/types'

const TIME = /^(\d+):(\d{1,2}):(\d{1,2})(?:\.(\d{1,3}))?$/
/** Forma que o Aegisub escreve: `H:MM:SS.cc`. */
const CANONICAL = /^\d+:\d{2}:\d{2}\.\d{2}$/

export interface ParsedAssTime {
  readonly timecode: Timecode
  /** `false` quando o valor é legível mas foge de `H:MM:SS.cc` (relato, sem normalização). */
  readonly canonical: boolean
}

/** Fração: 1 dígito = décimos, 2 = centésimos (padrão), 3 = milissegundos. */
function fractionMs(frac: string | undefined): number {
  return frac ? Number(frac.padEnd(3, '0')) : 0
}

/** `null` quando o campo não é um tempo legível. O `raw` guarda o campo como escrito. */
export function parseAssTime(field: string): ParsedAssTime | null {
  const trimmed = field.trim()
  const m = TIME.exec(trimmed)
  if (!m) return null
  const ms = ((Number(m[1]) * 60 + Number(m[2])) * 60 + Number(m[3])) * 1000 + fractionMs(m[4])
  return {
    timecode: { ms, raw: field },
    canonical: field === trimmed && CANONICAL.test(trimmed)
  }
}

/** `H:MM:SS.cc`, truncando para centésimos. */
export function formatAssTime(ms: number): string {
  const cs = Math.floor(Math.max(0, ms) / 10)
  const h = Math.floor(cs / 360000)
  const m = Math.floor((cs % 360000) / 6000)
  const s = Math.floor((cs % 6000) / 100)
  const pad = (n: number): string => String(n).padStart(2, '0')
  return `${h}:${pad(m)}:${pad(s)}.${pad(cs % 100)}`
}
