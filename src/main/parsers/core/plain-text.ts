import type { Cue } from './types'

/**
 * Texto corrido do cue: nós de texto concatenados, tags removidas e quebras de linha como espaço.
 * Base para detecção de letras (coverage) e, no futuro, para o context hash do Job Memory.
 */
export function cuePlainText(cue: Pick<Cue, 'nodes'>): string {
  let out = ''
  for (const node of cue.nodes) {
    if (node.type === 'text') out += node.value
    else if (node.type === 'br') out += ' '
  }
  return out
}
