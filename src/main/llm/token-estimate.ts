/** Han, Hiragana, Katakana, Hangul e pontuação CJK: ~1 token por caractere. */
const CJK =
  /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}\u3000-\u303f\uff00-\uffef]/gu

/**
 * Estimativa grosseira para LIMITAR chunks e `max_tokens` (não para cobrar: o preflight usa um
 * tokenizer real). ~4 caracteres por token em escritas alfabéticas, ~1 por caractere em CJK.
 */
export function estimateTokens(text: string): number {
  const cjk = text.match(CJK)?.length ?? 0
  const rest = [...text].length - cjk
  return cjk + Math.ceil(rest / 4)
}
