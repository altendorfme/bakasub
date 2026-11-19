import { Tiktoken } from 'js-tiktoken/lite'
import o200k_base from 'js-tiktoken/ranks/o200k_base'

/** Carregado sob demanda: o vocabulário pesa alguns MB e só o preflight usa. */
let encoder: Tiktoken | null = null
const enc = (): Tiktoken => (encoder ??= new Tiktoken(o200k_base))

/** Tokens `o200k_base` (tokenizer dos modelos OpenAI atuais; aproximação para os demais). */
export function countTokens(text: string): number {
  return text ? enc().encode(text).length : 0
}

/** Overhead do formato de chat: ~4 por mensagem + 3 para iniciar a resposta (convenção OpenAI). */
const PER_MESSAGE = 4
const REPLY_PRIMING = 3

export function countMessageTokens(messages: readonly { role: string; content: string }[]): number {
  return messages.reduce((n, m) => n + countTokens(m.content) + PER_MESSAGE, 0) + REPLY_PRIMING
}

/** `architecture.tokenizer` do `/models`: só a família GPT usa o mesmo vocabulário. */
export function isExactTokenizer(family: string | undefined): boolean {
  return family === 'GPT'
}
