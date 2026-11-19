const PATTERNS: readonly [RegExp, string][] = [
  [/sk-or-[\w-]{8,}/g, 'sk-or-***'],
  [/(Bearer\s+)[\w.~+/-]+=*/gi, '$1***'],
  [/eyJ[\w-]{4,}\.[\w-]{4,}\.[\w-]{4,}/g, 'eyJ***'],
  [/([?&](?:api_key|apikey|key|token)=)[^&\s#]+/gi, '$1***']
]

/** Shorter values would mask ordinary words. */
const MIN_SECRET_LENGTH = 8

const escape = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/**
 * Masks secrets before anything reaches a log transport, the renderer or an export. Known
 * shapes are matched by pattern; secrets the app holds (vault values) are registered and
 * matched verbatim.
 */
export class Redactor {
  private readonly secrets = new Set<string>()

  add(secret: string | null | undefined): void {
    if (secret && secret.length >= MIN_SECRET_LENGTH) this.secrets.add(secret)
  }

  text(s: string): string {
    let out = s
    for (const secret of this.secrets) out = out.replace(new RegExp(escape(secret), 'g'), '***')
    for (const [re, sub] of PATTERNS) out = out.replace(re, sub)
    return out
  }

  /** Deep copy with every string redacted. Errors stay Errors (message and stack redacted). */
  value(v: unknown, seen = new WeakSet<object>()): unknown {
    if (typeof v === 'string') return this.text(v)
    if (v === null || typeof v !== 'object') return v
    if (seen.has(v)) return '[Circular]'
    seen.add(v)
    if (v instanceof Error) {
      const copy = new Error(this.text(v.message))
      copy.name = v.name
      copy.stack = v.stack ? this.text(v.stack) : undefined
      const code = (v as { code?: unknown }).code
      if (code !== undefined) Object.assign(copy, { code })
      return copy
    }
    if (Array.isArray(v)) return v.map((x) => this.value(x, seen))
    return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, this.value(x, seen)]))
  }
}
