export interface Log {
  info(...args: unknown[]): void
  warn(...args: unknown[]): void
  error(...args: unknown[]): void
}

export type ArchiveType = 'zip' | '7z' | 'appimage'

export interface SidecarDirs {
  /** userData/bin */
  root: string
  /** userData/bin/archives/<sha256>/ — conteúdo extraído, deduplicado por artefato. */
  archives: string
  /** userData/bin/downloads — arquivos .zip/.7z/.AppImage em trânsito. */
  downloads: string
  /** userData/bin/installed.json */
  registryFile: string
}

export interface ToolInstall {
  name: string
  version: string
  binaryRelativePath: string
}

/** Uma unidade = um artefato baixado; pode servir várias ferramentas (mkvextract + mkvmerge). */
export interface InstallUnit {
  url: string
  sha256: string
  archiveType: ArchiveType
  tools: ToolInstall[]
}

export interface ConsentRequest {
  installDir: string
  items: Array<{ tools: Array<{ name: string; version: string }>; host: string }>
}

/** Gate de consentimento: implementação concreta usa diálogo nativo no Main. */
export interface ConsentGate {
  confirmDownload(request: ConsentRequest): Promise<boolean>
}

export interface ResolvedSidecar {
  name: string
  version: string
  path: string
  /** Variáveis extras para spawn (ex.: LD_LIBRARY_PATH em AppImage extraído). */
  env: Record<string, string>
}
