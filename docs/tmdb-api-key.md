# Getting a TMDB key

BakaSub uses [The Movie Database (TMDB)](https://www.themoviedb.org/) to recognize what you are translating and give the AI the title, genres and synopsis (and the episode synopsis for series). It is **optional**: without a key, translation works the same, just without this context.

The key is free for personal, non-commercial use and takes a couple of minutes.

## Steps

1. **Create an account** at [themoviedb.org/signup](https://www.themoviedb.org/signup) and confirm your email.
2. Open **Settings → API** at [themoviedb.org/settings/api](https://www.themoviedb.org/settings/api).
3. Request an API key and choose the **Developer** (personal) option. Accept the terms of use.
4. Fill in the short application form. Something like this is enough:
   - Application name: `BakaSub`
   - Application URL: `https://github.com/lsilvatti/bakasub`
   - Summary: `Personal desktop app that translates subtitles; uses TMDB for titles and synopses.`
5. On the same API page, copy the **API Read Access Token** (a long text starting with `eyJ`). The shorter **API Key** (32 letters and numbers) also works.
6. In BakaSub, paste it into **Settings → TMDB key**. BakaSub checks it with TMDB before saving.

TMDB may rename buttons or pages over time; the API settings page is always under your account settings.

## Privacy

- The key is stored encrypted on your computer (in your system's keychain when available) and never leaves it except in requests to TMDB.
- Only the **title and year** from the file name are sent to TMDB when searching. Your subtitles are never sent to TMDB.
- Images are downloaded by BakaSub and kept in a local cache (at most 200 MB).

This product uses the TMDB API but is not endorsed or certified by TMDB.
