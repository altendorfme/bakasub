import type { TFunction } from 'i18next'
import { Sparkles } from 'lucide-react'
import type { PresetSuggestion } from '@renderer/lib/preset-suggestion'

/**
 * Where the preset came from, under the select: the TMDB suggestion it follows, a way back to it
 * once the user picked another, or (no work identified) that the default from Settings applies.
 * `undefined` while a work is known but suggests nothing (no matching built-in preset).
 */
export function suggestionHint({
  t,
  suggestion,
  presetId,
  hasWork,
  presetName,
  onUseSuggestion
}: {
  t: TFunction
  suggestion: PresetSuggestion | null | undefined
  /** The preset in effect. */
  presetId: string | null
  hasWork: boolean
  presetName: (id: string) => string
  onUseSuggestion: () => void
}): React.ReactNode {
  if (suggestion && presetId === suggestion.presetId)
    return (
      <span className="flex items-center gap-1.5">
        <Sparkles className="size-3.5 shrink-0 text-violet" />
        {t(
          suggestion.source === 'name'
            ? 'translate.preset.suggestedByName'
            : `translate.preset.suggested.${suggestion.flavor}`
        )}
      </span>
    )
  if (suggestion)
    return (
      <button
        type="button"
        className="text-violet underline-offset-2 hover:underline"
        onClick={onUseSuggestion}
      >
        {t('translate.preset.useSuggestion', { preset: presetName(suggestion.presetId) })}
      </button>
    )
  return hasWork ? undefined : t('translate.preset.noSuggestion')
}
