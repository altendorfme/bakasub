/** Dados lossless de um cue WebVTT, opacos para as camadas independentes de formato. */
export interface VttCueData {
  /** Linha de identificador (sem EOL) e o EOL que a segue; `null` sem identificador. */
  readonly identifier: { readonly raw: string; readonly eol: string } | null
  /** Linha de timing completa, como escrita (sem EOL). */
  readonly timingRaw: string
  /** EOL entre o timing e o texto ('' quando o cue não tem texto). */
  readonly timingEol: string
  /** Configurações após o timestamp final, com o espaço inicial (`' align:start'`) ou ''. */
  readonly settings: string
}
