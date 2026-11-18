# Frontend requirements backlog

Requirements that the backend/API work has already committed to exposing, but that have **no UI yet**. Review this file before starting any renderer work and tick items off as they ship. Add new entries whenever an API decision implies something the user must be able to see or do.

## 1. Translation coverage in the preflight (from the SRT parser design)

Some subtitle content will not be sent to the LLM. The user must be told **what, where and why**, before the Job starts; silent omissions are not acceptable.

Source: `analyzeCoverage(doc): CoverageReport` (`src/main/parsers/core/coverage.ts`, implemented; see [`parsing.md`](./parsing.md)), computed by the same `classify()` the segmenter uses, so the report cannot diverge from the pipeline. It travels to the renderer as part of the preflight response, capped with `maxEntries` (`truncated: true` when cut).

What the UI must show:

| Need        | Field                      | Notes                                                                                 |
| ----------- | -------------------------- | ------------------------------------------------------------------------------------- |
| Summary     | `totals`, `byReason`       | e.g. "12 lines will not be translated"                                                |
| Where       | `location.line`, `startMs` | line in the file; timestamp when the block has timing                                 |
| What        | `excerpt`                  | ≤ 120 chars, control characters made visible; full raw loaded on demand through `ref` |
| Why         | `reason` + `params`        | **The UI localizes (PT-BR/EN).** The Main process sends codes only                    |
| Consequence | `outcome`                  | `kept-original` (block stays as is in the output) or `omitted`                        |
| Severity    | `severity`                 | `info` is benign, `warn` means real content is left untranslated                      |
| What to do  | `actions`                  | hints: `edit-raw`, `ignore`; the UI decides the interaction                           |

Reason codes the UI needs messages for:

| Code                             | Severity | Meaning for the user                                                                            |
| -------------------------------- | -------- | ----------------------------------------------------------------------------------------------- |
| `SKIPPED_NO_LETTERS`             | info     | Cue contains no letters (e.g. `♪♪`, `...`, only tags). Not an alert: count it, make it listable |
| `UNTRANSLATED_ORPHAN_TEXT`       | warn     | Text after a blank line with no timing; it stays in the original language                       |
| `UNTRANSLATED_BAD_TIMING`        | warn     | A `-->` line could not be read                                                                  |
| `UNTRANSLATED_EMPTY_BLOCK`       | info     | Empty block                                                                                     |
| `UNTRANSLATED_MARKER_COLLISION`  | warn     | Text resembles an internal marker (`<g1>`); the cue is passed through untouched                 |
| `UNTRANSLATED_VALIDATION_FAILED` | warn     | Reserved for the LLM layer                                                                      |

UX rules already decided:

- Only `untranslated` entries count as "lines you need to look at"; `skipped` is informational.
- Unparsed blocks go to the output verbatim by default; export can drop them (`repair: { unparsed: 'drop' }`), which must be an explicit, visible user choice with the resulting diagnostic shown.

## 2. Parser diagnostics and auto-fixes

- Show syntax diagnostics (`Diagnostic { code, severity, fix: 'auto' | 'report', line, col }`) separately from coverage: diagnostics describe the file, coverage describes what will be translated.
- Exports for muxing use the repaired serializer by default; list the applied `fixed` diagnostics so the user knows what changed (renumbered indexes, `.` → `,`, etc.).
- `report`-only issues (`end < start`, overlap, empty cue, `X1:` coordinates) need a visible warning; they are never fixed automatically.

## 3. Encoding confidence

- `decodeSubtitle()` returns `meta.encoding` and `meta.confidence`. When confidence is low (legacy single-byte encodings), the UI must say which encoding was assumed and let the user override it.

## 4. Sidecars (already implemented API)

- `sidecars:check`, `sidecars:install` (native consent dialog), `sidecars:progress`, `app:check-update`: the current `App.tsx` is a placeholder. A proper onboarding/settings screen is still missing.
