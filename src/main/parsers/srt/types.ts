/** Dados lossless de um cue SRT, opacos para as camadas independentes de formato. */
export interface SrtCueData {
  /** Linha de índice como escrita (sem EOL) e o EOL que a segue; `null` quando não há índice. */
  readonly index: { readonly raw: string; readonly eol: string } | null
  /** Linha de timing completa, como escrita (sem EOL). */
  readonly timingRaw: string
  /** EOL entre a linha de timing e o texto ('' quando o cue não tem texto). */
  readonly timingEol: string
  /** Texto após o timecode final (coordenadas "X1:..." ou só espaços). */
  readonly extras: string
}
