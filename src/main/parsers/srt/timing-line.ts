import type { Timecode } from '../core/types'

const TIME = String.raw`(\d+):(\d{1,2}):(\d{1,2})(?:([,.])(\d{1,3}))?`
const TIMING = new RegExp(String.raw`^(\s*)(${TIME})(\s*)-->(\s*)(${TIME})(.*)$`)

export interface ParsedTiming {
  readonly start: Timecode
  readonly end: Timecode
  /** Tudo que vem depois do timecode final (coordenadas "X1:..." ou só espaços). */
  readonly extras: string
  readonly quirks: {
    /** Separador "." em vez de ",". */
    readonly dotSeparator: boolean
    /** Hora < 2 dígitos, minuto/segundo != 2 dígitos, milésimos != 3 dígitos ou ausentes. */
    readonly padding: boolean
    /** Espaços diferentes de exatamente um antes e depois de "-->", ou espaço inicial. */
    readonly arrowSpacing: boolean
  }
}

function toMs(h: string, m: string, s: string, frac: string | undefined): number {
  // Fração tratada como inteiro de milissegundos (mesmo critério de ffmpeg/libass):
  // ",5" = 5 ms, não 500 ms. A correção de padding preserva esse valor.
  return ((Number(h) * 60 + Number(m)) * 60 + Number(s)) * 1000 + (frac ? Number(frac) : 0)
}

/** Retorna `null` se a linha não for uma linha de timing reconhecível (mesmo com "-->"). */
export function parseTimingLine(line: string): ParsedTiming | null {
  const m = TIMING.exec(line)
  if (!m) return null
  const [
    ,
    leadingWs,
    startRaw,
    h1,
    m1,
    s1,
    sep1,
    f1,
    wsBefore,
    wsAfter,
    endRaw,
    h2,
    m2,
    s2,
    sep2,
    f2,
    extras
  ] = m

  const canonicalTime = (
    h: string,
    mi: string,
    s: string,
    sep: string | undefined,
    f: string | undefined
  ): boolean =>
    h.length >= 2 &&
    mi.length === 2 &&
    s.length === 2 &&
    sep !== undefined &&
    f !== undefined &&
    f.length === 3

  return {
    start: { ms: toMs(h1, m1, s1, f1), raw: startRaw },
    end: { ms: toMs(h2, m2, s2, f2), raw: endRaw },
    extras,
    quirks: {
      dotSeparator: sep1 === '.' || sep2 === '.',
      padding: !canonicalTime(h1, m1, s1, sep1, f1) || !canonicalTime(h2, m2, s2, sep2, f2),
      arrowSpacing: leadingWs !== '' || wsBefore !== ' ' || wsAfter !== ' '
    }
  }
}

/** HH:MM:SS,mmm (hora com no mínimo 2 dígitos). */
export function formatTimecode(ms: number): string {
  const h = Math.floor(ms / 3_600_000)
  const m = Math.floor(ms / 60_000) % 60
  const s = Math.floor(ms / 1000) % 60
  const pad = (n: number, w: number): string => String(n).padStart(w, '0')
  return `${pad(h, 2)}:${pad(m, 2)}:${pad(s, 2)},${pad(ms % 1000, 3)}`
}
