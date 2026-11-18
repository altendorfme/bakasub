import type { Eol, EolStyle } from '../core/types'

export interface EolAnalysis {
  eol: EolStyle
  dominantEol: Eol
}

/** Conta \r\n, \n isolado e \r isolado. Sem quebras de linha: "\n". */
export function analyzeEol(text: string): EolAnalysis {
  let crlf = 0
  let lf = 0
  let cr = 0
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i)
    if (c === 13) {
      if (text.charCodeAt(i + 1) === 10) {
        crlf++
        i++
      } else cr++
    } else if (c === 10) lf++
  }
  const kinds = [crlf, lf, cr].filter((n) => n > 0).length
  // Empate: \r\n > \n > \r
  const dominantEol: Eol =
    crlf >= lf && crlf >= cr && crlf > 0 ? '\r\n' : lf >= cr && lf > 0 ? '\n' : cr > 0 ? '\r' : '\n'
  return { eol: kinds > 1 ? 'mixed' : dominantEol, dominantEol }
}
