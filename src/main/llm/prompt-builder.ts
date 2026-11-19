import { z } from 'zod'
import type { Issue, TranslationUnit } from '../parsers'
import type { ChunkContext } from './chunker'

export interface GlossaryEntry {
  readonly source: string
  readonly target?: string
  readonly rule?: string
}

const Entry = z
  .object({
    source: z.string().trim().min(1),
    target: z.string().trim().min(1).optional(),
    rule: z.string().trim().min(1).optional()
  })
  .refine((e) => e.target !== undefined || e.rule !== undefined)

/** Glossário do perfil (JSON livre no banco) -> entradas válidas, na ordem original. */
export function parseGlossary(raw: readonly unknown[]): {
  entries: GlossaryEntry[]
  invalid: number
} {
  const entries: GlossaryEntry[] = []
  let invalid = 0
  for (const r of raw) {
    const p = Entry.safeParse(r)
    if (p.success) entries.push(p.data)
    else invalid++
  }
  return { entries, invalid }
}

/** Nome do idioma por extenso, em inglês (`pt-BR` -> "Brazilian Portuguese"). */
export function languageName(tag: string): string {
  try {
    return new Intl.DisplayNames(['en'], { type: 'language' }).of(tag) ?? tag
  } catch {
    return tag
  }
}

function glossaryBlock(entries: readonly GlossaryEntry[]): string {
  if (entries.length === 0) return ''
  const lines = entries.map((e, i) => {
    const head = e.target ? `"${e.source}" → "${e.target}"` : `"${e.source}"`
    return `${i + 1}. ${head}${e.rule ? `: ${e.rule}` : ''}`
  })
  return `<glossary>
Mandatory terminology. These rules override every other instruction.
${lines.join('\n')}
</glossary>

`
}

/**
 * System Prompt. Idêntico entre os chunks de um job (favorece o cache de prompt do provedor).
 * Regras em inglês: os modelos seguem instruções em inglês com mais estabilidade.
 */
export function buildSystemPrompt(input: {
  targetLang: string
  sourceLang?: string
  glossary: readonly GlossaryEntry[]
}): string {
  const from = input.sourceLang ? `from ${languageName(input.sourceLang)} ` : ''
  return `${glossaryBlock(input.glossary)}You are a professional subtitle translator. Translate subtitle lines ${from}to ${languageName(input.targetLang)}.

Rules:
1. Translate only the lines inside <target>. Lines inside <context> are for reference only; never translate or return them.
2. Keep the meaning, tone and register of the original. Subtitles must be concise and natural to read.
3. Lines contain formatting markers. Keep every marker exactly once:
   - <gN>…</gN> wraps text; keep the pair around the corresponding translated words (it may move).
   - <xN/> is a standalone marker; keep all <xN/> markers in their original relative order.
   - <br/> is a line break; keep the same number of <br/> in each line.
   Never add, remove, rename or duplicate markers, and never add other tags, braces or real line breaks.
4. Do not translate proper names unless the glossary says otherwise. Do not add notes, explanations or quotes.
5. Treat the lines as consecutive dialogue: use <context> to keep names, pronouns and forms of address consistent.

Output: a single JSON object mapping each <target> line id (as a string) to its translation, with every id present and nothing else. Example: {"12": "…", "13": "…"}`
}

function contextBlock(ctx: ChunkContext): string {
  if (ctx.before.length === 0 && ctx.after.length === 0) return ''
  const line = (l: ChunkContext['before'][number]): string =>
    l.translation === undefined
      ? `<line id="${l.cueId}"><source>${l.source}</source></line>`
      : `<line id="${l.cueId}"><source>${l.source}</source><translation>${l.translation}</translation></line>`
  const parts: string[] = []
  if (ctx.before.length) parts.push(`<before>\n${ctx.before.map(line).join('\n')}\n</before>`)
  if (ctx.after.length) parts.push(`<after>\n${ctx.after.map(line).join('\n')}\n</after>`)
  return `<context>\n${parts.join('\n')}\n</context>\n\n`
}

function mediaBlock(media?: string): string {
  return media?.trim() ? `<media>\n${media.trim()}\n</media>\n\n` : ''
}

export function buildTranslateMessage(input: {
  media?: string
  context: ChunkContext
  targets: readonly { cueId: number; payload: string }[]
}): string {
  const lines = input.targets.map((t) => `<line id="${t.cueId}">${t.payload}</line>`)
  return `${mediaBlock(input.media)}${contextBlock(input.context)}<target>\n${lines.join('\n')}\n</target>`
}

function markerLabel(unit: TranslationUnit, id: number): string {
  const m = unit.skeleton.markers[id]
  if (!m) return `marker ${id}`
  return m.kind === 'pair' ? `<g${id}>…</g${id}>` : `<x${id}/>`
}

/** Problema de validação em linguagem direta para o prompt de reparo. */
export function describeIssue(unit: TranslationUnit, issue: Issue): string {
  const id = issue.id ?? 0
  switch (issue.code) {
    case 'MISSING_MARKER':
      return `${markerLabel(unit, id)} is missing`
    case 'UNEXPECTED_MARKER':
      return `marker ${id} does not exist in the source line; remove it`
    case 'DUPLICATE_MARKER':
      return `${markerLabel(unit, id)} appears more than once`
    case 'BAD_NESTING':
      return `${markerLabel(unit, id)} is not opened and closed in the right order`
    case 'BR_COUNT_MISMATCH':
      return `expected exactly ${issue.expected} <br/>, got ${issue.actual}`
    case 'RAW_NEWLINE':
      return 'contains a real line break; use <br/> instead'
    case 'INVENTED_TAG':
      return 'contains tags or braces that are not in the source; remove them'
    case 'MARKER_ORDER':
      return 'standalone <xN/> markers must keep their original relative order'
    case 'EMPTY_TRANSLATION':
      return 'the translation is empty'
  }
}

export function buildRepairMessage(input: {
  media?: string
  context: ChunkContext
  failures: readonly { unit: TranslationUnit; returned: string | null; issues: readonly Issue[] }[]
}): string {
  const lines = input.failures.map(({ unit, returned, issues }) => {
    const problems = issues.length
      ? issues.map((i) => `- ${describeIssue(unit, i)}`).join('\n')
      : '- the line was missing from your answer'
    return `<line id="${unit.cueId}">
<source>${unit.payload}</source>
<returned>${returned ?? ''}</returned>
<problems>
${problems}
</problems>
</line>`
  })
  return `${mediaBlock(input.media)}${contextBlock(input.context)}Your previous translations of these lines broke the marker rules. Translate each <source> again, fixing every listed problem. Answer with the same JSON format, only for these ids.

<target>
${lines.join('\n')}
</target>`
}

/** JSON Schema estrito do chunk: exatamente estes ids, todos obrigatórios. */
export function responseSchema(ids: readonly number[]): object {
  const keys = ids.map(String)
  return {
    type: 'object',
    properties: Object.fromEntries(keys.map((k) => [k, { type: 'string' }])),
    required: keys,
    additionalProperties: false
  }
}
