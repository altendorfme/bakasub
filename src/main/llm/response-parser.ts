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
    }
  | { ok: false }

/** Camada 1 da validação (forma). A camada 2 é `validateTranslation` por entrada. */
export function parseTranslations(
  content: string,
  expected: readonly number[]
): ParsedTranslations {
  const obj = extractJsonObject(content)
  const parsed = obj ? Translations.safeParse(obj) : null
  if (!parsed?.success) return { ok: false }
  const wanted = new Set(expected.map(String))
  const values = new Map<number, string>()
  const missing: number[] = []
  for (const id of expected) {
    const v = parsed.data[String(id)]
    if (typeof v === 'string') values.set(id, v)
    else missing.push(id)
  }
  const extra = Object.keys(parsed.data).filter((k) => !wanted.has(k))
  return { ok: true, values, missing, extra }
}
