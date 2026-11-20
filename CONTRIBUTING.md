# Contributing to BakaSub

Thanks for wanting to help. BakaSub is a small project under the [GPL-3.0](./LICENSE); contributions are welcome, within the limits below.

## Ways to help

- **Report a bug or suggest a feature**: see [`docs/reporting-issues.md`](./docs/reporting-issues.md). A clear report with a small sample file is already a big contribution.
- **Translate the interface**: the app ships in English and Brazilian Portuguese. A new language is a new folder `src/renderer/src/i18n/locales/<lang>/` with the same shape as `en`, plus the guides in `src/renderer/src/guides/<lang>/` (see [`docs/renderer.md`](./docs/renderer.md#i18n)).
- **Improve the docs** in `docs/` or the README.
- **Fix a bug or build a feature.** For anything beyond a small fix, **open an issue first** so we can agree on the approach before you spend time on it.

## Setting up

```bash
nvm use            # Node 26
npm install
npm run dev
```

Details, scripts and conventions: [`docs/development.md`](./docs/development.md). The structure of the code: [`docs/architecture.md`](./docs/architecture.md).

## Pull requests

1. Fork, then create a branch from `main` (`feat/short-name`, `fix/short-name`).
2. Keep the change focused. Unrelated refactors and formatting churn make review hard.
3. Add or update **tests** for what you change. Parser changes need round-trip tests; UI changes use the typed fake `window.api`.
4. Update the **docs** that describe the code you touched.
5. Run everything locally (CI does not run on pull requests):

   ```bash
   npm run lint && npm run typecheck && npm test && npm run db:check
   ```

6. If you changed the database schema, include the generated migration from `npm run db:generate`.
7. Open the pull request, describe **what** and **why**, link the issue and say how you tested it (manual steps count). Screenshots for UI changes.

### Commit messages

[Conventional Commits](https://www.conventionalcommits.org/), in English: `feat(ui): ...`, `fix(parser): ...`, `docs: ...`, `chore: ...`. One logical change per commit.

### Rules that are not negotiable

These come from how the app is designed; a pull request that breaks them will not be merged:

- The renderer only talks to the Main process through the allowlisted preload bridge (`contextIsolation`, no `nodeIntegration`). New channels go in `src/shared/ipc-contract.ts` with Zod validation.
- Only the _text_ of subtitles is sent to the LLM; the parser must rebuild the file with the original timestamps and tags.
- External tools run only through `ProcessRunner`, so cancellation and shutdown never leave zombie processes.
- Secrets never reach the renderer or the logs.
- ffmpeg and mkvtoolnix are not bundled or hosted by this project; the manifest only stores URLs and checksums. See [`docs/sidecars.md`](./docs/sidecars.md) to bump a version.

## Licensing of contributions

By submitting a contribution you agree that it is licensed under the GPL-3.0 like the rest of the project, and that you have the right to submit it. The maintainer may ask for a contributor agreement for larger contributions, because the project owner may also offer the software under other terms.

## Conduct

Be respectful and constructive. Harassment or personal attacks are not tolerated, and the maintainer may remove comments, close issues or block users that cross the line.
