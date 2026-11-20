import { createElement, type ReactNode } from 'react'

/**
 * Release notes come from GitHub as HTML and are untrusted. Instead of injecting that HTML, it is
 * parsed into an inert document (DOMParser runs no script and loads nothing) and rebuilt as React
 * elements from an allowlist of tags with no attributes. Links become plain text (the release page
 * is reachable from the update flow); everything unknown is flattened to its text.
 */
const BLOCK = new Set([
  'p',
  'ul',
  'ol',
  'li',
  'blockquote',
  'pre',
  'h1',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6'
])
const INLINE = new Set(['strong', 'em', 'b', 'i', 'code', 'br', 'del'])
const HEADINGS = new Set(['h1', 'h2', 'h3', 'h4', 'h5', 'h6'])
const DROP = new Set([
  'script',
  'style',
  'iframe',
  'object',
  'embed',
  'img',
  'svg',
  'form',
  'input'
])

function convert(node: Node, key: string): ReactNode {
  if (node.nodeType === Node.TEXT_NODE) return node.textContent
  if (node.nodeType !== Node.ELEMENT_NODE) return null
  const tag = (node as Element).localName
  if (DROP.has(tag)) return null
  const children = Array.from(node.childNodes).map((c, i) => convert(c, `${key}.${i}`))
  if (tag === 'br') return createElement('br', { key })
  if (BLOCK.has(tag) || INLINE.has(tag)) {
    // Headings are all rendered at one modest size inside the card.
    return createElement(HEADINGS.has(tag) ? 'h4' : tag, { key }, ...children)
  }
  return children.length ? createElement('span', { key }, ...children) : null
}

function sanitizeNotes(html: string): ReactNode[] {
  const doc = new DOMParser().parseFromString(html, 'text/html')
  return Array.from(doc.body.childNodes).map((n, i) => convert(n, String(i)))
}

export function ReleaseNotes({ html }: { html: string }): React.JSX.Element {
  return (
    <div
      data-testid="release-notes"
      className="grid gap-2 text-xs text-muted-foreground [&_code]:rounded [&_code]:bg-muted [&_code]:px-1 [&_h4]:font-semibold [&_h4]:text-foreground [&_li]:ml-4 [&_ol]:list-decimal [&_pre]:overflow-x-auto [&_pre]:rounded [&_pre]:bg-muted [&_pre]:p-2 [&_ul]:list-disc"
    >
      {sanitizeNotes(html)}
    </div>
  )
}
