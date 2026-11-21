# Native notifications

The Main process emits OS notifications (`electron.Notification`) for events that need the user while BakaSub is in the background. The renderer never creates notifications; it only receives the navigation target of a click.

## Modules (`src/main/notifications/`)

| File                      | Role                                                                                                                                                                                      |
| ------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `notification.service.ts` | `NotificationService`: `isSupported()`, `notify({ kind, title, body, target })`. Gating (focus → settings → platform support), click handling, references kept alive. No Electron import. |
| `activity-notifier.ts`    | `ActivityNotifier`: turns `jobs:progress` events and `AppUpdateStatus` transitions into requests. Detects state transitions, aggregates batches, dedupes versions.                        |
| `notification-texts.ts`   | The only notification copy, in `en` and `pt-BR` (language = `ui.language`, else the OS locale, same rule as the sidecar consent dialog).                                                  |
| `create-notifications.ts` | Electron adapter (composition root only): `Notification`, the main window port (`isFocused` / `reveal`), the Linux icon.                                                                  |

Wiring lives in `src/main/index.ts`: the job module's `emit` forwards each event to `emitToRenderers('jobs:progress')` **and** `notifier.onJobEvent`; `createAppUpdater({ onStatus })` forwards each updater transition to `notifier.onUpdateStatus`.

## Rules

- **Never with the main window focused** (visible, not minimized, OS focus), errors included: the UI already shows the event.
- **Settings**: `notifications.enabled` (general) and one switch per category, `notifications.job`, `notifications.batch`, `notifications.update`. A category only applies with the general switch on. All default to `true`. Read on every notification, so a change applies immediately.
- **Single jobs** (`batchId === null`): one notification per transition into `completed`, `completed-with-warnings`, `failed` or `awaiting-confirmation`. `jobs:progress` repeats the status on every progress tick, so the notifier keeps the last status per job and ignores repeats. A retry (`queued`/`running`) re-arms it.
- **Batches**: jobs that belong to a batch never notify on their own. After each transition of one of its jobs the notifier reads the batch (`BatchService.get`):
  - `state: 'finished'` → one "Batch finished" (or "with failures" when `failed + interrupted > 0`) with `ok of total` in the body. A batch whose jobs were all cancelled is not notified (the user did it).
  - not finished, no `queued`/`running` job and at least one `awaiting-confirmation` → one "Confirm the batch cost".
  - A job of the batch going back to `queued`/`running` (retry, confirmation) re-arms both.
  - Handling is serialized (a promise chain), so two jobs finishing together see the batch once.
- **Updates**: one notification per new version (`state: 'available'`), even when suppressed by focus: the in-app dialog already announced that version, so it never notifies twice.
- **Failures never propagate**: a platform error, a settings read failure or a lookup of a removed job is logged (`app` scope) and dropped; jobs and the app keep going.

## Click → navigation

The click restores/shows/focuses the main window (recreating it on macOS when every window was closed) and sends the `app:navigate` event (`NavigationTarget`) to it, after `did-finish-load` when the window is new or still loading. The renderer (`app/navigation-events.ts`, mounted in `EventBridge`) maps the target:

| Target                               | Route                                                                                                             |
| ------------------------------------ | ----------------------------------------------------------------------------------------------------------------- |
| `{ kind: 'job', id }`                | `/queue?job=<id>`                                                                                                 |
| `{ kind: 'batch', id }`              | `/translate?batch=<id>`: `TranslateEntry` switches to the several-files mode, opens that batch, clears the search |
| `{ kind: 'settings', tab: 'about' }` | `/settings?tab=about`                                                                                             |

Live `Notification` objects are kept in a set until `click`/`close`/`failed`: otherwise the GC may collect them and the click is lost.

## Platforms

- **Windows**: toasts require the AppUserModelId to match the installed shortcut. `electronApp.setAppUserModelId('com.bakasub.app')` runs at `ready` and equals `appId` in `electron-builder.yml` (in dev the toolkit uses `process.execPath`). The toast shows the app icon.
- **Linux**: goes through the desktop's notification server (libnotify/D-Bus); the payload carries `resources/icon.png`. Whether the click is delivered depends on the server (GNOME, KDE and most others support the default action).
- **macOS**: the app icon is used; the user may have to allow notifications in System Settings on first use.

Out of scope: action buttons, custom sounds, an in-app notification center, tray badges.
