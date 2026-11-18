import { randomUUID } from 'node:crypto'
import { chmod, mkdir, readdir, rename, rm, stat } from 'node:fs/promises'
import { join } from 'node:path'
import { AppError } from '../errors'
import { buildRuntimeEnv, probeArgs, resolveInside } from './binary-path'
import { downloadVerified } from './downloader'
import { copyPruned } from './prune'
import type { Extractor } from './extractors/extractor'
import type { InstalledRegistry } from './installed-registry'
import type { ProcessRunner } from './process-runner'
import type { ArchiveType, InstallUnit, Log, SidecarDirs } from './types'
import type { SidecarProgress } from '../../shared/ipc-contract'

export type ProgressSink = (p: SidecarProgress) => void

const EXT: Record<ArchiveType, string> = { zip: 'zip', '7z': '7z', appimage: 'AppImage' }

export class SidecarInstaller {
  constructor(
    private readonly d: {
      dirs: SidecarDirs
      runner: ProcessRunner
      extractors: Record<ArchiveType, Extractor>
      registry: InstalledRegistry
      idleTimeoutMs: number
      log: Log
    }
  ) {}

  archiveDir(sha256: string): string {
    return join(this.d.dirs.archives, sha256.toLowerCase())
  }

  async installUnit(unit: InstallUnit, signal: AbortSignal, emit: ProgressSink): Promise<void> {
    const label = unit.tools.map((t) => t.name).join('+')
    const { dirs } = this.d
    const final = this.archiveDir(unit.sha256)
    const progress = (
      phase: SidecarProgress['phase'],
      received = 0,
      total: number | null = null
    ): void => emit({ archive: label, phase, received, total })

    const reused = await this.hasAllBinaries(final, unit)
    if (!reused) {
      await mkdir(dirs.archives, { recursive: true })
      await mkdir(dirs.downloads, { recursive: true })
      const file = join(dirs.downloads, `${unit.sha256}.${EXT[unit.archiveType]}`)
      const staging = join(dirs.archives, `.partial-${unit.sha256}-${randomUUID()}`)
      const prunedDir = `${staging}-pruned`
      try {
        progress('downloading')
        await downloadVerified({
          url: unit.url,
          sha256: unit.sha256,
          destFile: file,
          signal,
          idleTimeoutMs: this.d.idleTimeoutMs,
          log: this.d.log,
          onProgress: (r, t) => progress('downloading', r, t)
        })
        progress('extracting')
        await mkdir(staging)
        const fullRoot = await this.d.extractors[unit.archiveType].extract(file, staging, signal)
        const root = await this.tryPrune(fullRoot, prunedDir, unit, signal)
        await rm(final, { recursive: true, force: true })
        await rename(root, final)
      } finally {
        await rm(staging, { recursive: true, force: true })
        await rm(prunedDir, { recursive: true, force: true })
        await rm(file, { force: true })
      }
    }

    progress('probing')
    try {
      await this.probeAll(final, unit, signal)
    } catch (err) {
      if (!reused) await rm(final, { recursive: true, force: true })
      throw err
    }

    const installedAt = new Date().toISOString()
    await this.d.registry.update((tools) => {
      for (const t of unit.tools) {
        tools[t.name] = {
          version: t.version,
          archiveSha256: unit.sha256.toLowerCase(),
          archiveType: unit.archiveType,
          binaryRelativePath: t.binaryRelativePath,
          installedAt
        }
      }
    })
    progress('done')
  }

  /** Remove diretórios de artefatos que nenhuma ferramenta registrada referencia + restos de staging. */
  async collectGarbage(): Promise<void> {
    const referenced = new Set(
      Object.values(await this.d.registry.read()).map((e) => e.archiveSha256)
    )
    const entries = await readdir(this.d.dirs.archives).catch(() => [] as string[])
    for (const name of entries) {
      if (referenced.has(name)) continue
      this.d.log.info(`sidecar gc: removendo ${name}`)
      await rm(join(this.d.dirs.archives, name), { recursive: true, force: true })
    }
    // Downloads parciais (.part) são mantidos por 7 dias para permitir resume.
    const maxAgeMs = 7 * 24 * 3600 * 1000
    for (const name of await readdir(this.d.dirs.downloads).catch(() => [] as string[])) {
      const full = join(this.d.dirs.downloads, name)
      const st = await stat(full).catch(() => null)
      if (st && Date.now() - st.mtimeMs > maxAgeMs) await rm(full, { force: true })
    }
  }

  /** Executa cada ferramenta (chmod + sonda) a partir de `root`. */
  private async probeAll(root: string, unit: InstallUnit, signal: AbortSignal): Promise<void> {
    for (const tool of unit.tools) {
      const bin = resolveInside(root, tool.binaryRelativePath)
      if (process.platform !== 'win32') await chmod(bin, 0o755)
      const res = await this.d.runner.run(bin, probeArgs(tool.name), {
        signal,
        timeoutMs: 15_000,
        env: buildRuntimeEnv(unit.archiveType, root)
      })
      if (res.code !== 0) {
        throw new AppError(
          'PROBE_FAILED',
          `${tool.name} não executou (código ${res.code}): ${res.stderr.slice(0, 300)}`
        )
      }
    }
  }

  /**
   * Gera uma cópia enxuta (binários + dependências) e a valida. Qualquer falha cai de volta
   * para a árvore completa — a poda é otimização, nunca pode impedir a instalação.
   */
  private async tryPrune(
    fullRoot: string,
    prunedDir: string,
    unit: InstallUnit,
    signal: AbortSignal
  ): Promise<string> {
    try {
      const stats = await copyPruned(fullRoot, prunedDir, unit.archiveType, unit.tools)
      await this.probeAll(prunedDir, unit, signal)
      this.d.log.info(
        `sidecar prune: ${unit.tools.map((t) => t.name).join('+')} -> ${stats.files} arquivos, ${(stats.bytes / 1e6).toFixed(1)} MB`
      )
      return prunedDir
    } catch (err) {
      if (err instanceof AppError && err.code === 'CANCELLED') throw err
      this.d.log.warn('sidecar prune falhou; mantendo árvore completa', err)
      await rm(prunedDir, { recursive: true, force: true })
      return fullRoot
    }
  }

  private async hasAllBinaries(root: string, unit: InstallUnit): Promise<boolean> {
    try {
      for (const t of unit.tools) {
        if (!(await stat(resolveInside(root, t.binaryRelativePath))).isFile()) return false
      }
      return true
    } catch {
      return false
    }
  }
}
