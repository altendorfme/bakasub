import { join } from 'node:path'
import { remote } from '../config/remote'
import { AppImageExtractor } from './extractors/appimage.extractor'
import { SevenZipExtractor } from './extractors/seven-zip.extractor'
import { InstalledRegistry } from './installed-registry'
import { ManifestClient } from './manifest-client'
import { ProcessRunner } from './process-runner'
import { SidecarInstaller } from './sidecar-installer'
import { SidecarManager } from './sidecar-manager'
import type { ConsentGate, Log, SidecarDirs } from './types'
import type { SidecarProgress } from '../../shared/ipc-contract'

export interface SidecarModuleOptions {
  binDir: string
  cacheDir: string
  sevenZipPath: string
  consent: ConsentGate
  emitProgress(p: SidecarProgress): void
  log: Log
  platform?: string
  arch?: string
}

/** Composition root do módulo de sidecars — livre de `electron`, portanto testável em Node puro. */
export function createSidecarModule(o: SidecarModuleOptions): {
  manager: SidecarManager
  runner: ProcessRunner
  manifests: ManifestClient
} {
  const dirs: SidecarDirs = {
    root: o.binDir,
    archives: join(o.binDir, 'archives'),
    downloads: join(o.binDir, 'downloads'),
    registryFile: join(o.binDir, 'installed.json')
  }
  const runner = new ProcessRunner(o.log)
  const registry = new InstalledRegistry(dirs.registryFile, o.log)
  const sevenZip = new SevenZipExtractor(runner, o.sevenZipPath, join(o.binDir, 'tools'))
  const installer = new SidecarInstaller({
    dirs,
    runner,
    registry,
    idleTimeoutMs: remote.downloadIdleTimeoutMs,
    log: o.log,
    extractors: {
      zip: sevenZip,
      '7z': sevenZip,
      appimage: new AppImageExtractor(runner)
    }
  })
  const manifests = new ManifestClient({
    cacheDir: o.cacheDir,
    timeoutMs: remote.manifestTimeoutMs,
    log: o.log
  })
  const manager = new SidecarManager({
    manifests,
    registry,
    installer,
    consent: o.consent,
    dirs,
    platform: o.platform ?? process.platform,
    arch: o.arch ?? process.arch,
    emitProgress: o.emitProgress,
    log: o.log
  })
  return { manager, runner, manifests }
}
