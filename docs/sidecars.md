# Sidecar management

ffmpeg and mkvtoolnix are never bundled. Everything lives in `src/main/sidecars/`, which has **no dependency on `electron`**: `createSidecarModule()` receives paths, the 7za path, a consent gate, a progress emitter and a logger. This allows running the whole flow in plain Node.

## Manifests

Fetched by `ManifestClient` from `bakasub-manifests` (`src/main/config/remote.ts`), 10 s timeout, validated with Zod (`manifest.schema.ts`).

- `version.json`: `{ updatedAt, version }`, compared with `app.getVersion()` by `AppUpdateService` (notification only).
- `sidecar.json`: `tools[]` with `name`, `version`, `executableName` and `artifacts[platform][arch] = { url (https), sha256, archiveType: zip|7z|appimage, binaryRelativePath }`.
- Last valid manifest is cached in `userData/cache/manifests/`. The cache is used **only when the network fails**; an invalid remote manifest raises `INVALID_MANIFEST` instead of silently falling back.

## States

`SidecarManager.check()` never downloads. Per tool: `unsupported` (no artifact for platform/arch), `missing` (not registered or binary absent), `outdated` (registered version differs from the manifest: versions are pinned, not "at least"), `ok`.

## Install flow

```
sidecars:install { tools }
  └─ mutex (SIDECAR_BUSY if another install is running)
  └─ load manifest, compute pending tools (state != ok)
  └─ group by sha256 into InstallUnits (mkvextract+mkvmerge share one)
  └─ ConsentGate.confirmDownload()   ← native dialog in Main, default = Cancel
        declined ─► { outcome: 'declined' }, nothing touches the disk
  └─ per unit:
       1. reuse bin/archives/<sha>/ if all binaries already exist
       2. downloadVerified()  → bin/downloads/<sha>.<ext>
       3. extract into bin/archives/.partial-<sha>-<uuid>
       4. tryPrune(): copy only needed files, probe the copy, adopt it (fallback: full tree)
       5. rename → bin/archives/<sha>/
       6. probeAll(): chmod + run `--version` (`-version` for ffmpeg)
       7. InstalledRegistry.update() → bin/installed.json (atomic write)
  └─ collectGarbage(): drop archives no tool references; drop downloads older than 7 days
```

Cancellation (`sidecars:cancel` or shutdown) aborts the shared `AbortController`, which reaches `fetch` and the `ProcessRunner`.

## Download (`downloader.ts`)

- Streams to `<dest>.part`; SHA-256 is computed on the fly.
- Resume: a sidecar `<dest>.part.json` stores a validator (strong ETag or `Last-Modified`). The next attempt sends `Range: bytes=N-` + `If-Range`. `206` with a matching `Content-Range` appends (the existing bytes are re-hashed first); `200` restarts from zero; `416` discards the part.
- Retry: up to 4 attempts, backoff 1 s → 8 s, only for `NETWORK` errors. Cancellation and network failures **keep** the `.part`; `CHECKSUM_MISMATCH` deletes it.
- 30 s idle timeout, redirects to `http` are refused, truncated bodies are detected by length.

## Extraction and pruning

| Archive     | Extractor                                                                | Prune rule                                                                                                  |
| ----------- | ------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------- |
| `zip`, `7z` | `7za` from `7zip-bin` (unpacked from the asar; `chmod` applied on Linux) | binaries + sibling `*.dll`                                                                                  |
| `appimage`  | `./x.AppImage --appimage-extract` (no FUSE)                              | binaries + transitive `DT_NEEDED` closure resolved in `usr/lib` (`elf-needed.ts`), symlink chains preserved |

Measured: MKVToolNix AppImage 153 MB → 55 MB; Windows MKVToolNix 260 MB → 50 MB; ffmpeg 315 MB → 101 MB. `mkvmerge`/`mkvextract` link `libQt6Core` (and ICU), so removing Qt wholesale breaks them; the closure is computed from the ELF headers rather than `ldd`.

## Runtime usage

```ts
const { path, env } = await sidecars.resolve('mkvmerge')
```

`env` is mandatory for AppImage-derived binaries: without `LD_LIBRARY_PATH=<root>/usr/lib` they fail to load their libraries. Spawn through `ProcessRunner` (timeout, SIGTERM → SIGKILL after a grace period, stderr logged, children tracked and killed by `disposeAll()` on shutdown).

## Layout under `userData/bin`

```
installed.json                 tool → { version, archiveSha256, archiveType, binaryRelativePath, installedAt }
archives/<sha256>/             pruned, deduplicated contents
downloads/<sha256>.<ext>[.part|.part.json]
```

## Known limitations

- Trust root is the manifest repository: whoever can change `sidecar.json` can change what is executed. Keep the branch protected; manifest signing is a possible future step.
- Upstream links must be versioned. Rolling links (e.g. `ffmpeg-release-essentials.7z`) break the pinned SHA-256 on the next upstream release (safe failure: `CHECKSUM_MISMATCH`).
- Windows execution was verified with the pruned binaries under wine; native Windows execution is covered by the CI smoke test only for the app itself, not for sidecar installation.
