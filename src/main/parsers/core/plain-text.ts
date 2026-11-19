import type { Cue } from './types'

/** `\h` do ASS: espaço rígido. Tratado como espaço comum em texto corrido e em hashes. */
const HARD_SPACE = /\\h/g
const WHITESPACE_RUN = /\s+/gu

/**
 * Texto corrido do cue: nós de texto concatenados, tags removidas, quebras de linha e `\h` como
 * espaço. Base para detecção de letras (coverage), contagem de palavras e o contexto do Job Memory.
 */
export function cuePlainText(cue: Pick<Cue, 'nodes'>): string {
  let out = ''
  for (const node of cue.nodes) {
    if (node.type === 'text') out += node.value.replace(HARD_SPACE, ' ')
    else if (node.type === 'br') out += ' '
  }
  return out
}

/**
 * Forma canônica para hashing (Job Memory): NFC, `\h` -> espaço, espaços colapsados, trim.
 * A caixa e a pontuação são preservadas ("OK." e "ok." podem pedir traduções diferentes).
 * Idempotente. Mudar estas regras exige subir a versão do hash (`v1`).
 */
export function normalizeForHash(s: string): string {
  return s.normalize('NFC').replace(HARD_SPACE, ' ').replace(WHITESPACE_RUN, ' ').trim()
}
