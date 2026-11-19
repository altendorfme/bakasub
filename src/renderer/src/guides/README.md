# In-app guides

User-facing guides rendered inside BakaSub (the repository is private, so the app cannot link to it). They are bundled at build time through `import.meta.glob(..., { query: '?raw' })` in `guides.ts`.

```
guides/
  en/<id>.md       source language and fallback
  pt-BR/<id>.md    same files, translated
  guides.ts        registry: GUIDE_IDS, GUIDE_LANGS, getGuide(id, appLang), guideIdFromHref
  use-guide.ts     useGuide(id): the guide in the current i18next language
```

- The language follows the app language: exact match, then the same base language (`pt` → `pt-BR`), then English.
- Link between guides with a relative link (`[text](./openrouter-limits.md)`): it works on GitHub and the in-app viewer turns it into navigation (`guideIdFromHref`). Other links are external and go through `app:open-external` (allowlisted hosts only).
- Adding a guide: add the id to `GUIDE_IDS` and one file per language. Adding a language: add it to `GUIDE_LANGS` and translate every guide. `guides.test.ts` fails when a translation is missing, a file is not registered, or a cross-link points nowhere.
- Developer documentation stays in `docs/`; these files are written for end users.
