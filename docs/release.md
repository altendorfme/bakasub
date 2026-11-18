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

## CI (`.github/workflows/release.yml`)

Triggers: `v*` tags and `workflow_dispatch` (artifacts only, no release).

1. `build` matrix (`ubuntu-latest`, `windows-latest`): verify tag == `package.json` version, `npm ci`, ESLint, `npm test` (vitest), `db:check`, `npm run dist:linux|dist:win`, smoke test, packaging.
2. Smoke test: start the unpacked binary for ~20 s and require `database ready` in `userData/logs/main.log` (proves libsql + migrations on the real OS).
3. `release` job: verify the four artifacts exist, generate `SHA256SUMS.txt`, `gh release create --draft` (pre-release when the tag contains `-`).

Artifacts: `bakasub-<v>.AppImage`, `bakasub-<v>-linux-x64-unpacked.tar.gz`, `bakasub-<v>-setup.exe`, `bakasub-<v>-win-x64-unpacked.zip`, `SHA256SUMS.txt`.

## Caveats

- The Windows job and the release job have not run on GitHub yet; the Linux job steps were reproduced locally.
- `linux-unpacked` needs `--no-sandbox` or a setuid `chrome-sandbox` (`chown root` + `chmod 4755`).
- Binaries are unsigned. Actions are pinned by major tag, not by commit SHA.
- Hosting sidecar binaries yourself would make you their distributor (GPL/LGPL source obligations); the current design only stores URLs and checksums.
