import { chmod, copyFile, lstat, mkdir, readdir, readlink, symlink } from 'node:fs/promises'
import { dirname, join, posix, relative, resolve, sep } from 'node:path'
import { resolveInside } from './binary-path'
import { readElfNeeded } from './elf-needed'
import type { ArchiveType, ToolInstall } from './types'

const toPosix = (p: string): string => p.split(sep).join('/')

async function walk(dir: string, root: string, out: string[]): Promise<void> {
  for (const e of await readdir(dir, { withFileTypes: true })) {
    const full = join(dir, e.name)
    if (e.isDirectory()) await walk(full, root, out)
    else out.push(toPosix(relative(root, full)))
  }
}

/**
 * AppImage: binários + fecho transitivo de DT_NEEDED resolvido em usr/lib
 * (mesmo diretório exposto via LD_LIBRARY_PATH). Libs do sistema (libc, libm...) não estão no
 * AppImage e são ignoradas. Cadeias de symlink (.so -> .so.1 -> .so.1.2.3) são preservadas.
 */
async function elfKeepSet(root: string, binaries: string[]): Promise<Set<string>> {
  const all: string[] = []
  await walk(root, root, all)
  const libIndex = new Map<string, string>()
  for (const rel of all) {
    if (rel.startsWith('usr/lib/') && /\.so(\.|$)/.test(rel)) libIndex.set(posix.basename(rel), rel)
  }

  const keep = new Set<string>(binaries)
  const queue = [...binaries]
  while (queue.length) {
    const current = queue.pop()!
    for (const soname of await readElfNeeded(join(root, current))) {
      let rel = libIndex.get(soname)
      while (rel && !keep.has(rel)) {
        keep.add(rel)
        queue.push(rel)
        const st = await lstat(join(root, rel))
        rel = st.isSymbolicLink()
          ? posix.join(posix.dirname(rel), toPosix(await readlink(join(root, rel))))
          : undefined
      }
    }
  }
  return keep
}

/** zip/7z (Windows): binários + DLLs vizinhas. */
async function siblingKeepSet(root: string, binaries: string[]): Promise<Set<string>> {
  const keep = new Set<string>(binaries)
  const dirs = new Set(binaries.map((b) => posix.dirname(b)))
  for (const d of dirs) {
    for (const e of await readdir(join(root, d), { withFileTypes: true })) {
      if (e.isFile() && e.name.toLowerCase().endsWith('.dll')) keep.add(posix.join(d, e.name))
    }
  }
  return keep
}

/**
 * Copia apenas o necessário para `dest`. O original NÃO é alterado: quem chama valida `dest`
 * (probe) e, se falhar, mantém o diretório completo.
 */
export async function copyPruned(
  root: string,
  dest: string,
  archiveType: ArchiveType,
  tools: ToolInstall[]
): Promise<{ files: number; bytes: number }> {
  const binaries = tools.map((t) =>
    toPosix(relative(root, resolveInside(root, t.binaryRelativePath)))
  )
  const keep =
    archiveType === 'appimage'
      ? await elfKeepSet(root, binaries)
      : await siblingKeepSet(root, binaries)

  let bytes = 0
  for (const rel of keep) {
    const src = resolve(root, rel)
    const dst = resolve(dest, rel)
    await mkdir(dirname(dst), { recursive: true })
    const st = await lstat(src)
    if (st.isSymbolicLink()) {
      await symlink(await readlink(src), dst)
    } else {
      await copyFile(src, dst)
      await chmod(dst, st.mode & 0o777)
      bytes += st.size
    }
  }
  return { files: keep.size, bytes }
}
