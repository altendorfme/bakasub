import type { LineBreakNode, Node, TagKind, TagNode, TextNode } from './types'

/** `raw` só para formatos que escapam texto (VTT): marca o nó como original, mesmo se igual. */
export const text = (value: string, raw?: string): TextNode =>
  raw === undefined ? { type: 'text', value } : { type: 'text', value, raw }
export const br = (raw = '\n'): LineBreakNode => ({ type: 'br', raw })
export const tag = (raw: string, name: string, kind: TagKind): TagNode => ({
  type: 'tag',
  raw,
  name,
  kind
})

/** Texto cru que o nó ocupa no arquivo. */
export function nodeRaw(node: Node): string {
  return node.type === 'text' ? (node.raw ?? node.value) : node.raw
}

/** `escapeText` só se aplica a TextNodes sem `raw` (criados pela tradução ou pelo reparo). */
export function nodesRaw(nodes: readonly Node[], escapeText?: (value: string) => string): string {
  let out = ''
  for (const n of nodes)
    out += n.type === 'text' && n.raw === undefined && escapeText ? escapeText(n.value) : nodeRaw(n)
  return out
}
