export interface Extractor {
  /**
   * Extrai `archive` para dentro de `stagingDir`.
   * Retorna o diretório que deve virar a raiz do artefato (pode ser `stagingDir` ou um subdiretório).
   */
  extract(archive: string, stagingDir: string, signal?: AbortSignal): Promise<string>
}
