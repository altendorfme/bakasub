import { join, resolve, sep } from 'node:path'
import { AppError } from '../errors'
import type { ArchiveType } from './types'

/** Resolve `binaryRelativePath` do manifest dentro de `root`, rejeitando path traversal. */
export function resolveInside(root: string, relativePath: string): string {
  const target = resolve(root, relativePath.replace(/^[/\\]+/, ''))
  if (target !== root && !target.startsWith(root + sep)) {
    throw new AppError(
      'INVALID_MANIFEST',
      `binaryRelativePath escapa do diretório: ${relativePath}`
    )
  }
  return target
}

/** AppImage extraído depende das libs empacotadas em usr/lib. */
export function buildRuntimeEnv(archiveType: ArchiveType, root: string): Record<string, string> {
  if (archiveType !== 'appimage' || process.platform !== 'linux') return {}
  const libs = [join(root, 'usr', 'lib'), process.env['LD_LIBRARY_PATH']].filter(Boolean)
  return { LD_LIBRARY_PATH: libs.join(':') }
}

/** Argumentos de sonda por ferramenta (ffmpeg usa `-version`). */
export function probeArgs(toolName: string): string[] {
  return toolName === 'ffmpeg' ? ['-version'] : ['--version']
}
