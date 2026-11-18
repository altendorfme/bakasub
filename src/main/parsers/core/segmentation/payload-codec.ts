import type { LineBreakNode, Node, TagNode } from '../types'

/**
 * Codec nós <-> payload, no estilo XLIFF:
 *   <gN>…</gN>  tag de abrir/fechar bem aninhada (preserva o escopo se as palavras mudarem de ordem)
 *   <xN/>       tag solta (override ASS, tag sem par)
 *   <br/>       quebra de linha (n-ésima ocorrência <-> n-ésima quebra original)
 * Tags nas bordas do cue (que só envolvem o conteúdo) não vão no payload: ficam no esqueleto.
 * Não há escape: texto que já pareça um marcador é detectado e o cue segue sem tradução.
 */

export type Marker =
  | { readonly kind: 'pair'; readonly open: TagNode; readonly close: TagNode }
  | { readonly kind: 'single'; readonly node: TagNode }

export interface Skeleton {
  /** Tags reaplicadas antes do conteúdo traduzido, intactas. */
  readonly head: readonly Node[]
  /** Tags reaplicadas depois do conteúdo traduzido, intactas. */
  readonly tail: readonly Node[]
  readonly markers: Readonly<Record<number, Marker>>
  /** Quebras de linha originais, na ordem em que aparecem no payload. */
  readonly brs: readonly LineBreakNode[]
}

export interface BuiltPayload {
  payload: string
  skeleton: Skeleton
}

/** Qualquer ocorrência disto num TextNode impede a segmentação segura do cue. */
export const MARKER_PATTERN = /<\/?g[1-9]\d*>|<x[1-9]\d*\/>|<br\/>/

export function findMarkerCollision(nodes: readonly Node[]): string | null {
  for (const n of nodes) {
    if (n.type !== 'text') continue
    const m = MARKER_PATTERN.exec(n.value)
    if (m) return m[0]
  }
  return null
}

/** open<->close pelo nome, com disciplina de pilha; tags sem par ficam de fora. */
function pairTags(nodes: readonly Node[]): Map<number, number> {
  const partner = new Map<number, number>()
  const stack: number[] = []
  nodes.forEach((n, i) => {
    if (n.type !== 'tag' || n.kind === 'override') return
    if (n.kind === 'open') {
      stack.push(i)
      return
    }
    const top = stack[stack.length - 1]
    if (top !== undefined && (nodes[top] as TagNode).name === n.name) {
      stack.pop()
      partner.set(top, i)
      partner.set(i, top)
    }
  })
  return partner
}

/** Quantas tags de cada borda podem sair do payload sem separar um par. */
function edgeCounts(nodes: readonly Node[], partner: Map<number, number>): [number, number] {
  const n = nodes.length
  let h = 0
  while (h < n && nodes[h].type === 'tag') h++
  let t = 0
  while (t < n - h && nodes[n - 1 - t].type === 'tag') t++

  const inEdge = (j: number): boolean => j < h || j >= n - t
  for (;;) {
    let changed = false
    for (let i = 0; i < h; i++) {
      const p = partner.get(i)
      if (p !== undefined && !inEdge(p)) {
        h = i
        changed = true
        break
      }
    }
    for (let i = n - t; i < n; i++) {
      const p = partner.get(i)
      if (p !== undefined && !inEdge(p)) {
        // A cauda é um sufixo contíguo: sem este tag, só pode conter os índices > i.
        t = n - i - 1
        changed = true
        break
      }
    }
    if (!changed) return [h, t]
  }
}

export function buildPayload(nodes: readonly Node[]): BuiltPayload {
  const partner = pairTags(nodes)
  const [h, t] = edgeCounts(nodes, partner)
  const end = nodes.length - t

  const markers: Record<number, Marker> = {}
  const pairId = new Map<number, number>()
  const brs: LineBreakNode[] = []
  let next = 1
  let payload = ''

  for (let i = h; i < end; i++) {
    const node = nodes[i]
    if (node.type === 'text') {
      payload += node.value
    } else if (node.type === 'br') {
      brs.push(node)
      payload += '<br/>'
    } else {
      const p = partner.get(i)
      if (p !== undefined && p >= h && p < end) {
        if (node.kind === 'open') {
          const id = next++
          pairId.set(i, id)
          pairId.set(p, id)
          markers[id] = { kind: 'pair', open: node, close: nodes[p] as TagNode }
          payload += `<g${id}>`
        } else {
          payload += `</g${pairId.get(i)}>`
        }
      } else {
        const id = next++
        markers[id] = { kind: 'single', node }
        payload += `<x${id}/>`
      }
    }
  }

  return {
    payload,
    skeleton: { head: nodes.slice(0, h), tail: nodes.slice(end), markers, brs }
  }
}

export type Token =
  | { readonly t: 'text'; readonly value: string }
  | { readonly t: 'open'; readonly id: number }
  | { readonly t: 'close'; readonly id: number }
  | { readonly t: 'x'; readonly id: number }
  | { readonly t: 'br' }

const TOKEN = /<g([1-9]\d*)>|<\/g([1-9]\d*)>|<x([1-9]\d*)\/>|<br\/>/g

/** Qualquer coisa fora da gramática exata dos marcadores é texto (inclusive `<G1>` ou `< g1>`). */
export function tokenizePayload(input: string): Token[] {
  const tokens: Token[] = []
  let last = 0
  for (const m of input.matchAll(TOKEN)) {
    if (m.index > last) tokens.push({ t: 'text', value: input.slice(last, m.index) })
    if (m[1]) tokens.push({ t: 'open', id: Number(m[1]) })
    else if (m[2]) tokens.push({ t: 'close', id: Number(m[2]) })
    else if (m[3]) tokens.push({ t: 'x', id: Number(m[3]) })
    else tokens.push({ t: 'br' })
    last = m.index + m[0].length
  }
  if (last < input.length) tokens.push({ t: 'text', value: input.slice(last) })
  return tokens
}
