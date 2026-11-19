# Translation presets

A preset is everything that shapes **how** a subtitle is translated: media type, temperature, style guidance (prompt), glossary, and optionally a model and a default target language. Code: `src/main/presets/`.

## Built-in presets (immutable)

Defined in code (`builtin-presets.ts`), frozen, versioned with the app, **never stored in the database**. They have no model, glossary or target language: jobs use the settings `translation.defaultModel` and `translation.defaultTargetLang`.

| Id                    | Name        | Temperature | Style guidance (summary)                                                                                                                     |
| --------------------- | ----------- | ----------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| `builtin:movie`       | Movie       | 0.35        | natural theatrical dialogue, consistent register, adapted slang/jokes, short lines, no softened profanity                                    |
| `builtin:series`      | Series      | 0.35        | same, plus consistency of names/forms of address across the episode and concise recaps                                                       |
| `builtin:anime`       | Anime       | 0.45        | keep honorifics and untranslatable terms, attack/technique/place names, expressive tone and speech quirks, onomatopoeia only when meaningful |
| `builtin:documentary` | Documentary | 0.2         | terminology accuracy, exact numbers/dates/units/names (no conversion), neutral formal narration                                              |

`update`/`delete` on a built-in → `PRESET_READ_ONLY`. The exact texts are pinned by a snapshot test; improving them in a later release needs no migration, and jobs already created keep the copy they froze.

## Custom presets

Created from scratch (`presets:create`) or copied (`presets:duplicate`, from a built-in or a custom one; default name `<name> (copy)`, `(copy 2)`…; `copiedFrom` records the origin). Stored in the `presets` table. Validation (`preset.schema.ts`): name 1–80 chars, unique (also against built-in names, case-insensitive), `mediaType` in `movie | series | anime | documentary | other`, temperature 0–2, prompt ≤ 4,000 chars, glossary ≤ 500 entries `{ source, target?, rule? }`, `model` and `targetLang` (BCP-47) nullable. Deleting a preset used by a non-terminal job → `PRESET_IN_USE`.

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
      "mediaType": "anime",
      "temperature": 0.45,
      "prompt": "Media type: anime. …",
      "glossary": [{ "source": "Konoha", "target": "Folha" }],
      "model": "anthropic/claude-x",
      "targetLang": "pt-BR"
    }
  ]
}
```

- No ids, `builtin`, `copiedFrom` or dates: an imported preset is always a **new custom preset** (built-ins can be exported and come back as editable copies). Unknown fields are ignored; missing `model`/`targetLang` become `null`.
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
2. Model: `preset.model`, else `translation.defaultModel`; neither → `MODEL_NOT_SET` (the UI should ask the user to pick a model).
3. Target language: request → `preset.targetLang` → `translation.defaultTargetLang` (default `pt-BR`).
4. The job freezes a **resolved snapshot** (`spec.preset`: id, name, media type, model, glossary, temperature, prompt), so editing the preset or updating the built-ins later never changes a queued job or its retry.

## Cache key

The Job Memory key uses `prompt_hash` = sha256 of the canonical JSON of `{ glossary, style }` (`''` when both are empty): the same line translated with the Documentary style is not reused by the Anime style. Temperature and media context are **not** part of the key (a per-episode synopsis would defeat reuse). See [`job-memory.md`](./job-memory.md).
