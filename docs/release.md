# Build and release

Targets: Linux x64 (AppImage + unpacked) and Windows x64 (NSIS installer + unpacked). No macOS.

## Packaging configuration (`electron-builder.yml`)

- `files`: `out/**` and `package.json` only.
- `asarUnpack`: `libsql`, `@libsql` and `7zip-bin` (native binaries cannot run from inside the asar). Per-platform `files` filters drop the other platforms' native packages.
- `extraResources`: `drizzle/` (migrations) and `resources/`.
- `npmRebuild: false`: libsql ships prebuilt binaries as per-platform optional dependencies.

## Local builds

```bash
npm run build:linux     # AppImage + dist/linux-unpacked
npm run build:win       # Windows installer, built on Linux through wine in Docker
npm run build:all
```

- `scripts/ensure-native-targets.mjs` installs the other platform's `@libsql/*` package with `--no-save --force` (npm only installs the host's optional dependencies). Rerun after a clean `npm install`; it is part of the `build:*` scripts.
- `scripts/build-win-docker.sh` runs `electron-builder --win` inside `electronuserland/builder:wine` with a cache volume (`bakasub-ebcache`).

## Icons

`resources/icon.svg` is the only source. `npm run icons` (`scripts/build-icons.sh`, needs librsvg and ImageMagick) regenerates `resources/icon.png` (512 px, the Linux window icon: Electron's `nativeImage` cannot read SVG), `build/icon.png` (1024 px) and `build/icon.ico` (16–256 px) for electron-builder (`buildResources: build`). The renderer's sidebar logo is `src/renderer/src/assets/logo.svg`; the README banners are `docs/bakasub-logo-{en,pt}.svg`.

## CI (`.github/workflows/release.yml`)

Triggers: `v*` tags and `workflow_dispatch` (artifacts only, no release).

1. `build` matrix (`ubuntu-latest`, `windows-latest`): verify tag == `package.json` version, `npm ci`, ESLint, `npm test` (vitest), `db:check`, `npm run dist:linux|dist:win`, smoke test, packaging.
2. Smoke test: start the unpacked binary for ~20 s and require `database ready` in `userData/logs/main.log` (proves libsql + migrations on the real OS).
3. A step validates `manifests/**` with the app's own Zod schema (`manifest.schema.test.ts`).
4. `release` job: verify the artifacts (including the updater metadata) exist, generate `SHA256SUMS.txt`, `gh release create --draft` (pre-release when the tag contains `-`).

Artifacts: `bakasub-<v>.AppImage`, `bakasub-<v>-linux-x64-unpacked.tar.gz`, `bakasub-<v>-setup.exe`, `bakasub-<v>-win-x64-unpacked.zip`, `SHA256SUMS.txt`, and the updater files `latest.yml` (Windows), `latest-linux.yml` and the installer's `*.blockmap` (the AppImage's blockmap is embedded, there is no separate file).

## Auto-update (electron-updater)

`electron-builder.yml` has a `publish` block (GitHub, `lsilvatti/bakasub`), which makes electron-builder embed `app-update.yml` in the build and generate `latest.yml`/`latest-linux.yml` (sha512 of the installer + blockmap for differential downloads). CI keeps `--publish never` and attaches those files to the release itself.

Flow: tag `vX.Y.Z` → CI creates a **draft** → review → **publish the draft by hand**. Publishing is the "go" of the update: the updater only sees published, non-pre-release releases (`allowPrerelease = false`), so a draft never reaches users. The Main only checks (silently once, `AUTO_CHECK_DELAY_MS` = 3 s after boot, or after the welcome wizard finishes on a first run, unless `updates.autoCheck` is off, or on demand; a new version opens the renderer's update dialog); it downloads on `app:download-update` and restarts on `app:install-update`. See the contract in [`ipc.md`](./ipc.md).

Limitations:

- **Windows (NSIS)** updates work without code signing as long as `publisherName` is not configured (electron-updater would otherwise compare the signature). SmartScreen still warns on the first manual download.
- **Linux** only updates when running as an **AppImage** (`process.env.APPIMAGE`). Dev builds, `linux-unpacked` and an AppImage launched without that variable report `unsupported` with `fallbackUrl` (the releases page).
- macOS, signing/notarization, beta channel and downgrade are out of scope.
- User data (database, `userData/bin`, settings) lives in `userData`, which the installer never touches.

### Testing an update end to end

1. Publish a release `vN` (e.g. 1.0.0) and install it (Windows installer or AppImage).
2. Bump `package.json` to `vN+1`, tag, wait for the draft, **publish it**.
3. In the installed app (`vN`): `app:check-update` → `available`; `app:download-update` → `downloaded`; `app:install-update` → relaunches as `vN+1`. Also try it with a job running (expect `UPDATE_JOBS_ACTIVE`, then `confirmJobs: true`).
4. Logs: `userData/logs/main.log` (scope `app`).

## Releasing a version

1. Work on `main` with a clean tree. Locally: `npm run lint`, `npm run typecheck`, `npm test`, `npm run db:check`, and a manual pass through `npm run dev` (onboarding, one translation, extract, mux).
2. If the schema changed, `npm run db:generate` and commit the migration in `drizzle/`.
3. Bump `version` in `package.json` (and `package-lock.json`): `npm version <x.y.z> --no-git-tag-version`. The tag must equal this version or CI fails on the first step.
4. Commit (`chore(release): vX.Y.Z`) and push to `main`.
5. Optional dry run: run the **Release** workflow by hand (`workflow_dispatch`) and download the artifacts; no release is created.
6. Tag and push: `git tag vX.Y.Z && git push origin vX.Y.Z`. A tag with `-` (e.g. `v1.1.0-rc.1`) creates a pre-release, which the updater ignores.
7. CI builds Linux and Windows, runs the smoke tests and creates a **draft** release with the artifacts, `SHA256SUMS.txt` and the updater metadata.
8. Open the draft on GitHub, check the artifacts and edit the generated notes, then **publish**. From this moment installed apps see the update.
9. If a published release is bad, mark it as a draft again (or delete it) so the updater stops offering it, and ship a fixed patch version. Never reuse a tag.

## Caveats

- `linux-unpacked` needs `--no-sandbox` or a setuid `chrome-sandbox` (`chown root` + `chmod 4755`).
- Validate the Windows NSIS update and the AppImage self-replace on real hardware before relying on them (unit tests mock `electron-updater`). Use the procedure above with a throwaway `vN+1`.
- Binaries are unsigned. Actions are pinned by major tag, not by commit SHA.
- Hosting sidecar binaries yourself would make you their distributor (GPL/LGPL source obligations); the current design only stores URLs and checksums.
