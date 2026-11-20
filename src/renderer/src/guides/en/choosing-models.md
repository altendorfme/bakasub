# How to choose a model

BakaSub translates through OpenRouter, which offers hundreds of models from many providers. The model decides the quality, the speed and the price of a translation. You can star several in **Models** and pick one per translation.

## What the list shows

| Item                    | What it means                                                                                                                       |
| ----------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| **Price per 1M tokens** | What OpenRouter charges for 1 million tokens sent ("in") and received ("out"). A token is about ¾ of an English word.               |
| **Free**                | Costs nothing, but has per-minute and daily limits. See [Limits, waits and retries](./openrouter-limits.md).                        |
| **Price varies**        | A router that picks a model for you; BakaSub cannot estimate the cost in advance.                                                   |
| **Context**             | How much text the model reads at once. Subtitles are sent in small parts, so any model above 16k is enough.                         |
| **Reliable JSON**       | The model can be forced to answer in the exact format BakaSub expects. These models need fewer retries, which saves time and money. |
| **Moderated**           | The provider filters content. Lines with violence, sex or strong language may be refused and stay in the original language.         |

## What a translation costs

A 24-minute episode is around 300 to 400 lines, roughly 15 to 25 thousand tokens in each direction once the context is included. With a model at US$ 0.30 in and US$ 2.50 out per 1M tokens, that is about US$ 0.05 per episode. BakaSub always shows the estimate before translating, and lines already translated come from the translation cache for free.

## How to choose

- **Start with a fast, inexpensive model** that has **Reliable JSON**. For most series and movies the result is already good.
- **Translate one episode and read it.** If names, tone or jokes come out wrong, try a larger model of the same provider before changing provider.
- **Avoid moderated models for adult or violent content.** Blocked lines are listed in the result so you can see what was skipped.
- **Free models are fine to try BakaSub**, but they are slower, may be busy, and the daily limit stops long files or batches.
- **Use the preset and notes too.** A glossary of names and a short note about the characters often improves the result more than a more expensive model.

## Filters and sorting

In **Models** you can sort by price or context, show one provider, and keep only free models, models with Reliable JSON or models without moderation. Starred models always stay at the top.
