# Renderer

React 19 + Vite, inside the sandboxed renderer. It only talks to the Main through `window.api` (see [`ipc.md`](./ipc.md)). The visual design was settled with a throwaway prototype (branch `prototype/ui-variants`, `npm run prototype`); production code is written from scratch, not copied from it.

```
src/renderer/src/
  app/          App (providers + IPC event bridge), router, page registry (PAGES, NAV)
  components/
    layout/     AppShell (sidebar + outlet + status bar), Sidebar, StatusBar
    ui/         shadcn/ui-style primitives (Button, Card, Badge, …)
  data/         TanStack Query hooks per domain + query-keys
  guides/       in-app user guides: <lang>/<id>.md, getGuide/useGuide
  i18n/         i18next instance, locales/en/*, typed keys
  lib/          ipc (unwrap/IpcCallError), query-client, cn()
  pages/        screens (placeholders until built)
  test/         fake window.api for component tests
```

## Routing

TanStack Router, routes defined in code (`app/router.tsx`), **hash history** because the packaged renderer loads from `file://`. Tests use a memory history. `/` redirects to `/translate`. The router context carries the `QueryClient` for future loaders.

## Data layer

- One hook module per IPC domain (`data/jobs.ts`, `data/sidecars.ts`, `data/settings.ts`, `data/app.ts`). Every key comes from `data/query-keys.ts` (`qk`), hierarchical so `qk.jobs.all` invalidates the list and every detail.
- `unwrap()` turns the `{ ok, error }` envelope into a thrown `IpcCallError { code }`, so TanStack Query sees failures as errors.
- **No polling and no global store.** IPC events patch the cache directly: `jobs:progress` → `applyJobProgress` updates the list and the detail with `setQueryData`; a job that is not cached (e.g. created by a batch) invalidates the list; terminal states invalidate `qk.jobs.all` because the event carries no `result`/`error`. The subscription lives once in `App` (`EventBridge`).
- Navigation and filter state belong in the URL (search params), not in a store.

## i18n

i18next with **English as the default and source language**. Namespaces: `common` (UI text) and `errors`. Keys are typed (`i18n/i18next.d.ts`), so a typo is a compile error.

- The Main never sends user-facing text. `errorMessage(err)` (`i18n/error-message.ts`) maps `IpcCallError.code` to `errors:<code>`; unknown codes and non-IPC errors fall back to `errors:unknown` with the code. The raw `message` is never shown (it may carry paths or HTTP details).
- `src/shared/error-codes.ts` is the single list of codes (`APP_ERROR_CODES` from `AppError`, plus `FORBIDDEN`/`INTERNAL` from `createHandler`). `locales/en/errors.ts` `satisfies Record<ErrorCode, string>`: a new backend code without a message fails to compile, and a test checks every code at runtime.
- Adding a language: a new `locales/<lang>/` folder with the same shape as `en`.

## In-app guides

User guides (OpenRouter key, limits and retries, TMDB key) live in `src/renderer/src/guides/<lang>/<id>.md`, outside `docs/` (which is for developers), with one file per language (`en`, `pt-BR`). `guides.ts` bundles them with `import.meta.glob('?raw')`; `useGuide(id)` returns the guide in the current i18next language (exact, then base language, then English). It uses `i18n.language`, not `resolvedLanguage`, so a guide can already be shown in a language the UI does not have yet. Links between guides are relative `.md` links (`guideIdFromHref` turns them into in-app navigation). `guides.test.ts` fails when a translation is missing or a cross-link is broken. Details: [`guides/README.md`](../src/renderer/src/guides/README.md).

## Theme

Dark only (`color-scheme: dark`), pink (`--primary`) and violet (`--violet`) on a deep plum background. Tokens use shadcn/ui names (`background`, `card`, `muted`, `primary`, `ring`…) so its components drop in unchanged; `bg-brand` is the pink→violet gradient. Panels over media artwork use `Card` (`bg-card/92` + blur): semi-opaque, never fully transparent. Icons: `lucide-react`.

## Tests

`vitest` + Testing Library. Renderer test files start with `// @vitest-environment jsdom`. `test/fake-api.ts` installs a typed `window.api` where every unmocked call rejects (a test cannot pass on an accidental channel) and `emit()` pushes IPC events.

## Backend gaps found by the UI design

Tracked in [`frontend-requirements.md`](./frontend-requirements.md#9-backend-gaps-from-the-ui-design).
