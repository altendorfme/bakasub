import { links } from '../i18n/links'

/**
 * Build-time lookup of the latest published release, used by the download buttons.
 *
 * Asset names follow `artifactName` in `electron-builder.yml`:
 * - Windows (nsis):   `${name}-${version}-setup.exe`
 * - Linux (AppImage): `${name}-${version}.AppImage`
 * They are matched by extension, so a rename of the app or a version bump needs no change here; a change of
 * the artifact extension does.
 *
 * Any failure (API down, rate limit, no release yet, no matching asset) resolves to `fallback`, so the build
 * never breaks: the buttons then point to the Releases page.
 */

const API_URL = 'https://api.github.com/repos/lsilvatti/bakasub/releases/latest'
const TIMEOUT_MS = 10_000

export interface ReleaseInfo {
  /** Bare version, without the `v` prefix. `null` when the lookup failed. */
  version: string | null
  /** Direct download URL, or the Releases page when the asset is unknown. */
  windows: string
  linux: string
  /** `true` when the buttons point to real assets of `version`. */
  resolved: boolean
}

interface GitHubAsset {
  name: string
  browser_download_url: string
}
interface GitHubRelease {
  tag_name: string
  draft: boolean
  prerelease: boolean
  assets: GitHubAsset[]
}

const fallback: ReleaseInfo = { version: null, windows: links.releases, linux: links.releases, resolved: false }

async function fetchLatest(): Promise<ReleaseInfo> {
  try {
    const headers: Record<string, string> = {
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'User-Agent': 'bakasub-site-build'
    }
    // Optional: raises the rate limit in CI. Never logged.
    const token = process.env.GITHUB_TOKEN
    if (token) headers.Authorization = `Bearer ${token}`

    const res = await fetch(API_URL, { headers, signal: AbortSignal.timeout(TIMEOUT_MS) })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const release = (await res.json()) as GitHubRelease
    // `/releases/latest` already skips drafts and prereleases; checked again in case that ever changes.
    if (release.draft || release.prerelease) throw new Error('latest release is a draft or prerelease')

    const windows = release.assets.find((a) => /-setup\.exe$/i.test(a.name))
    const linux = release.assets.find((a) => /\.AppImage$/i.test(a.name))
    if (!windows || !linux) throw new Error('release has no Windows or Linux asset')

    return {
      version: release.tag_name.replace(/^v/, ''),
      windows: windows.browser_download_url,
      linux: linux.browser_download_url,
      resolved: true
    }
  } catch (error) {
    console.warn(`[release] could not resolve the latest release, linking to /releases: ${String(error)}`)
    return fallback
  }
}

let cached: Promise<ReleaseInfo> | undefined

/** One request per build, shared by every page and locale. */
export function getLatestRelease(): Promise<ReleaseInfo> {
  cached ??= fetchLatest()
  return cached
}
