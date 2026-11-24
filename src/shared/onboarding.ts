/**
 * Regra única de "onboarded" (router do renderer e gate da checagem automática de update no Main):
 * o mínimo para traduzir é uma key do OpenRouter, um modelo padrão e um idioma de destino padrão.
 */
export interface OnboardingFacts {
  apiKeyPresent: boolean
  defaultModel: string | null | undefined
  defaultTargetLang: string | null | undefined
}

export const isOnboarded = (f: OnboardingFacts): boolean =>
  f.apiKeyPresent && !!f.defaultModel && !!f.defaultTargetLang
