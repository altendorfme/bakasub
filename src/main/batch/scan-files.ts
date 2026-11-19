import { readdir, realpath, stat } from 'node:fs/promises'
import { basename, extname, isAbsolute, join, relative } from 'node:path'
import { AppError } from '../errors'
import { MAX_SUBTITLE_BYTES, SUBTITLE_EXTENSIONS, validateInputFile } from '../media/path-guard'

export interface ScannedFile {
  /** Caminho real (symlinks resolvidos). */
  readonly path: string
  readonly size: number
  /** Relativo à raiz do batch (pasta) ou só o nome (arquivos avulsos). */
  readonly relPath: string
  /** Diretório relativo, base do espelhamento de pastas ('' na raiz). */
  readonly relDir: string
}

export interface ScanOptions {
  readonly recursive: boolean
  readonly extensions: readonly string[]
  /** Padrão 2000. */
  readonly maxFiles?: number
  /** Padrão 10. */
  readonly maxDepth?: number
}

const natural = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' })

function limitFor(path: string): number | undefined {
  return SUBTITLE_EXTENSIONS.some((e) => path.toLowerCase().endsWith(e))
    ? MAX_SUBTITLE_BYTES
    : undefined
}

/**
 * Enumera uma pasta escolhida no diálogo do Main. Ignora entradas ocultas e não segue symlinks
 * de diretório (sem ciclos); cada arquivo passa pelo mesmo validador dos jobs. Ordem natural
 * (`ep2` antes de `ep10`), arquivos da pasta antes das subpastas.
 */
export async function scanFolder(
  root: string,
  opts: ScanOptions
): Promise<{ root: string; files: ScannedFile[]; truncated: boolean }> {
  if (!isAbsolute(root)) throw new AppError('INVALID_PATH', 'relative')
  let realRoot: string
  try {
    realRoot = await realpath(root)
  } catch {
    throw new AppError('INVALID_PATH', 'not-found')
  }
  if (!(await stat(realRoot)).isDirectory()) throw new AppError('INVALID_PATH', 'not-a-directory')

  const maxFiles = opts.maxFiles ?? 2000
  const maxDepth = opts.maxDepth ?? 10
  const files: ScannedFile[] = []
  let truncated = false

  const walk = async (dir: string, depth: number): Promise<void> => {
    const entries = (await readdir(dir, { withFileTypes: true }))
      .filter((e) => !e.name.startsWith('.'))
      .sort((a, b) => natural.compare(a.name, b.name))
    for (const e of entries.filter((x) => !x.isDirectory())) {
      if (!opts.extensions.includes(extname(e.name).toLowerCase())) continue
      if (e.isSymbolicLink() && !(await stat(join(dir, e.name)).catch(() => null))?.isFile())
        continue
      if (files.length >= maxFiles) {
        truncated = true
        return
      }
      const f = await validateInputFile(join(dir, e.name), opts.extensions, limitFor(e.name)).catch(
        () => null
      )
      if (!f) continue
      const relPath = relative(realRoot, join(dir, e.name))
      files.push({ path: f.path, size: f.size, relPath, relDir: relative(realRoot, dir) })
    }
    if (!opts.recursive || depth >= maxDepth) return
    for (const e of entries.filter((x) => x.isDirectory())) {
      if (truncated) return
      await walk(join(dir, e.name), depth + 1)
    }
  }
  await walk(realRoot, 1)
  return { root: realRoot, files, truncated }
}

/** Arquivos avulsos (diálogo múltiplo ou drag & drop): valida um por um. */
export async function collectFiles(
  paths: readonly string[],
  extensions: readonly string[]
): Promise<{ files: ScannedFile[]; rejected: { path: string; reason: string }[] }> {
  const files: ScannedFile[] = []
  const rejected: { path: string; reason: string }[] = []
  for (const p of paths) {
    try {
      const f = await validateInputFile(p, extensions, limitFor(p))
      files.push({ path: f.path, size: f.size, relPath: basename(f.path), relDir: '' })
    } catch (err) {
      rejected.push({ path: p, reason: err instanceof AppError ? err.message : 'invalid' })
    }
  }
  return { files, rejected }
}
