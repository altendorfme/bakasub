const BASE = 'https://raw.githubusercontent.com/lsilvatti/bakasub/main/manifests'

export const remote = {
  sidecarManifestUrl: `${BASE}/sidecar.json`,
  manifestTimeoutMs: 10_000,
  /** Download aborta se nenhum byte chegar neste intervalo. */
  downloadIdleTimeoutMs: 30_000
} as const
