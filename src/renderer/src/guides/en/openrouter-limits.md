# Limits, waits and retries

OpenRouter limits how often you can call some models. BakaSub keeps track of those limits for you: it spaces out requests, waits when OpenRouter asks it to, and retries when a request fails. Usually you don't need to change anything.

## Free and paid models

**Free models** (the ones ending in `:free`) are limited for every account:

- **20 requests per minute**;
- **50 requests per day** if you have bought less than US$ 10 of OpenRouter credits in total;
- **1000 requests per day** once you have bought US$ 10 or more (this is about credits bought at any time, not your current balance).

The daily count resets at **00:00 UTC**. BakaSub reads your tier from OpenRouter, so you don't need to tell it whether you have added credits.

**Paid models** have no limit from OpenRouter itself. The company that runs the model can still be busy and ask BakaSub to slow down for a moment.

How many requests does a file take? Roughly one per 40 lines that are not in the translation cache, plus a few more to fix lines the model got wrong. A 24-minute episode is usually 8 to 12 requests. Before translating, BakaSub shows how many requests the job needs and how many you have left today, and asks you to confirm when there aren't enough.

## What you may see in the queue

- **Waiting for the rate limit**: BakaSub is spacing out requests so it doesn't go over the per-minute limit. The job continues by itself.
- **Paused after a rate limit**: OpenRouter asked BakaSub to slow down. Every job using the same kind of model (free or paid) waits together, then continues.
- **Retrying**: a request failed (network, a busy provider). BakaSub waits a little longer each time and tries again. If a part of the file still fails, it waits one minute, then two, and tries that part again before giving up.

## Parallel translation

To go faster, BakaSub splits the file into a few stretches and translates them at the same time. Each stretch runs in order, with the context of the previous lines, and the cuts land on pauses between lines, where context matters least. Cost stays the same: the same lines, the same number of requests.

If a provider asks to slow down, or OpenRouter's reserved balance can't cover that many requests at once, BakaSub lowers the parallelism by itself and speeds up again once things calm down.

Lines that were already translated are never lost. They are saved as the job goes, so retrying a failed job continues where it stopped and doesn't pay for them again.

## When a job stops

- **Daily limit for free models reached**: wait until 00:00 UTC and retry the job, use a paid model, or add credits (from US$ 10, free models allow 1000 requests per day).
- **The model is unavailable right now**: the provider kept failing after every retry. Retry later or pick another model.
- **Your OpenRouter credits ran out**: add credits and retry the job.

## Advanced settings

In **Settings → Advanced** you can change how BakaSub paces and retries requests. The defaults match OpenRouter's limits; change them only if you see a reason to.

| Setting                                    | Default    | When to change it                                                              |
| ------------------------------------------ | ---------- | ------------------------------------------------------------------------------ |
| Requests per minute (free models)          | 20         | lower it if you use the same OpenRouter account in other apps at the same time |
| Requests per minute (paid models)          | no limit   | set one if a provider keeps asking you to slow down                            |
| Free-model tier                            | automatic  | set it by hand only if the automatic detection is wrong                        |
| Attempts when asked to slow down           | 5          | raise it for very busy free models                                             |
| Attempts after errors                      | 3          | raise it on an unstable connection                                             |
| First wait / longest wait between attempts | 1 s / 30 s | raise them on an unstable connection                                           |
| Extra rounds for a failed part of the file | 2          | set 0 to fail right away instead of waiting minutes                            |
| Parallel stretches per file                | 4          | 1 translates in sequence; above 4, more cuts in the file                       |
| Simultaneous requests (paid models)        | 8          | lower it if a provider keeps asking to slow down or your balance is low        |
| Simultaneous requests (free models)        | 3          | above 3 only causes waits at the 20-per-minute limit                           |

Each of these three shows its recommended range and warns when the value leaves it.

**Restore defaults** puts every value back.
