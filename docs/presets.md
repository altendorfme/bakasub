# Translation presets

A preset is the **style** of a translation: media type, temperature, style guidance (prompt) and glossary. The model and the target language are not part of a preset: they are chosen per job, starting from the defaults the user sets in Models and Languages. Code: `src/main/presets/`.

## Built-in presets (immutable)

Defined in code (`builtin-presets.ts`), frozen, versioned with the app, **never stored in the database**. They have no glossary. Their media types are `Movie`, `Series`, `Anime` and `Documentary`.

| Id                    | Name        | Temperature | Media-specific guidance (summary)                                                                                                                                                                                                                 |
| --------------------- | ----------- | ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `builtin:movie`       | Movie       | 0.35        | natural theatrical dialogue                                                                                                                                                                                                                       |
| `builtin:series`      | Series      | 0.35        | natural streaming dialogue, concise recaps/titles/on-screen text                                                                                                                                                                                  |
| `builtin:anime`       | Anime       | 0.4         | keep honorifics and Japanese terms without equivalent (source-language idioms are not such terms), attack/technique/mecha names untranslated, in-world common nouns by plain meaning, expressive tone and speech quirks, signs as complete titles |
| `builtin:documentary` | Documentary | 0.2         | terminology accuracy, exact numbers/dates/units/names (no conversion), neutral formal narration, faithful interviews, established titles                                                                                                          |

### How a built-in prompt is composed

Each prompt is `Media type: …` + its media-specific rules + shared blocks, so a rule never exists in one preset and silently goes missing in another:

| Rule                                                           | Block     | Movie | Series | Anime |                        Documentary                        |
| -------------------------------------------------------------- | --------- | :---: | :----: | :---: | :-------------------------------------------------------: |
| Names, nicknames, forms of address, recurring terms consistent | `SHARED`  |   ✓   |   ✓    |   ✓   |                             ✓                             |
| Short lines, easy to read                                      | `SHARED`  |   ✓   |   ✓    |   ✓   |                             ✓                             |
| Each character's voice and register consistent                 | `FICTION` |   ✓   |   ✓    |   ✓   |                             –                             |
| Adapt wordplay, puns and jokes                                 | `FICTION` |   ✓   |   ✓    |   ✓   |                             –                             |
| Do not censor or soften profanity                              | `FICTION` |   ✓   |   ✓    |   ✓   | – (interviews stay faithful, "including strong language") |

Documentary has no `FICTION` block on purpose: narration is neutral and formal, and accuracy wins over style.

Not in any preset, because it is a **fixed system prompt rule** that applies to every style (see [`llm.md`](./llm.md#prompt)): idioms and slang adapted to the natural target-language equivalent, imperative mood for commands, current official spelling. Keeping it in one place avoids duplicated (and drifting) instructions; the presets only add what is specific to a kind of media.

Prompt size (o200k_base): Movie 140, Series 158, Anime 353, Documentary 151 tokens (was 96 / 100 / 159 / 101). It is part of the system prompt, which is the same for every chunk of a job and is reused by provider prompt caching; the preflight counts it per chunk.

`update`/`delete` on a built-in → `PRESET_READ_ONLY`. The exact texts are pinned by a snapshot test, and a second test checks that the shared rules are present in every preset that should have them; improving them in a later release needs no migration, jobs already created keep the copy they froze and custom presets copied from a built-in keep their own text. Changing a built-in text changes its `prompt_hash`, so lines cached with the old text are not reused by the new one (see Cache key below).

## Custom presets

Created from scratch (`presets:create`) or copied (`presets:duplicate`, from a built-in or a custom one; default name `<name> (copy)`, `(copy 2)`…; `copiedFrom` records the origin). Stored in the `presets` table. Validation (`preset.schema.ts`): name 1–80 chars, unique (also against built-in names, case-insensitive), `mediaType` free text 1–40 chars (a label only, never sent to the model; the UI suggests Movie/Series/Anime/Documentary), temperature 0–2, prompt ≤ 4,000 chars, glossary ≤ 500 entries `{ source, target?, rule? }`. Deleting a preset used by a non-terminal job → `PRESET_IN_USE`.

## Prompt language

Write the style guidance (prompt) **in English**, even when the target language is another one. The rest of the system prompt (intro, fixed rules, output format) is in English and models follow English instructions more reliably; the target language comes from the job, not from the language the prompt is written in. The built-ins are written in English. This is a recommendation only: the editor shows a tip under the prompt field (`presets.field.promptLanguageTip`, hidden on read-only built-ins), and nothing detects, translates or rejects a prompt written in another language.

## Export / import (`preset-file.ts`)

`presets:export { ids }` opens the native **save** dialog and writes a JSON file; `presets:import { onConflict? }` opens the native **open** dialog. Files are only touched by the Main process, never through a renderer-supplied path.

```json
{
  "format": "bakasub-presets",
  "version": 1,
  "exportedAt": "2026-11-19T12:00:00.000Z",
  "presets": [
    {
      "name": "Anime: Naruto",
      "mediaType": "Anime",
      "temperature": 0.45,
      "prompt": "Media type: anime. …",
      "glossary": [{ "source": "Konoha", "target": "Folha" }]
    }
  ]
}
```

- No ids, `builtin`, `copiedFrom` or dates: an imported preset is always a **new custom preset** (built-ins can be exported and come back as editable copies). Unknown fields are ignored (including `model`/`targetLang` from early development files).
- Limits: 1 MB, 500 presets per file. A wrong envelope (not JSON, other `format`, unknown `version`) → `INVALID_PRESET_FILE` and nothing is written.
- Each entry is validated with the same schema as `presets:create`; invalid entries are reported in `skipped` (`{ index, name?, reason }`, reason = offending fields) and the valid ones are inserted in **one transaction**.
- Name conflicts (built-ins, existing presets, or duplicates inside the file): `onConflict: 'rename'` (default) → `<name> (imported)`, `(imported 2)`…; `'skip'` → reported as `name-taken`.
- `version` exists so the format can evolve; older files will be migrated on import.

## How a preset reaches the model

```
System:  <glossary> (preset)  →  intro + target language  →  <style> (preset prompt)
         →  fixed rules (markers, no new tags, …) "they always apply"  →  output format
User:    <media> (user notes now; external API synopsis later)  →  <context>  →  <target>
```

- The fixed rules come **after** the preset guidance and say they always apply: a custom prompt cannot switch off marker protection.
- `temperature` comes from the preset.
- **User notes** (`notes` on jobs and batches, ≤ 4,000 chars: synopsis, characters, tone…) go into `<media>`. Media context from TMDB/TVDB will be merged there too.

## Resolution when a job is created

1. `presetId` from the request, else the setting `translation.defaultPresetId` (default `builtin:series`).
2. Model: the request's `model`, else `translation.defaultModel`; neither → `MODEL_NOT_SET`.
3. Target language: the request's `targetLang`, else `translation.defaultTargetLang`; neither → `TARGET_LANG_NOT_SET`. There is no factory default: the onboarding makes the user pick one.
4. The job freezes a **resolved snapshot** (`spec.preset`: id, name, media type, model, glossary, temperature, prompt), so editing the preset or updating the built-ins later never changes a queued job or its retry.

## Cache key

The Job Memory key uses `prompt_hash` = sha256 of the canonical JSON of `{ glossary, style }` (`''` when both are empty): the same line translated with the Documentary style is not reused by the Anime style. Temperature and media context are **not** part of the key (a per-episode synopsis would defeat reuse). See [`job-memory.md`](./job-memory.md).
