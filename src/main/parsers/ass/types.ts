/**
 * Dados lossless de um evento `Dialogue:` ASS/SSA, opacos para as camadas independentes de formato.
 * `Style` e `Name` vivem em `Cue.style`/`Cue.actor`; o `Text` vive em `Cue.nodes`.
 * Os valores abaixo são os campos já sem espaços nas bordas ('' quando a coluna não existe).
 */
export interface AssCueData {
  /**
   * Linha crua do início de `Dialogue:` até a vírgula que precede o `Text`, verbatim
   * (a serialização exata é `prefix + texto`).
   */
  readonly prefix: string
  /** Coluna `Layer` (ASS) ou `Marked` (SSA, ex.: "Marked=0"). */
  readonly layer: string
  readonly marginL: string
  readonly marginR: string
  readonly marginV: string
  readonly effect: string
}
