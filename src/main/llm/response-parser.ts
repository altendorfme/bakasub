import { z } from 'zod'

/**
 * Primeiro objeto JSON balanceado no texto (tolera cercas ```json e prosa em volta). Respeita
 * strings e escapes ao contar chaves. `null` quando não há objeto parseável.
 */
export function extractJsonObject(text: string): Record<string, unknown> | null {
  const direct = tryObject(text.trim())
  if (direct) return direct
  for (let start = text.indexOf('{'); start !== -1; start = text.indexOf('{', start + 1)) {
    const end = balancedEnd(text, start)
    if (end === -1) return null
    const obj = tryObject(text.slice(start, end + 1))
    if (obj) return obj
  }
  return null
}

function tryObject(s: string): Record<string, unknown> | null {
  try {
    const v: unknown = JSON.parse(s)
    return v !== null && typeof v === 'object' && !Array.isArray(v)
      ? (v as Record<string, unknown>)
      : null
  } catch {
    return null
  }
}

function balancedEnd(s: string, start: number): number {
  let depth = 0
  let inString = false
  for (let i = start; i < s.length; i++) {
    const c = s[i]
    if (inString) {
      if (c === '\\') i++
      else if (c === '"') inString = false
    } else if (c === '"') inString = true
    else if (c === '{') depth++
    else if (c === '}' && --depth === 0) return i
  }
  return -1
}

const Translations = z.record(z.string(), z.unknown())

export type ParsedTranslations =
  | {
      ok: true
      /** Só entradas string dos ids esperados. */
      values: Map<number, string>
      /** Ids esperados ausentes ou com valor não-string. */
      missing: number[]
      /** Chaves que não foram pedidas (ignoradas; vão para o log). */
      extra: string[]
      /**
       * O objeto não fechava (resposta cortada): `values` são só os pares `"id": "texto"` completos
       * antes do corte. O valor em andamento é descartado.
       */
      truncated: boolean
    }
  | {
      ok: false
      /** Por que nada foi aproveitado (vai para o log, sem conteúdo da legenda). */
      problem: ParseProblem
    }

export type ParseProblem =
  | 'empty content'
  | 'no JSON object'
  | 'top-level JSON array (expected an object)'
  | 'malformed or truncated JSON with no complete entry'

/**
 * Camada 1 da validação (forma). A camada 2 é `validateTranslation` por entrada.
 *
 * Aceita: o objeto `{ "<id>": "<texto>" }` (cercas e prosa em volta toleradas) e, quando ele está
 * cortado (`finish_reason: length`, ex.: `{"96": "E`), os pares completos antes do corte. Não
 * aceita outros formatos (array, objeto embrulhado em outra chave): o array falha com o problema
 * descrito; o objeto embrulhado passa pela forma, mas os ids esperados viram `missing`.
 */
export function parseTranslations(
  content: string,
  expected: readonly number[]
): ParsedTranslations {
  const body = stripFence(content).trim()
  if (body === '') return { ok: false, problem: 'empty content' }
  if (body.startsWith('['))
    return { ok: false, problem: 'top-level JSON array (expected an object)' }

  let data: Record<string, unknown>
  let truncated = false
  const obj = extractJsonObject(content)
  const parsed = obj ? Translations.safeParse(obj) : null
  if (parsed?.success) data = parsed.data
  else {
    const salvaged = salvageEntries(content)
    if (!salvaged)
      return {
        ok: false,
        problem: content.includes('{')
          ? 'malformed or truncated JSON with no complete entry'
          : 'no JSON object'
      }
    data = salvaged
    truncated = true
  }

  const wanted = new Set(expected.map(String))
  const values = new Map<number, string>()
  const missing: number[] = []
  for (const id of expected) {
    const v = data[String(id)]
    if (typeof v === 'string') values.set(id, v)
    else missing.push(id)
  }
  const extra = Object.keys(data).filter((k) => !wanted.has(k))
  return { ok: true, values, missing, extra, truncated }
}

function stripFence(s: string): string {
  const m = /^\s*```[a-zA-Z]*\s*\n?([\s\S]*?)(?:```\s*)?$/.exec(s)
  return m ? m[1] : s
}

/**
 * Pares `"chave": "texto"` completos de um objeto que não fecha, a partir do primeiro `{` que
 * renda ao menos um. Para no primeiro par incompleto ou com valor que não é string. `null`
 * quando nenhum `{` rende um par.
 */
function salvageEntries(text: string): Record<string, string> | null {
  for (let start = text.indexOf('{'); start !== -1; start = text.indexOf('{', start + 1)) {
    const out: Record<string, string> = {}
    let n = 0
    let i = start + 1
    for (;;) {
      i = skip(text, i, /[\s,]/)
      const key = readString(text, i)
      if (!key) break
      i = skip(text, key.end, /\s/)
      if (text[i] !== ':') break
      i = skip(text, i + 1, /\s/)
      const value = readString(text, i)
      if (!value) break
      out[key.value] = value.value
      n++
      i = value.end
    }
    if (n > 0) return out
  }
  return null
}

function skip(s: string, i: number, re: RegExp): number {
  while (i < s.length && re.test(s[i])) i++
  return i
}

/** String JSON fechada começando em `i`; `null` se não começa com `"`, não fecha ou tem escape inválido. */
function readString(s: string, i: number): { value: string; end: number } | null {
  if (s[i] !== '"') return null
  for (let j = i + 1; j < s.length; j++) {
    if (s[j] === '\\') j++
    else if (s[j] === '"') {
      try {
        return { value: JSON.parse(s.slice(i, j + 1)) as string, end: j + 1 }
      } catch {
        return null
      }
    }
  }
  return null
}
