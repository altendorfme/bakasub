# IPC lifecycle

Source of truth: [`src/shared/ipc-contract.ts`](../src/shared/ipc-contract.ts). It must not import `zod` or `electron`, because the preload runs sandboxed and may only `require('electron')`.

## Window hardening

`src/main/window/create-main-window.ts`: `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true`, `webSecurity: true`. `will-navigate` is blocked (except the dev server origin) and `window.open` only forwards `http(s)` URLs to `shell.openExternal`.

## Request/response (`invoke`)

```
React hook ──► window.api.<domain>.<method>()          (preload, typed by BakaSubApi)
          ──► ipcRenderer.invoke(channel, payload)      (channel checked against INVOKE_CHANNELS)
          ──► ipcMain.handle ── createHandler
                 1. isTrustedSender(event.senderFrame.url)   dev: ELECTRON_RENDERER_URL prefix, prod: file://
                 2. options.input.safeParse(raw)             Zod; INVALID_INPUT on failure
                 3. options.handle(payload, event)
                 4. envelope: { ok: true, data } | { ok: false, error: { code, message } }
          ──► unwrap() in the renderer throws IpcCallError ──► TanStack Query error state
```

- `AppError` (see `src/main/errors.ts`) is mapped to its stable `code`; any other exception becomes `INTERNAL` and is logged with the `ipc` scope.
- The renderer never receives the Electron `event` object nor `ipcRenderer`.

## Push events (main → renderer)

`emitToRenderers(channel, payload)` (`src/main/ipc/events.ts`) sends to every live window. The preload exposes `window.api.events.on(channel, listener)`, which validates the channel against `EVENT_CHANNELS` and returns an unsubscribe function. Currently used by `sidecars:progress`.

## Adding a channel

1. Add the entry to `IpcInvokeContract` (or `IpcEventContract`) and to the matching allowlist array.
2. Add the method to `BakaSubApi` and wire it in `src/preload/index.ts`.
3. Create or extend a file in `src/main/ipc/handlers/` calling `createHandler(channel, { input?, handle })`, and register it in `src/main/ipc/register.ts`.
4. Consume it from a hook in `src/renderer/src/hooks/` using `unwrap()`.

## Current channels

| Channel                   | Request                                               | Response                                                   |
| ------------------------- | ----------------------------------------------------- | ---------------------------------------------------------- |
| `app:get-info`            | none                                                  | `AppInfo`                                                  |
| `app:check-update`        | none                                                  | `AppUpdateInfo`                                            |
| `sidecars:check`          | none                                                  | `SidecarReport`                                            |
| `sidecars:install`        | `{ tools: string[] }`                                 | `SidecarInstallResult`                                     |
| `sidecars:cancel`         | none                                                  | `{ cancelled: boolean }`                                   |
| `memory:stats`            | none                                                  | `MemoryStats`                                              |
| `memory:prune`            | `{ olderThanDays: 1 \| 3 \| 7 \| 30 \| 'all' }`       | `MemoryPruneResult` (`deleted` + stats after the prune)    |
| `settings:set-api-key`    | `{ apiKey: string }` (8–512 printable ASCII, trimmed) | `ApiKeyStatus` (write-only: the key is never returned)     |
| `settings:clear-api-key`  | none                                                  | `ApiKeyStatus`                                             |
| `settings:api-key-status` | none                                                  | `ApiKeyStatus` (`{ present, protection: 'os' \| 'none' }`) |
| event `sidecars:progress` | n/a                                                   | `SidecarProgress`                                          |

## Error codes

`NETWORK`, `INVALID_MANIFEST`, `CHECKSUM_MISMATCH`, `EXTRACT_FAILED`, `PROBE_FAILED`, `PROCESS_TIMEOUT`, `UNSUPPORTED_PLATFORM`, `SIDECAR_BUSY`, `SIDECAR_MISSING`, `UNKNOWN_TOOL`, `CANCELLED`, `MEMORY_BUSY` (prune while a job is running), `LLM_AUTH`, `LLM_CREDITS`, `LLM_BAD_REQUEST`, `LLM_UNAVAILABLE`, `LLM_UNKNOWN_MODEL`, `LLM_TOO_MANY_FAILURES` (translation layer, see [`llm.md`](./llm.md)), plus `FORBIDDEN`, `INVALID_INPUT`, `INTERNAL` from `createHandler`.
