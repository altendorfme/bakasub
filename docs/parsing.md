# Subtitle parsing

Everything lives in `src/main/parsers/` and is **pure** (no `electron` import), so it runs in plain Node and under vitest. Public API: `src/main/parsers/index.ts`. Formats: **SRT** and **ASS/SSA** (`srt/` and `ass/` reuse `core/` and add only a scanner, an inline lexer, a parser and a serializer).

Parsers only take text apart and put it back together. They know nothing about LLMs, the database or IPC.

```
bytes ──► decodeSubtitle ──► text + DocumentMeta
text  ──► srtFormat.parse | assFormat.parse ──► SubtitleDocument (cues + unparsed blocks + diagnostics)
cue   ──► toTranslationUnit ──► payload (text + markers) + skeleton
LLM   ──► applyTranslation(cue, unit, translated, lexInline) ──► new Cue | Issue[]
doc   ──► srtFormat.serialize (exact)  |  srtFormat.serializeRepaired (safe fixes)
doc   ──► analyzeCoverage ──► what will NOT be translated, where and why
```

```ts
const { text, meta } = decodeSubtitle(buffer)
const doc = srtFormat.parse(text, meta) // throws SubtitleParseError only for empty input / no valid cue
for (const item of doc.items) {
  if (item.kind !== 'cue') continue
  const unit = toTranslationUnit(item) // null => do not send to the LLM
}
const { text: out, applied } = srtFormat.serializeRepaired(doc) // export for mkvmerge
```

## Decoder (`decode/`)

Order: BOM (UTF-8, UTF-16 LE/BE) → strict UTF-8 → `chardet` restricted to an allowlist, defaulting to `windows-1252` (Latin-1 and friends are decoded as windows-1252, which is a superset). Decoding uses the native `TextDecoder` with `ignoreBOM: true`, so a stray U+FEFF is preserved instead of silently dropped. It never throws: the worst case is `windows-1252` with low `meta.confidence`, which the UI must surface. The parser only sees a `string`; BOM, encoding and EOL style travel in `DocumentMeta`. Output is always UTF-8 (the BOM is re-added if the input had it).

`mkvextract` writes `.srt` files **with a UTF-8 BOM**; the decoder strips it into `meta.bom`.

## AST (`core/types.ts`)

- `Node` = `TextNode | TagNode | LineBreakNode`. `TagNode.raw` keeps the exact source; `kind` is `open | close | override`.
- `Cue<F>`: `id` (document ordinal, **not** the file index), `start`/`end` (`{ ms, raw }`), `nodes`, `leading`, `line`/`endLine`, and `format: F` (lossless, format-specific data; for SRT: index line, timing line, EOLs, extras).
- `Cue.style?` / `Cue.actor?`: ASS/SSA `Style` and `Name` columns (`undefined` in SRT or when empty).
- `UnparsedBlock`: raw text the scanner could not classify (`orphan-text | bad-timing | empty-block | bad-event`).
- `SubtitleDocument`: `items`, `trailing`, `meta`, `diagnostics`. Everything is immutable.

### Round-trip invariant

`serialize(parse(s)) === s`, byte for byte, for **any** input including malformed files. Each item owns the raw text _before_ it (`leading`: the previous line's EOL plus blank lines); the last EOL lives in `document.trailing`. Verified with fast-check over generated documents (random EOLs, whitespace, glued cues, garbage) and arbitrary binary strings.

## SRT

### Scanner (`srt/block-scanner.ts`)

Anchored on the timing line (`-->`), not on blank lines, which is what makes recovery possible:

- A cue starts at a valid timing line; a digits-only line right before it is the index.
- Text ends at a blank line (whitespace-only counts), another timing line, or an index+timing pair (glued cues).
- Non-blank lines outside any cue form an `UnparsedBlock`: `bad-timing` if it contains `-->`, `empty-block` for a lone number, `orphan-text` otherwise.
- Glued case (no blank line before a number-only line + timing): the number is the next cue's index **only if** it equals the previous index + 1. Otherwise it stays as text of the previous cue, the next cue has no index and `SRT_AMBIGUOUS_INDEX` (warn, report) is raised. With a blank line before it, any number is an index.
- A blank line inside a cue ends it; the continuation becomes an orphan block (reported, never silently merged).

### Timing (`srt/timing-line.ts`)

Tolerates `.` for `,`, 1–3 digit hours/fractions, missing fraction, any spacing around `-->`, and trailing coordinates (`X1:… Y2:…`). Fractions are integer milliseconds (`,5` = 5 ms, as ffmpeg/libass do). Lines that cannot be read yield `null` (→ `bad-timing` block).

### Inline lexer (`srt/inline-lexer.ts`)

| Becomes            | Rule                                                                                       |
| ------------------ | ------------------------------------------------------------------------------------------ |
| `Tag` (open/close) | whitelist `i b u s font c v lang` (case-insensitive, attributes kept in `raw`)             |
| `Tag` (override)   | `{…}` containing a backslash, e.g. `{\an8}`                                                |
| `LineBreak`        | each EOL, with its real `\n`/`\r\n`/`\r`                                                   |
| `Text`             | everything else: `<3`, `a < b`, `<Name>`, `<br>`, `{laughs}`, and HTML entities (kept raw) |

### Diagnostics (`core/diagnostics.ts`)

`FIX_POLICY` is the single table for parser, serializer and UI. `auto` = fixed by `serializeRepaired`; `report` = never changed automatically.

| Code                                                              | Severity           | Fix                              |
| ----------------------------------------------------------------- | ------------------ | -------------------------------- |
| `SRT_INDEX_MISSING` / `_DUPLICATE` / `_GAP`                       | info / warn / info | auto (renumbered 1..N)           |
| `SRT_TIME_DOT_SEPARATOR`, `SRT_TIME_PADDING`, `SRT_ARROW_SPACING` | info               | auto                             |
| `SRT_MISSING_BLANK_LINE`, `SRT_EOL_MIXED`, `SRT_TRAILING_WS`      | info/warn          | auto                             |
| `SRT_END_BEFORE_START`, `SRT_OVERLAP`                             | warn               | report                           |
| `SRT_EMPTY_CUE`                                                   | info               | report                           |
| `SRT_TIMING_EXTRAS` (coordinates), `SRT_UNPARSEABLE_BLOCK`        | warn               | report                           |
| `SRT_AMBIGUOUS_INDEX`                                             | warn               | report                           |
| `ASS_EOL_MIXED`                                                   | warn               | auto                             |
| `ASS_TIME_FORMAT`                                                 | info               | report                           |
| `ASS_END_BEFORE_START`, `ASS_FORMAT_MISSING`                      | warn               | report                           |
| `ASS_UNPARSEABLE_EVENT`                                           | warn               | report                           |
| `SEG_MARKER_COLLISION`                                            | n/a                | report (raised through coverage) |

Diagnostics carry `code` + `params` only. The Main process never sends localized text.

### Repaired serializer (`srt/srt-repair.ts`)

Applies only `auto` fixes and returns `{ text, applied }` (one `AppliedFix` per occurrence). Timing is regenerated from `ms` (`HH:MM:SS,mmm`), keeping coordinates with normalized spacing; indexes become the ordinal; items are separated by exactly the existing blank lines or one if missing; EOLs become the dominant one; trailing spaces/tabs are stripped (including "blank" lines made of spaces). `{ unparsed: 'keep' | 'drop' }` (default `keep`): `drop` removes unparsed blocks and records each one. Idempotent, and never changes any `ms`.

## ASS / SSA (`ass/`)

One module for both dialects: `doc.format` is `'ssa'` when `ScriptType: v4.00` (no `+`) or, without `ScriptType`, a `[V4 Styles]` section exists; otherwise `'ass'`. `assFormat` and `ssaFormat` share the implementation; the real dialect always comes from the content.

- **Structure (lossless).** Only `Dialogue:` lines inside `[Events]` become `Cue`s. Everything else (Script Info, styles, `Comment:`, fonts, `;`, blank lines) is raw trivia in `leading`/`trailing`. `mkvextract` output (UTF-8 BOM, CRLF, `Comment:` events moved before all `Dialogue:`) is handled and round-trips exactly.
- **Columns** come from the `[Events]` `Format:` line (any order, `Text` must be last; SSA `Marked` is read as `Layer`). Missing/unusable `Format:` falls back to the standard columns with `ASS_FORMAT_MISSING`. `Text` is everything after the (N-1)-th comma, so commas in the text are safe.
- **`AssCueData`**: `prefix` (raw line up to the comma before `Text`, so exact serialization is `prefix + text`), `layer`, `marginL/R/V`, `effect` (trimmed strings). `Style`/`Name` go to `Cue.style`/`Cue.actor`.
- **Time** `H:MM:SS.cc` → ms; other readable forms (1 or 3 fraction digits, missing fraction, padding spaces) are accepted and reported (`ASS_TIME_FORMAT`), never rewritten. Unreadable time or too few columns → `UnparsedBlock` with reason `bad-event` (verbatim, `ASS_UNPARSEABLE_EVENT`).
- **Inline lexer** (`ass/inline-lexer.ts`):

| Becomes            | Rule                                                                                                   |
| ------------------ | ------------------------------------------------------------------------------------------------------ |
| `Tag` (override)   | every `{…}`, including comment blocks without a backslash (libass hides them, unlike SRT's `{laughs}`) |
| `Tag` (open/close) | a block holding **only** `\i \b \u \s` with `0`/`1` (`{\i1}` opens, `{\i0}` closes) → `<gN>` pair      |
| `LineBreak`        | `\N` and `\n` (`raw` keeps the two characters)                                                         |
| `Text`             | everything else; `\h` stays literal; `{` without `}` is text                                           |

- **Never sent to the LLM** (decided by `classify()` from the tags, so `core/` stays format-agnostic): vector drawings (`\p1`…; not `\pos`/`\p0`) → `SKIPPED_DRAWING` (info); karaoke (`\k \kf \ko \K`) → `UNTRANSLATED_KARAOKE` (warn); unreadable events → `UNTRANSLATED_BAD_EVENT`.
- **Repair** (`ass-repair.ts`) only unifies EOL to the dominant one (`ASS_EOL_MIXED`); `unparsed: 'drop'` removes bad events. Everything else is report-only and there is no trimming (trailing spaces in `Text` may be meaningful).
- **Translation validation** is stricter than SRT in two ways, in both formats: loose markers `<xN/>` must keep their original relative order (`MARKER_ORDER`: overrides are positional), and a `\N`/`\n` written by the model counts as a raw newline.
- Tests use synthetic fixtures; real files should only be used locally and never committed.

## Segmentation for the LLM (`core/segmentation/`)

Only text reaches the model, plus opaque markers (XLIFF style) so a sentence split by formatting is translated as a sentence:

```text
raw:      {\an8}Olá <i>mundo</i>, tudo bem?
payload:  Olá <g1>mundo</g1>, tudo bem?      (the {\an8} stays in the skeleton)
returned: Hello <g1>world</g1>, how are you?
output:   {\an8}Hello <i>world</i>, how are you?
```

| Marker       | Meaning                                                                                                                              |
| ------------ | ------------------------------------------------------------------------------------------------------------------------------------ |
| `<gN>…</gN>` | open/close pair of the same tag, properly nested (stack discipline; a close that does not match the top of the stack stays unpaired) |
| `<xN/>`      | standalone tag: override blocks and unpaired tags                                                                                    |
| `<br/>`      | line break; the n-th `<br/>` maps to the n-th original break (its original EOL)                                                      |

- Leading/trailing tags are **not sent** when they are standalone or when both ends of a pair sit on the edges (fixpoint, so an edge never separates a pair). `<i>A</i>\n<i>B</i>` therefore stays `<g1>A</g1><br/><g2>B</g2>`.
- **No escaping.** Text that already looks like a marker (`<g1>`, `</g2>`, `<x3/>`, `<br/>`) makes the cue `UNTRANSLATED_MARKER_COLLISION`: it bypasses the LLM and is reported.
- `validateTranslation`/`applyTranslation` require: every marker exactly once, pairs open-before-close and nested, same `<br/>` count, no raw `\n`/`\r` (a real newline would split the cue), no tags invented by the model (checked with the format's own `lexInline`, injected so `core/` stays format-agnostic), and non-empty text. Marker and word **positions are free**: languages reorder. Issues: `MISSING_MARKER`, `UNEXPECTED_MARKER`, `DUPLICATE_MARKER`, `BAD_NESTING`, `BR_COUNT_MISMATCH`, `RAW_NEWLINE`, `INVENTED_TAG`, `MARKER_ORDER`, `EMPTY_TRANSLATION`.
- `applyTranslation` does **not** trim; whitespace policy belongs to the caller. A translation equal to the payload reproduces the cue exactly (property test), and editing only the text never changes tags, breaks, timecodes or trivia.

## Coverage (`core/coverage.ts`)

`classify(item)` is the only place that decides "does this go to the LLM?". The segmenter and `analyzeCoverage` both call it, so the report cannot diverge from the pipeline (property test).

| Status       | Reason                           | Cause                                                            |
| ------------ | -------------------------------- | ---------------------------------------------------------------- |
| skipped      | `SKIPPED_NO_LETTERS`             | cue without any Unicode letter (`♪♪`, `...`, numbers, only tags) |
| skipped      | `SKIPPED_EMPTY_BLOCK`            | lone index number                                                |
| skipped      | `SKIPPED_DRAWING`                | ASS/SSA vector drawing (`\p1`)                                   |
| untranslated | `UNTRANSLATED_ORPHAN_TEXT`       | text after a blank line without timing                           |
| untranslated | `UNTRANSLATED_BAD_TIMING`        | unreadable `-->` line                                            |
| untranslated | `UNTRANSLATED_MARKER_COLLISION`  | text resembles a marker                                          |
| untranslated | `UNTRANSLATED_KARAOKE`           | ASS/SSA karaoke tags                                             |
| untranslated | `UNTRANSLATED_BAD_EVENT`         | unreadable ASS/SSA `Dialogue:`                                   |
| untranslated | `UNTRANSLATED_VALIDATION_FAILED` | LLM layer: the line exhausted its validation attempts            |
| untranslated | `UNTRANSLATED_CONTENT_FILTERED`  | LLM layer: blocked by the provider's moderation                  |

Entries carry `ref`, `location` (lines and, for cues, `startMs`/`endMs`), a ≤120-char `excerpt` with line breaks/control characters made visible, `outcome` (`kept-original` or `omitted`, following the `unparsed` export option), `params`, `cause` and `actions`. Untranslated entries come first and `maxEntries` (default 500) caps the payload while the totals stay complete. After a translation, pass `{ failures: result.failed }` so lines the LLM could not translate are reported with their LLM reason. The UI requirements are tracked in [`frontend-requirements.md`](./frontend-requirements.md).

## Tests

`npm test` (vitest + fast-check, also run in CI on Linux and Windows). Highlights: round-trip properties over generated and arbitrary binary input; scanner coverage (no content lost between items); repair idempotence and `ms` preservation; segmentation identity and "text edits never touch tags"; coverage vs segmenter agreement; decoder BOM/UTF-16/windows-1252; a 10k-cue performance guard (parse ≈ 65 ms locally).

## Non-goals and open points

- No line-length/reflow checks on translated text (belongs to the LLM QC layer).
- The context hash lives in the Job Memory module ([`job-memory.md`](./job-memory.md)); this layer only exposes `cuePlainText()` (tags removed, breaks and ASS `\\h` as spaces) and `normalizeForHash()` (NFC, `\\h` → space, collapsed whitespace, trim, case preserved).
- No style filter in the parser API (`Cue.style` is exposed; filtering belongs to the Job/Profile iteration).
- ASS `[Fonts]`/`[Graphics]`, `\\t` animations and `\\clip` are kept raw as trivia/tags; nothing is interpreted beyond what is listed above.
