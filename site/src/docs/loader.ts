import { readFile } from 'node:fs/promises'
import { basename } from 'node:path'
import { glob } from 'astro/loaders'
import type { Loader } from 'astro/loaders'
import { docIdFor, docsDir, githubUrl } from './paths'

/** First `# Heading` of the file: the page title (the docs carry no frontmatter). */
export function extractTitle(markdown: string): string | undefined {
  return /^#[ \t]+(.+?)[ \t#]*$/m.exec(markdown)?.[1]?.trim()
}

/**
 * First paragraph after the title, as plain text: the page `<meta name="description">`.
 * Skips headings, code fences, lists and tables; inline markup is reduced to its text.
 */
export function extractDescription(markdown: string, maxLength = 200): string | undefined {
  const blocks = markdown.split(/\n\s*\n/).map((block) => block.trim())
  const paragraph = blocks.find((block) => block !== '' && !/^(#|```|[-*+] |\d+\. |\||>|<)/.test(block))
  if (!paragraph) return undefined
  const text = paragraph
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/[`*_]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
  return text.length > maxLength ? `${text.slice(0, maxLength - 1).trimEnd()}…` : text
}

/**
 * Starlight `docs` collection fed straight from the repository `docs/*.md` files: the Astro glob
 * loader, with ids mapped to `/docs/<name>/` and the frontmatter Starlight requires (`title`) derived
 * from the file itself. Existing frontmatter wins, so a doc can still override any of it.
 * The leading `# Heading` is dropped from the rendered body by `remark-repo-docs.ts`.
 */
export function repoDocsLoader(): Loader {
  const inner = glob({
    base: docsDir,
    pattern: '*.md',
    generateId: ({ entry }) => docIdFor(entry)
  })
  return {
    name: 'bakasub-repo-docs',
    load: (context) =>
      inner.load({
        ...context,
        // Generic in TData upstream; the glob loader only passes frontmatter objects, hence the cast.
        parseData: async <TData extends Record<string, unknown>>(props: Parameters<typeof context.parseData<TData>>[0]) => {
          const filePath = props.filePath
          const markdown = filePath ? await readFile(filePath, 'utf8') : ''
          const data: Record<string, unknown> = {
            title: extractTitle(markdown) ?? (filePath ? basename(filePath, '.md') : props.id),
            description: extractDescription(markdown),
            ...(filePath ? { editUrl: githubUrl(filePath, 'edit') } : {}),
            ...props.data
          }
          return context.parseData<TData>({ ...props, data: data as TData })
        }
      })
  }
}
