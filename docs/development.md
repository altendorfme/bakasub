# Development

## Setup

```bash
nvm use            # Node 26 (.nvmrc)
npm install
npm run dev        # electron-vite with HMR
```

Supported platforms: Linux x64 and Windows x64. mkvtoolnix is not required on your machine: install the sidecars from the app (onboarding or Settings → Video tools).

## Dev data folder

Unpackaged runs use their own permanent userData, **separate from the installed app**: `~/.config/bakasub-dev` on Linux, `%APPDATA%\bakasub-dev` on Windows (installed: `bakasub`). Database, logs, sidecars, cache and the single-instance lock are all separate, so dev and the installed app run side by side and dev migrations never reach the installed database. Full table in [`architecture.md`](./architecture.md#user-data).

- Dev starts from an **empty database** and installs its own sidecars. Nothing is copied from the installed app.
- Optional, manual: to start dev from your real data, close both apps and copy the database (`cp ~/.config/bakasub/bakasub.db* ~/.config/bakasub-dev/`). Secrets are encrypted with the OS keychain (`safeStorage`); if the copied vault cannot be decrypted, the app resets it (logged as `secret vault master key was unrecoverable`) and you re-enter the keys.
- `BAKASUB_USER_DATA=/some/dir npm run dev` points any run (dev or packaged) at another folder: throwaway profiles, tests, scripts, a second dev instance.

## Scripts

| Script                            | Purpose                                                      |
| --------------------------------- | ------------------------------------------------------------ |
| `npm run dev`                     | Electron with HMR                                            |
| `npm test` / `test:watch`         | Vitest (Main in Node, renderer in jsdom)                     |
| `npm run typecheck`               | `tsc` for main/preload (`node`) and renderer (`web`)         |
| `npm run lint` / `format`         | ESLint / Prettier                                            |
| `npm run db:generate`             | Generate a Drizzle migration from `src/main/database/schema` |
| `npm run db:check`                | Validate migration consistency                               |
| `npm run build`                   | Typecheck + `electron-vite build`                            |
| `npm run dist:linux` / `dist:win` | Package on a native runner (used by CI)                      |
| `npm run build:win`               | Build the Windows installer from Linux (wine in Docker)      |
| `npm run build:all`               | Linux + Windows locally                                      |
| `npm run icons`                   | Regenerate icons from `resources/icon.svg`                   |
| `npm run clean`                   | Remove `out/`, `dist/` and the ESLint cache                  |

## Before opening a pull request

```bash
npm run lint && npm run typecheck && npm test && npm run db:check
```

CI (`.github/workflows/release.yml`) only runs on tags and manual dispatch, so run these locally.

## Conventions

- **Process boundaries**: the renderer never touches Node or Electron. A new capability means a channel in `src/shared/ipc-contract.ts`, a handler built with `createHandler` (Zod validation), the preload allowlist and a typed hook in `src/renderer/src/data/`. See [`ipc.md`](./ipc.md).
- **Main process**: separation of concerns (repositories, services, parsers, lexers). Keep logic that does not need `electron` in plain modules so it is testable in Node.
- **Subtitles**: only text nodes reach the LLM; the AST must reassemble the file byte for byte, preserving timestamps and tags. A parser change needs round-trip tests. See [`parsing.md`](./parsing.md).
- **External processes**: always through `ProcessRunner` (timeout, SIGTERM → SIGKILL, tracked for shutdown). Never call `child_process` directly.
- **Database**: change the schema in `src/main/database/schema`, run `npm run db:generate` and commit the migration. See [`database.md`](./database.md).
- **UI text**: no user-facing text from the Main, only error codes. Strings go through i18next (English is the source language, `pt-BR` is complete), typed keys. See [`renderer.md`](./renderer.md#i18n).
- **Secrets**: the OpenRouter key never leaves the Main process in clear text, and logs go through the redactor. See [`logging.md`](./logging.md).
- **Docs**: update the matching file in `docs/` in the same change. `README.md` and `README-pt.md` are for end users; technical detail belongs here.

## Tests

- Vitest, with property tests (`fast-check`) in the parsers.
- Renderer tests start with `// @vitest-environment jsdom` and use `test/fake-api.ts`, a typed `window.api` where every unmocked call rejects. See [`renderer.md`](./renderer.md#tests).
- Manifest changes are validated by `src/main/sidecars/manifest.schema.test.ts`.

## Releasing

See [`release.md`](./release.md).
