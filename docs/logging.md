# Logging

`electron-log` in the Main process, configured in `src/main/logging/logger.ts`. Everything else in `src/main/logging/` is pure and tested in plain Node.

## File format and rotation

- `userData/logs/main.log`, **one JSON object per line** (`LogEntry`: `time`, `level`, `scope`, `msg`, `jobId?`, `detail?`). The console keeps electron-log's readable format.
- Rotation at 5 MB keeping **5 files** (`main.log`, `main.1.log` … `main.4.log`), by `rotateLogs` as electron-log's `archiveLogFn`.
- Level: setting `logs.level` (`info` default, `debug` = "Verbose logging" in Settings), applied immediately through `setLogLevel`. Console: `debug` in development, `warn` when packaged.
- Scopes: `app`, `db`, `ipc`, `sidecar`, `llm`, `jobs`, `renderer`.
- `toLogEntry`: the first string argument is the message; any other argument becomes `detail` (an `Error` keeps its `code` and stack). `detail` is capped at 16,000 chars. Lines written before the JSON format are still read (best effort) by `parseLogLine`.

## Job id on every line

`JobManager` runs each job inside `runWithJob(id, …)` (`AsyncLocalStorage`). The electron-log hook runs synchronously inside the log call, reads `currentJobId()` and stores it on the message, so everything logged while a job runs (LLM retries, sidecar stderr, memory writes) carries `jobId` without passing a logger through the modules.

## Secrets

A single `Redactor` (`redact.ts`) runs in an electron-log hook for **every** transport, before anything is written or sent:

- patterns: `sk-or-…`, `Bearer …`, JWT-shaped tokens, `api_key=`/`key=`/`token=` query params;
- registered secrets, matched verbatim: the OpenRouter key is registered at boot and whenever it is saved (values shorter than 8 chars are ignored).

Exports are redacted again and the home folder becomes `~` (raw, `/` and JSON-escaped `\\` spellings, case-insensitive).

## IPC

| Channel            | Purpose                                                                                                             |
| ------------------ | ------------------------------------------------------------------------------------------------------------------- |
| `logs:tail`        | last N entries (1–2000, default 500), oldest first, across the rotated files; filters `minLevel`, `scopes`, `jobId` |
| `logs:watch`       | turns the live feed on/off (the Logs screen calls it on mount/unmount)                                              |
| `logs:entry` event | batches every 250 ms (at most 500 per batch, newest kept), only while watching                                      |
| `logs:open-folder` | `shell.openPath` on the logs folder                                                                                 |
| `logs:export`      | native save dialog; all files oldest first, redacted, home as `~`; `{ path: null }` when cancelled                  |
| `logs:report`      | renderer errors into the `renderer` scope; 20 per minute, then `{ accepted: false }`                                |

The live feed is fed by the same hook, only for messages that passed the **file** transport's level, so it shows exactly what the file gets. A failing emit (window closed) never breaks logging.

## Logs screen

`useLiveLogs(live, jobId)` (`src/renderer/src/data/logs.ts`) loads the history once, then appends `logs:entry` batches while **Live** is on. History is always requested with `minLevel: 'debug'`: level and area are filtered on screen, so changing them never drops a line. At most 2000 lines are kept on screen.

- **General view**: `logs:tail({ limit: 1000, minLevel: 'debug' })`, the newest lines of every job.
- **One job** (`/logs?job=<id>`, the job's "View logs" link): `logs:tail({ jobId, limit: 2000, minLevel: 'debug' })`. The Main filters by `jobId` **before counting**, across every rotated file, so an old job (or a small one followed by large ones) comes back whole instead of being whatever survived in the global 1000-line tail. Live batches are filtered by the same `jobId` on arrival. A chip shows the job's source file (short id when the job no longer exists) and clears the filter (`navigate({ search: {} })`), which reloads the general tail; the live feed stays on.
- Live lines that arrive while the history is loading are buffered and appended after it (lines not newer than the last history line are skipped as already loaded).
- Empty states: "Reading the log…" while loading; for a job with no lines at all, a specific message (rotated out after 5 × 5 MB, or the files were deleted); "No log lines match the filters" when level/area hide everything.

**Limitation:** only lines carrying `jobId` belong to a job. Anything logged outside `runWithJob` (an `ipc` error from the handler that started or cancelled the job, a renderer report) is not shown in the job view even when it is about that job; it is in the general view. The screen does not try to guess.

## Renderer errors

`installGlobalErrorReporting()` (`src/renderer/src/lib/report-error.ts`) sends `window.onerror` and `unhandledrejection` to `logs:report`; the React error boundary (shell) uses `reportError(err, 'boundary')`. Reporting never throws back into the app.
