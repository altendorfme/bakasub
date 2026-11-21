import { stat } from 'node:fs/promises'
import { remote } from '../config/remote'
import { AppError } from '../errors'
import type {
  SidecarInstallFailure,
  SidecarInstallResult,
  SidecarProgress,
  SidecarReport,
  SidecarToolStatus
} from '../../shared/ipc-contract'
import { buildRuntimeEnv, resolveInside } from './binary-path'
import type { InstalledRegistry } from './installed-registry'
import type { ManifestClient } from './manifest-client'
import {
  sidecarManifestSchema,
  type SidecarArtifact,
  type SidecarManifest,
  type SidecarToolManifest
} from './manifest.schema'
import type { SidecarInstaller } from './sidecar-installer'
import type { ConsentGate, InstallUnit, Log, ResolvedSidecar, SidecarDirs } from './types'

export class SidecarManager {
  private active: AbortController | null = null

  constructor(
    private readonly d: {
      manifests: ManifestClient
      registry: InstalledRegistry
      installer: SidecarInstaller
      consent: ConsentGate
      dirs: SidecarDirs
      platform: string
      arch: string
      emitProgress(p: SidecarProgress): void
      log: Log
    }
  ) {}

  /** Somente leitura/rede de metadados: NUNCA baixa binários. */
  async check(): Promise<SidecarReport> {
    const { data: manifest, offline } = await this.d.manifests.load(
      'sidecar',
      remote.sidecarManifestUrl,
      sidecarManifestSchema
    )
    return this.buildReport(manifest, offline)
  }

  private async buildReport(manifest: SidecarManifest, offline: boolean): Promise<SidecarReport> {
    const installed = await this.d.registry.read()

    const tools: SidecarToolStatus[] = []
    for (const tool of manifest.tools) {
      const artifact = this.artifactFor(tool)
      const entry = installed[tool.name]
      let path: string | null = null
      if (entry) path = await this.existingBinary(entry.archiveSha256, entry.binaryRelativePath)

      let state: SidecarToolStatus['state']
      if (!artifact) state = 'unsupported'
      else if (!entry || !path) state = 'missing'
      else if (entry.version !== tool.version) state = 'outdated'
      else state = 'ok'

      tools.push({
        name: tool.name,
        requiredVersion: tool.version,
        installedVersion: entry && path ? entry.version : null,
        state,
        path: state === 'ok' || state === 'outdated' ? path : null
      })
    }

    return {
      checkedAt: new Date().toISOString(),
      manifestUpdatedAt: manifest.updatedAt,
      offline,
      installDir: this.d.dirs.root,
      tools,
      ready: tools.every((t) => t.state === 'ok')
    }
  }

  /** Caminho + env para spawn. Usado pelos serviços de ffmpeg/mkvtoolnix. */
  async resolve(name: string): Promise<ResolvedSidecar> {
    const entry = (await this.d.registry.read())[name]
    const path = entry && (await this.existingBinary(entry.archiveSha256, entry.binaryRelativePath))
    if (!entry || !path) throw new AppError('SIDECAR_MISSING', `Sidecar não instalado: ${name}`)
    return {
      name,
      version: entry.version,
      path,
      env: buildRuntimeEnv(entry.archiveType, this.d.installer.archiveDir(entry.archiveSha256))
    }
  }

  /**
   * Instala ferramentas pedidas. Passa SEMPRE pelo ConsentGate (diálogo nativo no Main):
   * o renderer não consegue disparar download sem aceite explícito do usuário.
   */
  async install(requested: string[]): Promise<SidecarInstallResult> {
    if (this.active) throw new AppError('SIDECAR_BUSY', 'Já existe uma instalação em andamento')
    const ctrl = new AbortController()
    this.active = ctrl
    try {
      const { data: manifest, offline } = await this.d.manifests.load(
        'sidecar',
        remote.sidecarManifestUrl,
        sidecarManifestSchema
      )
      const report = await this.buildReport(manifest, offline)
      const pending = [...new Set(requested)].filter((name) => {
        const status = report.tools.find((t) => t.name === name)
        if (!status) throw new AppError('UNKNOWN_TOOL', `Ferramenta desconhecida: ${name}`)
        if (status.state === 'unsupported') {
          throw new AppError(
            'UNSUPPORTED_PLATFORM',
            `${name} não tem build para ${this.d.platform}/${this.d.arch}`
          )
        }
        return status.state !== 'ok'
      })
      if (pending.length === 0) return { outcome: 'installed', tools: [] }

      const units = this.planUnits(manifest, pending)
      const accepted = await this.d.consent.confirmDownload({
        installDir: this.d.dirs.root,
        items: units.map((u) => ({
          tools: u.tools.map((t) => ({ name: t.name, version: t.version })),
          host: new URL(u.url).host
        }))
      })
      if (!accepted) return { outcome: 'declined' }

      // Cada unidade é independente: a falha de uma não impede as demais.
      const installed: string[] = []
      const failures: SidecarInstallFailure[] = []
      let firstError: unknown
      try {
        for (const unit of units) {
          const names = unit.tools.map((t) => t.name)
          try {
            await this.d.installer.installUnit(unit, ctrl.signal, this.d.emitProgress)
            installed.push(...names)
          } catch (err) {
            if (err instanceof AppError && err.code === 'CANCELLED') throw err
            this.d.log.error(`sidecar install falhou: ${names.join('+')}`, err)
            firstError ??= err
            failures.push({
              tools: names,
              code: err instanceof AppError ? err.code : 'UNKNOWN',
              message: err instanceof Error ? err.message : String(err)
            })
          }
        }
      } finally {
        await this.collectGarbage()
      }
      if (installed.length === 0 && failures.length > 0) throw firstError
      return failures.length > 0
        ? { outcome: 'installed', tools: installed, failures }
        : { outcome: 'installed', tools: installed }
    } catch (err) {
      if (err instanceof AppError && err.code === 'CANCELLED') return { outcome: 'cancelled' }
      throw err
    } finally {
      this.active = null
    }
  }

  /** Best-effort (boot e fim de instalação): sobras `.partial-*` travadas ficam para a próxima vez. */
  async collectGarbage(): Promise<void> {
    try {
      await this.d.installer.collectGarbage()
    } catch (err) {
      this.d.log.warn('sidecar gc falhou', err)
    }
  }

  cancel(): boolean {
    if (!this.active) return false
    this.active.abort()
    return true
  }

  /** Para o ShutdownCoordinator. */
  dispose(): void {
    this.active?.abort()
  }

  private artifactFor(tool: SidecarToolManifest): SidecarArtifact | undefined {
    return tool.artifacts[this.d.platform]?.[this.d.arch]
  }

  /** Agrupa ferramentas que compartilham o mesmo artefato (mesmo sha256) em uma única unidade. */
  private planUnits(manifest: SidecarManifest, names: string[]): InstallUnit[] {
    const bySha = new Map<string, InstallUnit>()
    for (const name of names) {
      const tool = manifest.tools.find((t) => t.name === name)!
      const art = this.artifactFor(tool)!
      const key = art.sha256.toLowerCase()
      const unit = bySha.get(key) ?? {
        url: art.url,
        sha256: key,
        archiveType: art.archiveType,
        tools: []
      }
      unit.tools.push({ name, version: tool.version, binaryRelativePath: art.binaryRelativePath })
      bySha.set(key, unit)
    }
    return [...bySha.values()]
  }

  private async existingBinary(sha256: string, relativePath: string): Promise<string | null> {
    try {
      const bin = resolveInside(this.d.installer.archiveDir(sha256), relativePath)
      return (await stat(bin)).isFile() ? bin : null
    } catch {
      return null
    }
  }
}
