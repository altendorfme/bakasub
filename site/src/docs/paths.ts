import { readdirSync } from 'node:fs'
import { basename, dirname, relative, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

/*
 * Where the repository docs live and how they map to site URLs. Plain Node: imported by the Astro
 * config, the content loader and the remark plugin, never by client code.
 */

/** Absolute path of the repository `docs/` folder, read in place (no copy under `site/`). */
export const docsDir = fileURLToPath(new URL('../../../docs/', import.meta.url))

/** Absolute path of the repository root, to turn links that leave `docs/` into GitHub URLs. */
export const repoRoot = resolve(docsDir, '..')

export const repoUrl = 'https://github.com/lsilvatti/bakasub'
export const repoBranch = 'main'

/** URL prefix of the docs, under the site base: `/bakasub/docs/`. */
export const docsRoute = 'docs'

/** The page served at `/docs/` itself. */
export const docsIndexFile = 'user-guide.md'

/** Markdown files published by the site: every top-level `docs/*.md`, sorted. */
export function listDocFiles(): string[] {
  return readdirSync(docsDir)
    .filter((name) => name.endsWith('.md'))
    .sort()
}

/** Starlight entry id (= URL slug) of a `docs/` file name: `jobs.md` -> `docs/jobs`, index -> `docs`. */
export function docIdFor(fileName: string): string {
  return fileName === docsIndexFile ? docsRoute : `${docsRoute}/${basename(fileName, '.md')}`
}

/** True when `absPath` is a file directly inside `docs/` (subfolders are not published). */
export function isPublishedDoc(absPath: string): boolean {
  return dirname(resolve(absPath)) === resolve(docsDir) && absPath.endsWith('.md')
}

/** GitHub URL of a repository path (`blob` also redirects to `tree` for folders). */
export function githubUrl(absPath: string, kind: 'blob' | 'edit' = 'blob'): string {
  const path = relative(repoRoot, absPath).split(sep).join('/')
  return `${repoUrl}/${kind}/${repoBranch}/${path}`
}
