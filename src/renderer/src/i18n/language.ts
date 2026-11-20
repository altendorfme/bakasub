import { APP_LANGUAGES, type AppLanguage } from '@shared/ipc-contract'

/** Requested language -> supported one: exact, then same base language (`pt` -> `pt-BR`), then `en`. */
export function resolveAppLanguage(requested: string | null | undefined): AppLanguage {
  if (!requested) return 'en'
  const wanted = requested.toLowerCase()
  const exact = APP_LANGUAGES.find((l) => l.toLowerCase() === wanted)
  if (exact) return exact
  const base = wanted.split('-')[0]
  return APP_LANGUAGES.find((l) => l.toLowerCase().split('-')[0] === base) ?? 'en'
}

/** `ui.language` wins; `null` follows the system (`navigator.language`). */
export const effectiveLanguage = (
  setting: AppLanguage | null | undefined,
  system: string | undefined = typeof navigator === 'undefined' ? undefined : navigator.language
): AppLanguage => setting ?? resolveAppLanguage(system)
