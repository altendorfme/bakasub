# Media context (TMDB)

Recognizes what is being translated from the file name and gives the model the title, genres, synopsis and episode synopsis in the prompt's `<media>` block. Optional: without a TMDB key everything works, just without this context. Code: `src/main/media-context/`. User guide for the key (in-app, en/pt-BR): [`tmdb-key.md`](../src/renderer/src/guides/en/tmdb-key.md).

```
file name ──► parseReleaseName ──► { title, year?, season?, episode?, absoluteEpisode? }
          ──► MediaContextService.identify ──► search (TMDB /search/multi) ──► acceptance rule
          ──► details (+ episode) ──► MediaIdentification { status, match, episode }
UI picks/edits ──► jobs:create { media: { ref, season?, episode? } }
          ──► resolveJobSpec looks up and FREEZES the details in spec.media
          ──► buildMediaContext(spec.media, spec.notes) ──► <media> block
```

## Release name parser (`release-name.ts`)

Deterministic, no library: `Title.S01E05`, `Title.1x05`, `Title.2024`, `Title (2016)`, `[Group] Title - 28 [CRC]`. Brackets (group, CRC, quality) are dropped, separators become spaces, and the title is cut at the first episode marker, year or quality tag. The year is the **last** year in the title region that is not the first word, so `2001.A.Space.Odyssey.1968` and `Blade.Runner.2049.2017` work. Subtitle suffixes (`.en`, `.pt-BR`, `.forced`, `.sdh`) are ignored. Anime absolute numbering (`Show - 28`) is returned as `absoluteEpisode`: there is no automatic mapping to season/episode; the user edits the fields in the UI.

## TMDB client (`tmdb-client.ts`)

- Credential: a 32-hex **API Key** goes in `api_key=`; anything else is treated as the **API Read Access Token** (`Authorization: Bearer`). Validated with `GET /3/configuration` before it is saved (`settings:set-tmdb-key`); stored in the vault as `tmdb.credential` and registered in the log redactor.
- Requests: `language=en-US` always (the prompt is English), 10 s timeout. `401` → `TMDB_AUTH`, `404` → `null`, no key → `TMDB_KEY_MISSING`, anything else → `NETWORK`.
- `search` (`/search/multi`, movies and TV only, `include_adult=false`), `details` (`/movie/{id}` or `/tv/{id}`: genres (names and ids), original language, origin countries (`origin_country` for TV, `production_countries` for movies), runtime or typical episode runtime, overview; the renderer uses genre id + language/country to suggest a preset per batch work), `episode` (`/tv/{id}/season/{s}/episode/{e}`).

## Cache (`cached-provider.ts`, table `media_cache`)

Read-through cache of normalized responses: searches 1 day, details and episodes 30 days. When TMDB is unreachable (`NETWORK`) an expired entry is still served; auth errors always surface; "not found" is not cached.

## Automatic identification (`media-context.service.ts`)

Conservative on purpose (showing the wrong show's synopsis and artwork is worse than asking):

- a result is accepted only if the parsed title **equals** the TMDB title or original title, or is a **word prefix** of it (`Frieren` → `Frieren: Beyond Journey's End`), after normalizing accents, case, `&` and punctuation (apostrophes match both `Journeys` and `d Amelie` spellings);
- and the year matches when the file name has one;
- with an episode marker, a series wins over a same-titled movie; otherwise TMDB's order (popularity) decides.

Statuses: `matched`, `not-found` (the user searches in the title field), `no-key` (no request is made), `offline`. A movie never gets an episode.

## Artwork (`artwork-cache.ts`, `artwork-protocol.ts`)

The renderer never touches the network. Media DTOs carry `bakasub-media://tmdb/<size>/<file>` URLs (`w92` search thumbnails, `w342` posters, `w1280` backdrops). The `bakasub-media:` scheme is registered as privileged before `ready` and handled by `protocol.handle`: the URL is parsed strictly (host `tmdb`, known size, plain `name.jpg|jpeg|png|webp`; anything else is 404), the image is downloaded on demand from `image.tmdb.org/t/p/…` (image content type only, ≤ 10 MB, written atomically), kept in `userData/cache/artwork/` with an LRU cap of 200 MB, and served with a long `cache-control`. Concurrent requests for the same image share one download. CSP: `img-src 'self' data: bakasub-media:`.

## In the job

- `JobCreateRequest.media?: { ref, season?, episode? }` (`translate` and `pipeline`), sent only when the user keeps "Include these details". The Main looks the details up (normally a cache hit, since the UI just showed them) and freezes them in `spec.media`, so a retry uses the same context even offline. If the lookup fails, the job is created without context and a warning is logged.
- `buildMediaContext` writes plain labeled lines (title, year, kind, original title, genres, synopsis, episode code/title/synopsis) followed by `Notes from the user:` and the notes. Artwork URLs never reach the prompt.
- Like the notes, the media context is **not** part of the Job Memory key.
- `Job.media` (`JobMediaSummary`) exposes title, kind, year, artwork URLs and the episode code/title of the frozen context to the queue (`src/main/jobs/media-summary.ts`); the synopsis stays in the spec.
- Batch mode: identification per file is planned with the batch prototype.

## IPC

| Channel                                                                          | Purpose                                                                                              |
| -------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| `settings:set-tmdb-key` / `settings:clear-tmdb-key` / `settings:tmdb-key-status` | key management (validated before saving; `TMDB_AUTH` when rejected)                                  |
| `media:identify { name }`                                                        | automatic identification from a file name (nothing is read from disk)                                |
| `media:search { query }`                                                         | manual search (title field)                                                                          |
| `media:lookup { ref, season?, episode? }`                                        | details for a chosen result, plus the episode of a series                                            |
| `app:open-external { url }`                                                      | opens HTTPS URLs on an allowlist (TMDB, OpenRouter, GitHub, Buy Me a Coffee) only; `URL_NOT_ALLOWED` |

Attribution (TMDB terms): the UI shows "Metadata and images from TMDB" in the media panel and the full notice in Settings → About.
