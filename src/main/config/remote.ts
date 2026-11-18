const BASE = 'https://raw.githubusercontent.com/lsilvatti/bakasub-manifests/refs/heads/main'

export const remote = {
  versionManifestUrl: `${BASE}/version.json`,
  sidecarManifestUrl: `${BASE}/sidecar.json`,
  manifestTimeoutMs: 10_000,
  /** Download aborta se nenhum byte chegar neste intervalo. */
  downloadIdleTimeoutMs: 30_000
} as const
