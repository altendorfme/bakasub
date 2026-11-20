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

## Foundation

- **UI primitives** (`components/ui/`, shadcn style on our tokens, Radix underneath): `Button`, `Badge`, `Card`, `Input`/`Textarea`, `Field`/`Label` (wires `aria-describedby`/`aria-invalid`), `Select`, `Checkbox`, `Switch`, `Dialog`, `Popover`, `Tooltip` (needs the root `TooltipProvider`), `Command` (cmdk, for searchable pickers), `Tabs`, `Progress` (0..1, indeterminate without a value), `Toaster` (sonner; call `toast` from `sonner`).
- **Common components** (`components/common/`): `ErrorBoundary` (one around the router, one per page keyed by the path; logs through `reportError(err, 'boundary')`), `GuideView` (bundled guide in the app language; guide links call `onNavigate`, other links go through `app:open-external`; no raw HTML), `WaitLabel` (`progress.waiting` with a live countdown, `lib/use-countdown.ts`).
- **Data hooks** (`data/`): `useSettings` / `useUpdateSettings` / `useResetSettings` (the Main returns the full snapshot, which replaces the cache), `useApiKeyStatus` / `useSetApiKey` and `useTmdbKeyStatus` / `useSetTmdbKey` (`null` clears; a new OpenRouter key invalidates the catalog and the free quota), `useModels`, `useFreeQuota`, `isFreeModel` (same rule as the Main), `usePresets`, `useJobs`.
- **Language**: setting `ui.language` (`en`, `pt-BR`, `null` = system). `useLanguageSync` (in the root `EventBridge`) switches i18next and `<html lang>`; `resolveAppLanguage` maps the request to a supported language (exact, base language, English). UI strings without a translation fall back to English (both `en` and `pt-BR` are complete).

## Onboarding

Route `/welcome`, outside the shell (no sidebar). The shell layout route (`id: 'shell'`) has a `beforeLoad` guard: while the API key, the default model or the default target language is missing (`isOnboarded`), every page redirects there. The guard uses `ensureQueryData` with the same query options as the hooks (`settingsQuery`, `apiKeyStatusQuery`); an IPC failure lets the user in rather than locking the app.

Steps, saved as they go (no "submit at the end"): OpenRouter key (`KeyForm`, checked by the Main in `GET /key` before saving: `LLM_AUTH` / `NETWORK`), models (`ModelPicker`), languages (`LanguagePicker`), video tools (sidecar install, optional), TMDB key (optional). The page opens at the first required step that is not done; later required steps unlock in order. "Start translating" goes to `/translate`.

Reusable pieces built here: `KeyForm` (write-only secret: saved / replace / remove, no-keyring warning, guide link), `GuideDialog` (guide in a dialog with back navigation between guides), `ModelPicker` (catalog search, favorites first, price per 1M tokens, free / reliable JSON / moderated badges, default), `LanguagePicker` (curated BCP-47 list in `lib/languages.ts`, names from `Intl.DisplayNames` in the UI language), `useListWithDefault` (favorites + default as one optimistic value; the same rule as `PreferencesService`, in `lib/favorites.ts`, so a patch never conflicts).

Tests: `test/setup-dom.ts` adds the jsdom gaps cmdk/Radix need (`ResizeObserver`, `scrollIntoView`, pointer capture); `test/fixtures.ts` has the settings of an onboarded user.

## Translate a file

`pages/translate/`. The flow is a pure reducer (`wizard-state.ts`: steps, validation, automatic track choice, `buildJobRequest`), tested without React; the page only renders the current step.

- **File**: drop zone (`window.api.files.pathFor`) or the native dialog; the type comes from the extension (`sourceKindOf`, `src/shared/file-types.ts`, shared with the Main's path guard). A subtitle file goes through `translate` and has no track step and no mux options; a video goes through `pipeline`.
- **Track** (video): `media:probe`; image-based and unsupported tracks are listed but disabled with the reason; a track is preselected (`pickTrack`: first preferred source language, full over forced). Attached fonts are mentioned.
- **Preset & context**: preset with its details (media type, temperature, style, glossary size), model from the favorites only, target language from `translation.targetLangs`, both prefilled with the defaults (left unset in the request so the Main applies them), notes (≤ 4,000).
- **Output**: folder (default next to the source) and, for videos, `setDefault` / `keepOriginalSubtitles` / `alsoWriteSubtitle`.
- **Job**: created with `confirmBeforeTranslate: true`. `JobDetail` follows it through `useJob` (patched by `jobs:progress`): `awaiting-confirmation` shows `PreflightReview` (lines, requests, tokens, cost range or "free"/dynamic price, approximate tokenizer, model and catalog date, free-quota warning, `CoverageList`), then `JobProgress` (step, lines, part, cached, cost, `WaitLabel`), then `JobResult` (outputs, cost, untranslated lines, warnings, or the localized error). These live in `components/jobs/` and are shared with the queue through `JobDetail`.

The wizard state is local to the page: leaving the page resets it (the job keeps running and shows in the queue).

## Media context panel

`components/media/`, shown above the preset step of the wizard. `MediaChoice` (`media-choice.ts`) lives in the wizard state: `ref`, `auto` (recognized from the file name), `season`/`episode`, `include`, `seeded`.

- `media:identify` (file name only) seeds the choice once per file; a user change is never overwritten. States: identifying, `matched` ("Recognized from the file name"), `not-found` (search above), `offline` or an IPC error (continue without context), `no-key` (one line, the TMDB guide and `KeyForm` on demand; saving the key invalidates the media queries).
- Title field (`TitleSearch`): TMDB search debounced 350 ms in a popover (cmdk without client filtering), poster thumbnails, Enter picks the first result.
- Details from `media:lookup` (a cache hit in the Main): poster, year, kind, runtime, genres, synopsis. A movie picked for a file with `SxxEyy` shows a warning.
- Series: editable season/episode (`EpisodeFields`) pre-filled from the file name; "From the file name" uses the same violet as "Recognized from the file name"; a changed number says what the file name had; absolute anime numbering asks for season/episode; the episode title and synopsis load for the numbers.
- "Include these details" (dims the details when off). The request carries `media` only when included, with the episode only for a series with both numbers (`buildJobRequest`).
- "Metadata and images from TMDB" in the panel (TMDB terms).

Artwork backdrop (`Backdrop`): the chosen title's `backdropUrl` behind the wizard, and the job's frozen media behind the queue inspector. `Job.media` (`JobMediaSummary`: title, kind, year, poster, backdrop, episode, no synopsis) is derived by the Main from the persisted spec (`src/main/jobs/media-summary.ts`), so the queue never calls TMDB. The image fades in at 55% under a gradient; panels on top stay `bg-card/92`.

### Wizard navigation and summary

- The step bar (`step-bar.tsx`) is centered, with arrows between steps; done steps show a check. `furthest` in the wizard state records the furthest step reached: any reached step can be opened from the bar (forward too) without "Continue", as long as every step before it is still valid (`canGo`). Changing the file resets `furthest` and shows "The file changed, so the next steps need another look."
- `WizardSummary` (right column, sticky) lists file, track, preset, model, target language, media and output; each row opens its step when reachable.
- `existingTarget` (`lib/existing-subtitle.ts`) detects a subtitle already in the target language (a video track, compared by base language with ISO 639-2 codes mapped, or a subtitle file named for it). The summary warns, and "Estimate cost" asks "Translate anyway?" before creating the job.
- A job whose lines are all cached still stops for review (see [`preflight.md`](./preflight.md)).

## Queue and status bar

`pages/queue/`. Workspace layout (prototype variant D): the job list on the left (tabs All / Active / Needs you / Done with counts, `matchesFilter` in `data/jobs.ts`; "Needs you" = awaiting confirmation, failed, interrupted), the selected job on the right. The selection is the `?job=` search param, so the wizard's "Open in Queue" lands on the job and the browser history keeps it.

The inspector is `JobDetail` (`components/jobs/`), the same component the wizard shows after creating a job: header (kind, batch, status, attempt, dates), preflight review / live progress / result, and the actions that apply to the state (cancel with the billing hint, confirm, retry for failed/cancelled/interrupted, remove for terminal jobs). `JobError` turns error codes into actions: `LLM_DAILY_LIMIT` shows the local time of 00:00 UTC, `LLM_CREDITS` opens OpenRouter's credits page, `SIDECAR_MISSING` installs the missing tools; `interrupted` explains that a retry resumes from the step that stopped. Only codes are used, never the Main's message.

Status bar: running/queued/awaiting counts and average progress, the lane cooldown countdown (latest `waiting.reason === 'cooldown'` among jobs, `cooldownUntil`), the cost of this session (`sessionCost`: jobs created since the renderer started; final cost when finished, cost so far when running), tools and API key.

## Settings

`pages/settings/`, one tab per section, every field saving on its own (`useSetting(key)` → `[value, set]`, errors from the Main as a toast). `NumberSetting` saves on blur/Enter only when the value is in range (otherwise it keeps the text and shows the range); `nullable` fields save `null` when cleared ("Always ask", "No limit").

- **General**: app language (system / each language in its own name), default preset, jobs at the same time, auto-confirm threshold, preferred source languages (ordered chips: move up, remove, add), detailed logs.
- **Keys**: `KeyForm` for OpenRouter (cannot be removed: the app needs it) and TMDB (removable), each with its guide.
- **Translation cache**: size on disk, line count, least recently used date; prune by age or clear all, disabled with an explanation while a job is active (`MEMORY_BUSY` never reaches the user).
- **Video tools**: `ToolsPanel` (`components/sidecars/`, shared with the onboarding) and a re-check.
- **Advanced**: free-model quota today and the detected tier, tier override, requests per minute (free / paid), attempts, waits in seconds (stored in ms), extra chunk rounds, "Restore defaults" (`settings:reset` with the advanced keys only), and the limits guide.
- **About**: version, platform, update check, data folder, the full TMDB notice.

## Models and Languages

Thin pages over the onboarding pickers (`ModelPicker`, `LanguagePicker`, `useListWithDefault`). Models adds "Refresh list" (`models:list { force: true }`, bypassing the Main's 24 h cache), the catalog date, the free-model requests left today, and a warning listing favorites that are no longer in the OpenRouter catalog (the picker cannot show them) with a "Remove" each; removing the default promotes the next favorite.

## Presets

`pages/presets/`. Built-in and custom presets on the left (checkbox per preset to export), the editor on the right. Built-ins are read-only with "Duplicate" (the copy opens selected, "Copied from …"). The form keeps text drafts (`preset-draft.ts`: same limits as the Main's `PresetInputSchema`, validated before sending, errors shown after the first save attempt), trims on save and drops empty optional glossary fields. Media type is free text with suggestions; temperature 0 to 2. The glossary editor needs a term plus a translation or a rule per row (≤ 500 rows). Delete asks first; `PRESET_IN_USE` and `PRESET_NAME_TAKEN` come back as toasts. Import asks the name-conflict policy (rename / skip), opens the native dialog and lists what was imported and what was skipped with the reason.

## Extract and Mux

Single-form pages that create one job and then show it with `JobDetail` (like the wizard). Shared pieces moved out of the wizard: `FileDrop` (`components/files/`, `accept` limits the kinds), `OutputFolder`, and `TrackPicker` (`components/media/`, `single` for translate, `multi` for extract, preselects with `pickTrack` from `lib/tracks.ts`).

- **Extract**: video, one or more tracks, output folder → `{ kind: 'extract', trackIds }`.
- **Mux**: video, subtitle files (native dialog, several at once, duplicates ignored, ≤ 32), per row: language (guessed from the file name suffix by `guessSubtitleLanguage`, `lib/subtitle-lang.ts`: skips `forced`/`sdh`/…, accepts only real languages so `Dr.Who.srt` is not "who"), track name (defaults to the language name), at most one default; options `setDefault` / `keepOriginalSubtitles`. "Create video" stays disabled until every row has a language. Row logic is pure (`pages/mux/mux-rows.ts`).

## Logs

`pages/logs/`. The last 1,000 lines (`logs:tail`) and then live lines (`useLiveLogs`: `logs:watch` on while the page is mounted, off when leaving; at most 2,000 lines kept). Filters are local (level, area, job) so changing them never drops live lines; `?job=` filters to one job and `JobDetail` links there ("Show logs"), and each line with a `jobId` links back to the queue. Details (stderr, HTTP bodies) are collapsible. Follows the bottom while live. "Open log folder" and "Export logs" use the Main's channels.

## Field help, labels and links

- `HelpTip` (`components/ui/help-tip.tsx`): a "?" next to a label with a tooltip explanation (hover or keyboard focus; also the accessible description). `Field` and `SettingRow` take a `help` prop. Tooltips carry their own provider, so they work in dialogs and tests.
- `Button` defaults to `type="button"`: a button inside a `<form>` (the glossary editor's "Add entry" and remove) must never submit it. Submit buttons say `type="submit"`.
- `Field` uses `content-start`, so a taller neighbour (a two-line hint, an error) never pushes the label and control down.
- Built-in presets and the four known media types are shown in the app language (`lib/preset-labels.ts`); custom names stay as typed; a duplicated preset gets a free "<name> (copy)" name in the app language.
- Language names start with a capital ("Português (Brasil)").
- Guides render GFM tables (`remark-gfm`); in a dialog the guide's own title is hidden. New guide: `choosing-models` (how to read prices, context, Reliable JSON, moderation, and how to choose), linked from Models and the onboarding.
- Models: sort (OpenRouter order, price up/down, context) and filters (provider, free only, Reliable JSON, not moderated, favorites only) in `lib/model-list.ts`; favorites stay on top.
- Queue: the job list is resizable with the mouse or arrow keys (`ResizableAside`, width kept in localStorage), names truncate with an ellipsis (full name on hover), and jobs with TMDB context show the title and episode below.
- Sidebar: the logo (`assets/logo.svg`), Translate on its own at the top (larger, highlighted by colour and a gradient when active), then the Work and Manage groups with more spacing.
- Status bar: queue counts and progress, the lane cooldown, the session cost, the installed tool versions (link to Settings → Video tools), the OpenRouter and TMDB key status (link to Settings → Keys), and the app version with an update hint (link to Settings → About). Settings keeps its tab in the URL (`?tab=`).
- Models: one price range (USD per 1M tokens) that both the input and the output price must fit (`inPriceRange`, `priceStops` in `lib/model-list.ts`); with the upper end at the top, dynamic-price models stay listed. Rows never truncate: names, ids and prices wrap. On the Models and Languages pages the last favorite/language cannot be removed (the app needs a default; the onboarding still allows it while choosing).
- Everything clickable shows the pointer cursor (Tailwind v4 removed it for buttons; restored in `styles/main.css`). Guides take the full width of their container.
- About: version, author, "Check for updates", repository and "Buy me a coffee" (both hosts are in the Main's external-link allowlist).

## Polish

- **Locales**: `i18n/locales/<lang>/{common,errors}.ts`. Every non-English file is typed `LocaleShape<typeof en>` (`i18n/locale-shape.ts`), so a missing or extra key fails the typecheck, and `i18n/locales.test.ts` checks that every string keeps the same `{{variables}}` as English. Adding a language: add it to `APP_LANGUAGES` (contract), translate both files and every guide, register it in `i18n/index.ts`. The language picker (`LanguageSelect`) is in Settings and on the first onboarding screen.
- **Notifications**: `lib/notify.ts`, called from `useJobEvents` when a job changes to completed / with warnings / failed / awaiting confirmation while the window is not focused (web `Notification`, supported by Electron; the Main sets the AppUserModelId on Windows). Clicking it focuses the window on that job in the queue.
- **Bundle**: screens are `React.lazy` chunks (`app/screens.ts`, rendered in `Suspense` by the router), the guide viewer (react-markdown) loads only when a guide opens, and the renderer build is minified (`electron.vite.config.ts`; electron-vite leaves it off by default). Entry chunk ≈ 380 kB (was ≈ 2.2 MB unminified, single chunk).
- **Accessibility**: labelled controls (`Field`, `aria-label` on icon buttons), `aria-current` on steps and selections, `role="alert"`/`status`/`log` where state changes, visible focus everywhere, and `prefers-reduced-motion` turns off spinners, pulses and transitions. Not yet audited with a screen reader on each OS.

## In-app guides

User guides (OpenRouter key, limits and retries, TMDB key) live in `src/renderer/src/guides/<lang>/<id>.md`, outside `docs/` (which is for developers), with one file per language (`en`, `pt-BR`). `guides.ts` bundles them with `import.meta.glob('?raw')`; `useGuide(id)` returns the guide in the current i18next language (exact, then base language, then English). It uses `i18n.language`, not `resolvedLanguage`, so a guide can already be shown in a language the UI does not have yet. Links between guides are relative `.md` links (`guideIdFromHref` turns them into in-app navigation). `guides.test.ts` fails when a translation is missing or a cross-link is broken. Details: [`guides/README.md`](../src/renderer/src/guides/README.md).

## Theme

Dark only (`color-scheme: dark`), pink (`--primary`) and violet (`--violet`) on a deep plum background. Tokens use shadcn/ui names (`background`, `card`, `muted`, `primary`, `ring`…) so its components drop in unchanged; `bg-brand` is the pink→violet gradient. Panels over media artwork use `Card` (`bg-card/92` + blur): semi-opaque, never fully transparent. Icons: `lucide-react`.

## Tests

`vitest` + Testing Library. Renderer test files start with `// @vitest-environment jsdom`. `test/fake-api.ts` installs a typed `window.api` where every unmocked call rejects (a test cannot pass on an accidental channel) and `emit()` pushes IPC events.

## Backend gaps found by the UI design

Tracked in [`frontend-requirements.md`](./frontend-requirements.md#9-backend-gaps-from-the-ui-design).
