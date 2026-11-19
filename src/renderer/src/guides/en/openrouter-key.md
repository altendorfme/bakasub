# Getting an OpenRouter key

BakaSub translates through [OpenRouter](https://openrouter.ai/), a service that gives one account access to many AI models (Gemini, GPT, Claude, DeepSeek and others). You pay OpenRouter for what you use; BakaSub shows the estimated cost before every translation.

## Steps

1. **Create an account** at [openrouter.ai](https://openrouter.ai/) (email, Google or GitHub).
2. **Add credits** at [openrouter.ai/settings/credits](https://openrouter.ai/settings/credits). A few dollars translate a lot of subtitles with the cheaper models; the estimate in BakaSub shows how much each file costs.
3. **Create a key** at [openrouter.ai/settings/keys](https://openrouter.ai/settings/keys) with **Create Key**. You can give it a name (`BakaSub`) and, optionally, a credit limit for extra safety.
4. **Copy the key right away** (it starts with `sk-or-`). OpenRouter shows it only once; if you lose it, delete it and create another.
5. In BakaSub, paste it into the first onboarding step, or later in **Settings → OpenRouter key**.

OpenRouter may rename buttons or pages over time; credits and keys are always in your account settings.

## Choosing models

After the key, BakaSub asks you to star at least one model in **Models** and pick a default. Models marked **Moderated** may refuse some lines (they stay in the original language); **Exact cost** means the estimate uses the model's own tokenizer.

Free models (ending in `:free`) cost nothing but have per-minute and daily limits: see [Limits, waits and retries](./openrouter-limits.md).

## Privacy

- The key is stored encrypted on your computer (in your system's keychain when available) and is never shown again, not even to BakaSub's own screens.
- The subtitle text you translate is sent to OpenRouter and to the model provider you choose. Check their policies if your subtitles are private.
