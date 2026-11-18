import { app } from 'electron'
import { remote } from '../config/remote'
import { compareVersions } from '../../shared/version'
import type { AppUpdateInfo } from '../../shared/ipc-contract'
import type { ManifestClient } from '../sidecars/manifest-client'
import { versionManifestSchema } from '../sidecars/manifest.schema'

/** Apenas informa; não baixa nem instala nada. */
export class AppUpdateService {
  constructor(private readonly manifests: ManifestClient) {}

  async check(): Promise<AppUpdateInfo> {
    const { data, offline } = await this.manifests.load(
      'version',
      remote.versionManifestUrl,
      versionManifestSchema
    )
    const current = app.getVersion()
    return {
      current,
      latest: data.version,
      updateAvailable: compareVersions(current, data.version) < 0,
      publishedAt: data.updatedAt,
      offline
    }
  }
}
