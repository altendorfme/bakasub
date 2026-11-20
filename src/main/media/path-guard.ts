import { constants } from 'node:fs'
import { access, realpath, stat, statfs } from 'node:fs/promises'
import { extname, isAbsolute } from 'node:path'
import { AppError } from '../errors'

import { MEDIA_EXTENSIONS, SUBTITLE_EXTENSIONS } from '../../shared/file-types'

export { MEDIA_EXTENSIONS, SUBTITLE_EXTENSIONS }
/** Legendas maiores que isto não são legendas. */
export const MAX_SUBTITLE_BYTES = 50 * 1024 * 1024

type InvalidReason =
  | 'relative'
  | 'not-found'
  | 'not-a-file'
  | 'not-a-directory'
  | 'extension'
  | 'unreadable'
  | 'not-writable'
  | 'too-large'

const invalid = (reason: InvalidReason): AppError => new AppError('INVALID_PATH', reason)

/**
 * Único validador de caminhos vindos do renderer (diálogo ou drag & drop). Resolve symlinks e
 * exige: caminho absoluto, arquivo regular legível, extensão permitida (no nome pedido e no
 * destino real) e tamanho dentro do limite. A mensagem do erro é o motivo (estável, para a UI).
 */
export async function validateInputFile(
  path: string,
  allowed: readonly string[],
  maxBytes = Number.POSITIVE_INFINITY
): Promise<{ path: string; size: number }> {
  if (!isAbsolute(path)) throw invalid('relative')
  const okExt = (p: string): boolean => allowed.includes(extname(p).toLowerCase())
  if (!okExt(path)) throw invalid('extension')
  let real: string
  try {
    real = await realpath(path)
  } catch {
    throw invalid('not-found')
  }
  const st = await stat(real)
  if (!st.isFile()) throw invalid('not-a-file')
  if (!okExt(real)) throw invalid('extension')
  if (st.size > maxBytes) throw invalid('too-large')
  try {
    await access(real, constants.R_OK)
  } catch {
    throw invalid('unreadable')
  }
  return { path: real, size: st.size }
}

export async function validateOutputDir(path: string): Promise<string> {
  if (!isAbsolute(path)) throw invalid('relative')
  let real: string
  try {
    real = await realpath(path)
  } catch {
    throw invalid('not-found')
  }
  if (!(await stat(real)).isDirectory()) throw invalid('not-a-directory')
  try {
    await access(real, constants.W_OK)
  } catch {
    throw invalid('not-writable')
  }
  return real
}

/** Falha cedo (`DISK_FULL`) em vez de quebrar no meio de um mux/extract. */
export async function ensureFreeSpace(dir: string, bytes: number): Promise<void> {
  const fs = await statfs(dir)
  const free = Number(fs.bavail) * Number(fs.bsize)
  if (free < bytes)
    throw new AppError('DISK_FULL', `Not enough disk space: need ${bytes} bytes, have ${free}`)
}
