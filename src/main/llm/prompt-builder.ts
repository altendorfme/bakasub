import { GlossaryEntrySchema } from '../presets/preset.schema'
import type { Issue, TranslationUnit } from '../parsers'
import type { ChunkContext } from './chunker'
import { hasGenderAgreement, languageNotes } from './language-notes'

/**
 * Versão do texto fixo do System Prompt (`buildSystemPrompt` + `language-notes.ts`). Entra na
 * chave da Job Memory (`promptHash`): traduções feitas com regras antigas deixam de ser hits.
 * Incrementar em todo PR que mude esse texto; `prompt-rules-version.test.ts` quebra se o texto
 * mudar sem a versão mudar.
 */
export const PROMPT_RULES_VERSION = 3

export interface GlossaryEntry {
  readonly source: string
  readonly target?: string
  readonly rule?: string
}

/** Glossário do preset (JSON livre no banco) -> entradas válidas, na ordem original. */
export function parseGlossary(raw: readonly unknown[]): {
  entries: GlossaryEntry[]
  invalid: number
} {
  const entries: GlossaryEntry[] = []
  let invalid = 0
  for (const r of raw) {
    const p = GlossaryEntrySchema.safeParse(r)
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
 * System Prompt. Idêntico entre os chunks de um job: é o prefixo que o cache de prompt do
 * provedor reaproveita (por isso o `<media>` mora aqui, não na mensagem de cada chunk).
 * Regras em inglês: os modelos seguem instruções em inglês com mais estabilidade.
 */
export function buildSystemPrompt(input: {
  targetLang: string
  sourceLang?: string
  glossary: readonly GlossaryEntry[]
  /** Orientação do preset (tipo de mídia). As regras fixas vêm depois e prevalecem. */
  stylePrompt?: string
  /** Contexto de mídia (sinopse, notas do usuário). Só referência. */
  media?: string
}): string {
  const from = input.sourceLang ? `from ${languageName(input.sourceLang)} ` : ''
  const target = languageName(input.targetLang)
  const style = input.stylePrompt?.trim()
    ? `\n\n<style>\n${input.stylePrompt.trim()}\n</style>`
    : ''
  return `${glossaryBlock(input.glossary)}You are a professional subtitle translator. Translate subtitle lines ${from}to ${target}.${style}

Rules (they always apply, even if the style guidance above says otherwise):
1. Translate only the lines inside <target>. Lines inside <context> are for reference only; never translate or return them.
2. Keep the meaning, tone and register of the original. Subtitles must be concise and natural to read.
3. Lines contain formatting markers. Keep every marker exactly once:
   - <gN>…</gN> wraps text; keep the pair around the corresponding translated words (it may move).
   - <xN/> is a standalone marker; keep all <xN/> markers in their original relative order.
   - <br/> is a line break; keep the same number of <br/> in each line.
   Never add, remove, rename or duplicate markers, and never add other tags, braces or real line breaks.
4. Do not translate proper names unless the glossary says otherwise. Do not add notes, explanations or quotes.
5. Treat the lines as consecutive dialogue: use <context> to keep names, pronouns and forms of address consistent.
   A speaker="…" attribute names the character who says the line: use it as a hint for the speaker's gender and to keep each character's voice consistent. Never translate the speaker name or put it in your output.
6. Write idiomatic ${target}, not a word-for-word rendering:
   - Idioms, slang and figures of speech become the natural ${target} equivalent with the same tone and intensity; if none exists, convey the meaning plainly. Never translate them literally.
   - Commands, orders and battle cries use the imperative mood of ${target}, never a gerund, infinitive or description of the action.
   - Follow the current official spelling of ${target}.${languageNotesBlock(input.targetLang)}${genderRule(input.targetLang, target)}

Output: a single JSON object mapping each <target> line id (as a string) to its translation, with every id present and nothing else. Example: {"12": "…", "13": "…"}${mediaSection(input.media)}`
}

/** Regra 7, só para idiomas com concordância de gênero (`language-notes.ts`). */
function genderRule(tag: string, target: string): string {
  if (!hasGenderAgreement(tag)) return ''
  return `
7. ${target} marks gender where the source often does not (e.g. "I'm tired", "You're late"). Infer the gender of the speaker and of the listener from <context>, names, pronouns and the media background, and keep it consistent for the same character. If it cannot be inferred, use a natural gender-neutral phrasing instead of guessing; never write both forms with a slash.`
}

function languageNotesBlock(tag: string): string {
  const notes = languageNotes(tag)
  return notes.length
    ? `\n   ${languageName(tag)} notes:\n${notes.map((n) => `   - ${n}`).join('\n')}`
    : ''
}

function mediaSection(media?: string): string {
  return media?.trim()
    ? `\n\nBackground about the media being translated (reference only; never translate it):\n<media>\n${media.trim()}\n</media>`
    : ''
}

/** Limite (em code points) do nome do falante no prompt. */
export const SPEAKER_MAX_CHARS = 60

/**
 * Valor do atributo `speaker`: sem controles nem quebras, cortado em `SPEAKER_MAX_CHARS` e
 * escapado para atributo XML. O nome já chega sem valores genéricos (`speakerOf`).
 */
export function speakerAttrValue(speaker: string): string {
  const clean = speaker
    .replace(/[\p{Cc}\p{Zl}\p{Zp}]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  const cut = [...clean].slice(0, SPEAKER_MAX_CHARS).join('').trimEnd()
  return cut
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

/** Abertura `<line id="N">` ou `<line id="N" speaker="…">`. */
function lineOpen(cueId: number, speaker: string | undefined): string {
  const value = speaker ? speakerAttrValue(speaker) : ''
  return value ? `<line id="${cueId}" speaker="${value}">` : `<line id="${cueId}">`
}

function contextBlock(ctx: ChunkContext): string {
  if (ctx.before.length === 0 && ctx.after.length === 0) return ''
  const line = (l: ChunkContext['before'][number]): string =>
    l.translation === undefined
      ? `${lineOpen(l.cueId, l.speaker)}<source>${l.source}</source></line>`
      : `${lineOpen(l.cueId, l.speaker)}<source>${l.source}</source><translation>${l.translation}</translation></line>`
  const parts: string[] = []
  if (ctx.before.length) parts.push(`<before>\n${ctx.before.map(line).join('\n')}\n</before>`)
  if (ctx.after.length) parts.push(`<after>\n${ctx.after.map(line).join('\n')}\n</after>`)
  return `<context>\n${parts.join('\n')}\n</context>\n\n`
}

export function buildTranslateMessage(input: {
  context: ChunkContext
  targets: readonly { cueId: number; payload: string; speaker?: string }[]
}): string {
  const lines = input.targets.map((t) => `${lineOpen(t.cueId, t.speaker)}${t.payload}</line>`)
  return `${contextBlock(input.context)}<target>\n${lines.join('\n')}\n</target>`
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
  context: ChunkContext
  failures: readonly {
    unit: TranslationUnit
    speaker?: string
    returned: string | null
    issues: readonly Issue[]
  }[]
}): string {
  const lines = input.failures.map(({ unit, speaker, returned, issues }) => {
    const problems = issues.length
      ? issues.map((i) => `- ${describeIssue(unit, i)}`).join('\n')
      : '- the line was missing from your answer'
    return `${lineOpen(unit.cueId, speaker)}
<source>${unit.payload}</source>
<returned>${returned ?? ''}</returned>
<problems>
${problems}
</problems>
</line>`
  })
  return `${contextBlock(input.context)}Your previous translations of these lines broke the marker rules. Translate each <source> again, fixing every listed problem. Answer with the same JSON format, only for these ids.

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
