# Reporting a problem

Good reports get fixed faster. Before opening an issue:

1. **Update.** Check Settings → About for a newer version.
2. **Search** the [existing issues](https://github.com/lsilvatti/bakasub/issues?q=is%3Aissue) (open and closed).
3. **Read** the troubleshooting table in the [user guide](./user-guide.md#troubleshooting).

Then open a new issue at <https://github.com/lsilvatti/bakasub/issues/new/choose> and pick **Bug report** or **Feature request**.

## Bug report

Include:

- **Version and platform**: Settings → About (for example `1.0.0`, Windows 11 or Arch Linux, installer or AppImage).
- **What you did**: the exact steps, starting from the screen you were on (Translate → one file → ...).
- **What you expected** and **what happened**, with the error message shown by the app. Screenshots help.
- **The input**, when it is a parsing or muxing problem: file type, subtitle format (`.srt`, `.ass`, `.ssa`, `.vtt`), encoding if you know it, and track list of the MKV. If you can share a **small sample** (a few lines of the subtitle, with no copyrighted full episode), attach it.
- **The model and preset** used, for translation problems (quality, untranslated lines, refusals).
- **The logs** (see below).

### Getting the logs

1. Open **Logs** in the sidebar.
2. If the problem is reproducible, turn on _Detailed logs_ in Settings → General and reproduce it.
3. Use **Export logs**. The file has your API keys hidden and your home folder replaced by `~`. If you want to be extra careful, read it before sharing.
4. To focus on one failing job, open it in the Queue and use **Show logs**, then export.

The raw files are in `logs/` inside the data folder (Linux `~/.config/bakasub`, Windows `%APPDATA%\bakasub`), which "Open log folder" in the Logs page also opens.

**Never paste your OpenRouter or TMDB key** in an issue, even if you think the logs hide it.

## Feature request

Describe the problem you are trying to solve before the solution: what you were doing, what was hard, and how you would like it to work. Examples of input and output are welcome. Note that these are out of scope for now: image-based subtitles (OCR), macOS builds and code signing.

## Security issues

Do not open a public issue for something exploitable (for example a way to read files outside the chosen folders, or to extract a stored key). Use GitHub's private vulnerability reporting on the repository ("Security" tab → "Report a vulnerability") and describe the impact and steps to reproduce.

## What happens next

Issues are triaged by the maintainer on a best-effort basis. You may be asked for more information; issues without an answer for a long time can be closed. If you want to fix it yourself, see [`CONTRIBUTING.md`](../CONTRIBUTING.md).
