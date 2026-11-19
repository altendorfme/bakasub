# BakaSub

🇬🇧 **English** · 🇧🇷 [Português](./README-pt.md)

Desktop application for extracting, AI-translating and re-muxing subtitles from `.mkv` videos.

> Status: **base infrastructure, the SRT, ASS/SSA and WebVTT parsers, the Job Memory cache, the LLM translation layer, the Job Manager (with batch mode) and the cost preflight are done** (IPC, database, sidecars, build/release, lossless subtitle AST). The UI is not implemented yet. See the [roadmap](#roadmap).

## Stack

| Layer             | Technology                                                                                             |
| ----------------- | ------------------------------------------------------------------------------------------------------ |
| Wrapper / backend | Electron (Main Process as a Node.js + TypeScript backend)                                              |
| Frontend          | React 19 (Vite) + Tailwind CSS v4 + TanStack Query                                                     |
| Communication     | Strict native IPC: `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true`, preload bridge |
| Database          | SQLite (WAL) via Drizzle ORM + LibSQL driver                                                           |
| Validation        | Zod (IPC payloads and remote manifests)                                                                |
| LLM               | OpenRouter over SSE (native `fetch`)                                                                   |
| Sidecars          | mkvtoolnix (`mkvextract`/`mkvmerge`) and ffmpeg via `child_process`                                    |
| Logging           | `electron-log`, rotating file in `userData/logs`                                                       |

Tooling runs on Node **26** (`.nvmrc`). The Main Process runs on Electron 44's embedded Node (24.x), so `@types/node` stays at `^24`.

## Development

```bash
nvm use            # Node 26
npm install
npm run dev        # electron-vite with HMR
```

| Script                            | Purpose                                                      |
| --------------------------------- | ------------------------------------------------------------ |
| `npm run typecheck`               | `tsc` for main/preload (`node`) and renderer (`web`)         |
| `npm run lint` / `format`         | ESLint / Prettier                                            |
| `npm run db:generate`             | Generate a Drizzle migration from `src/main/database/schema` |
| `npm run db:check`                | Validate migration consistency                               |
| `npm run build`                   | Typecheck + `electron-vite build`                            |
| `npm run dist:linux` / `dist:win` | Package on a native runner (used by CI)                      |
| `npm run build:win`               | Build the Windows installer from Linux (wine in Docker)      |
| `npm run build:all`               | Linux + Windows locally                                      |
| `npm run clean`                   | Remove `out/`, `dist/` and the ESLint cache                  |

Supported platforms: **Linux x64** and **Windows x64**. There is no macOS build.

## Layout

```
src/
  main/
    config/        paths (userData), remote URLs
    database/      client (WAL, migrate on boot), schema/, repositories/
    ipc/           create-handler (sender check + Zod), register, per-domain handlers/
    logging/       electron-log (scopes: app, db, ipc, sidecar, llm)
    services/      shutdown-coordinator, app-info, app-update, native consent dialog
    sidecars/      sidecar module (no `electron` dependency, testable in plain Node)
    parsers/       subtitle parsing: decoder, common AST, SRT, ASS/SSA, WebVTT, segmentation, coverage (pure, testable)
    llm/           OpenRouter client (SSE), model catalog, chunking, prompts, retries, translateDocument
    memory/        Job Memory: context hash and cache service
    media/         mkvtoolnix facade (probe/extract/mux), languages, output naming, path guard
    jobs/          job queue, runner, steps (probe/extract/translate/validate/write/mux), job specs
    batch/         batch planning (scan, probe, track selection) and batch service
    preflight/     token counting (js-tiktoken) and cost estimate
    presets/       built-in (immutable) and custom translation presets
    settings/      typed settings registry and the encrypted secret vault
    window/        BrowserWindow factory
  preload/         the only surface exposed to the renderer (window.api), allowlisted
  renderer/        React + Tailwind + TanStack Query
  shared/          typed IPC contract and pure utilities (no zod/electron)
drizzle/           versioned migrations
scripts/           cross-build (Docker/wine) and native binaries
docs/              detailed system flows
```

### IPC

`src/shared/ipc-contract.ts` is the single source of truth for channels, payloads and `window.api`. The preload only exposes channels listed in `INVOKE_CHANNELS`/`EVENT_CHANNELS` and never the raw `ipcRenderer`. Every handler goes through `createHandler`, which rejects untrusted `senderFrame`s, validates input with Zod and returns a `{ ok, data } | { ok: false, error }` envelope. Details: [`docs/ipc.md`](./docs/ipc.md).

### Graceful shutdown

`ShutdownCoordinator` runs disposers in LIFO order with a global timeout on `before-quit` and on `SIGINT`/`SIGTERM`. It aborts running jobs first (marking them `interrupted`), then releases sidecar child processes (SIGTERM → SIGKILL), the Job Memory writes and the database (`wal_checkpoint(TRUNCATE)`).

## User data

Everything lives in `app.getPath('userData')` (Linux: `~/.config/bakasub`, Windows: `%APPDATA%\bakasub`), never in the install directory:

```
bakasub.db            SQLite (WAL)
logs/main.log         rotates at 5 MB
cache/manifests/      last valid remote manifest (offline fallback)
bin/                  sidecars
```

## Sidecars

ffmpeg and mkvtoolnix are **not bundled**. The app reads two manifests from [`bakasub-manifests`](https://github.com/lsilvatti/bakasub-manifests):

- `version.json`: latest app version (notification only; nothing is downloaded or installed);
- `sidecar.json`: URL, SHA-256, archive type and binary path per `tool × platform × arch`.

- **Never downloads automatically.** `sidecars:check` only reads metadata. `sidecars:install` requires a native dialog in the Main Process (default button: Cancel), which a compromised renderer cannot approve.
- Streaming download with on-the-fly SHA-256, **HTTP Range resume** (`If-Range` with ETag/Last-Modified) and exponential-backoff retry. The `.part` survives failures, cancellations and restarts; a hash mismatch discards it.
- Redirects to `http` are refused; an invalid remote manifest never falls back to the cache.
- Extraction through `7zip-bin` (zip/7z) and `--appimage-extract`; `binaryRelativePath` is checked against path traversal.
- **Pruning:** after extraction only the binaries and their dependencies are kept (transitive `DT_NEEDED` closure read from the ELF on Linux; sibling DLLs on Windows). The pruned copy is validated before being adopted, falling back to the full tree on failure.
- Every binary is executed (`--version`/`-version`) before being recorded in `bin/installed.json`.
- Artifacts are deduplicated by SHA-256 under `bin/archives/<sha256>/` (mkvextract and mkvmerge share one download).

```ts
const { path, env } = await sidecars.resolve('mkvmerge')
// `env` is required: on Linux it injects LD_LIBRARY_PATH for the extracted AppImage libs
```

All external CLI execution must go through `ProcessRunner` (timeout, SIGTERM→SIGKILL, stderr captured to the log, tracked for shutdown). Full flow: [`docs/sidecars.md`](./docs/sidecars.md).

> Note for the subtitle parser: `mkvextract` writes `.srt` files with a **UTF-8 BOM**; the lexer must strip it before reading the first cue.

## Database

SQLite in WAL mode (`synchronous=NORMAL`, `foreign_keys=ON`, `busy_timeout=5000`) with Drizzle migrations applied on boot (`drizzle/` is shipped in `resources/`). Main tables: `presets` (custom translation presets with glossary/termbase; built-ins live in code), `jobs`/`batches`, `settings`/`secrets` and `job_memory` (translated-line cache, unique key `context_hash + target_lang + model + prompt_hash`; see [`docs/job-memory.md`](./docs/job-memory.md)). See [`docs/database.md`](./docs/database.md).

## Releases

`.github/workflows/release.yml` runs on `v*` tags (the tag must equal the `package.json` version) and produces, on native runners:

| Artifact                                | Built on |
| --------------------------------------- | -------- |
| `bakasub-<v>.AppImage`                  | Linux    |
| `bakasub-<v>-linux-x64-unpacked.tar.gz` | Linux    |
| `bakasub-<v>-setup.exe` (NSIS)          | Windows  |
| `bakasub-<v>-win-x64-unpacked.zip`      | Windows  |
| `SHA256SUMS.txt`                        | n/a      |

Each job runs lint, `db:check`, typecheck, build and a smoke test of the unpacked binary (the app must log `database ready`, validating libsql and migrations on the real OS). The release is created as a **draft**.

```bash
git tag v0.0.1 && git push origin v0.0.1
```

Use `workflow_dispatch` to test without creating a release. Notes: `linux-unpacked` needs `--no-sandbox` or a setuid `chrome-sandbox`; binaries are unsigned (SmartScreen will warn on Windows). More in [`docs/release.md`](./docs/release.md).

## Documentation

Detailed flows live in [`docs/`](./docs): [IPC](./docs/ipc.md) · [Sidecars](./docs/sidecars.md) · [Database](./docs/database.md) · [Subtitle parsing](./docs/parsing.md) · [Job Memory](./docs/job-memory.md) · [LLM translation](./docs/llm.md) · [Jobs](./docs/jobs.md) · [Preflight](./docs/preflight.md) · [Presets](./docs/presets.md) · [Build and release](./docs/release.md) · [Frontend backlog](./docs/frontend-requirements.md). Docs are updated together with the code they describe.

## Roadmap

Business rules defined in [`AGENTS.md`](./AGENTS.md):

- [x] Strict IPC, logging, database with migrations, graceful shutdown
- [x] Sidecars: manifests, verifiable download, resume, pruning, consent
- [x] App version check
- [x] Build and release (Linux + Windows)
- [x] **SRT parser**: lossless AST (Text / Tag / LineBreak nodes), tolerant scanner with diagnostics, safe repair mode, XLIFF-style segmentation for the LLM, coverage report (see [`docs/parsing.md`](./docs/parsing.md))
- [x] **ASS/SSA parser**: same `core/` AST; only `Dialogue:` becomes a cue, everything else is lossless trivia; drawings and karaoke are never sent to the LLM (see [`docs/parsing.md`](./docs/parsing.md))
- [x] **Job Manager**: persisted jobs (`extract`, `translate`, `mux`, `pipeline`), FIFO queue with bounded concurrency, per-job `AbortController`, retry from the failed step, atomic outputs, graceful shutdown, presets (4 immutable built-ins + custom, JSON export/import), validated paths (see [`docs/jobs.md`](./docs/jobs.md))
- [x] **Batch mode**: folders (optionally recursive) or multiple files, plan with automatic track selection, atomic batch creation, mirrored output folders, batch cancel (see [`docs/jobs.md`](./docs/jobs.md))
- [x] **WebVTT parser**: same `core/` AST; header/NOTE/STYLE/REGION as lossless trivia, decoded entities with escaping on output, `<v>` speaker, safe repair (see [`docs/parsing.md`](./docs/parsing.md)). Image-based subtitles (PGS/VobSub) are out of scope
- [x] **LLM layer**: sequential `<context>`/`<target>` chunks over cache misses, structured JSON (`json_schema` → `json_object` → prompt) validated with Zod + marker validation, per-line repair, transport retry policy, termbase in the System Prompt, OpenRouter SSE with cancellation and cost accounting, encrypted API key (see [`docs/llm.md`](./docs/llm.md))
- [x] **Job Memory**: validated cache keyed by _context hash_ + language + model + glossary, per-chunk transactional upsert, prune with incremental vacuum (see [`docs/job-memory.md`](./docs/job-memory.md))
- [x] **Preflight**: local token estimate (`js-tiktoken`, exact for GPT, ±20% range for other tokenizers) × Job Memory hit rate × `/api/v1/models` pricing, coverage report, confirmation before translating (auto-confirm threshold), batch totals (see [`docs/preflight.md`](./docs/preflight.md))
- [ ] **Media context**: scene-release filename parsing + TMDB/TVDB with manual override
- [ ] **Frontend**: build the screens listed in [`docs/frontend-requirements.md`](./docs/frontend-requirements.md) (translation coverage report in the preflight, parser diagnostics, encoding confidence, sidecar onboarding)
