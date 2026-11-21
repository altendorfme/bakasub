import { existsSync } from 'node:fs'
import { basename, dirname, resolve } from 'node:path'
import { docIdFor, githubUrl, isPublishedDoc } from './paths'

/* Minimal mdast shapes: avoids a direct dependency on `@types/mdast` / `unified`. */
interface Node {
  type: string
  depth?: number
  url?: string
  children?: Node[]
}
interface File {
  path?: string
  history?: string[]
}

interface Options {
  /** Site base without trailing slash, e.g. `/bakasub`. */
  base: string
}

const external = /^([a-z][a-z\d+.-]*:|\/\/|#|\/)/i

/**
 * Adapts the repository docs (written for GitHub) to the site, only for files directly in `docs/`:
 * - drops the leading `# Title` (Starlight renders the title from the frontmatter);
 * - `./jobs.md#x` -> `/bakasub/docs/jobs/#x` (the user guide is `/bakasub/docs/`);
 * - any other relative link (`../src/...`, `../README.md`, a folder) -> its GitHub URL on `main`,
 *   since only `docs/*.md` is published.
 * Absolute URLs, root paths and `#anchors` are left alone. Heading ids follow github-slugger on
 * both sides, so in-page anchors keep working.
 */
export function remarkRepoDocs({ base }: Options) {
  const docsBase = `${base.replace(/\/+$/, '')}/`
  const pageUrl = (fileName: string) => `${docsBase}${docIdFor(fileName)}/`

  const rewrite = (url: string, fromDir: string): string => {
    if (external.test(url)) return url
    const [path = '', hash] = url.split('#', 2)
    const target = resolve(fromDir, decodeURIComponent(path))
    const suffix = hash === undefined ? '' : `#${hash}`
    if (isPublishedDoc(target) && existsSync(target)) return pageUrl(basename(target)) + suffix
    return githubUrl(target) + suffix
  }

  return (tree: Node, file: File) => {
    const filePath = file.path ?? file.history?.[0]
    if (!filePath || !isPublishedDoc(filePath)) return
    const fromDir = dirname(filePath)

    const first = tree.children?.findIndex((node) => node.type !== 'yaml' && node.type !== 'toml')
    if (first !== undefined && first >= 0 && tree.children?.[first]?.type === 'heading' && tree.children[first].depth === 1) {
      tree.children.splice(first, 1)
    }

    const visit = (node: Node) => {
      if ((node.type === 'link' || node.type === 'definition') && node.url) node.url = rewrite(node.url, fromDir)
      node.children?.forEach(visit)
    }
    visit(tree)
  }
}

