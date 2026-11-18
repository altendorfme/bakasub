import type { LineBreakNode, Node, TagKind, TagNode, TextNode } from './types'

export const text = (value: string): TextNode => ({ type: 'text', value })
export const br = (raw = '\n'): LineBreakNode => ({ type: 'br', raw })
export const tag = (raw: string, name: string, kind: TagKind): TagNode => ({
  type: 'tag',
  raw,
  name,
  kind
})

/** Texto cru que o nó ocupa no arquivo. */
export function nodeRaw(node: Node): string {
  return node.type === 'text' ? node.value : node.raw
}

export function nodesRaw(nodes: readonly Node[]): string {
  let out = ''
  for (const n of nodes) out += nodeRaw(n)
  return out
}
