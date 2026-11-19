import { createHash } from 'node:crypto'

/** BCP-47 canônico (`pt-br` -> `pt-BR`). Variantes regionais são chaves distintas. Lança `RangeError`. */
export function canonicalLang(tag: string): string {
  const [canonical] = Intl.getCanonicalLocales(tag)
  if (!canonical) throw new RangeError(`Invalid language tag: ${tag}`)
  return canonical
}

/** JSON com chaves de objeto ordenadas; arrays mantêm a ordem (é a ordem no prompt). */
function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`
  if (value !== null && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${canonicalJson(v)}`).join(',')}}`
  }
  return JSON.stringify(value)
}

/**
 * O que, no prompt, muda a tradução e entra na chave do cache: glossário + orientação de estilo
 * do preset. sha256 do JSON canônico, ou '' quando ambos são vazios. Presets com o mesmo
 * glossário e estilo compartilham cache; temperatura e contexto de mídia (por episódio) não entram.
 */
export function promptHash(glossary: readonly unknown[], stylePrompt = ''): string {
  const style = stylePrompt.trim()
  if (glossary.length === 0 && style === '') return ''
  return createHash('sha256').update(canonicalJson({ glossary, style }), 'utf8').digest('hex')
}
