import { AlertTriangle } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import type { PromptSummary as Summary } from '@shared/ipc-contract'
import { Badge } from '@renderer/components/ui/badge'
import { formatInt } from '@renderer/lib/format'

/**
 * Which blocks went into the job's system prompt (glossary, style, TMDB, episode, notes) and the
 * exact text, so the user can check what the model received. A warning when the TMDB context the
 * user chose could not be fetched.
 */
export function PromptSummary({
  prompt
}: {
  /** `null`: job created before the prompt was recorded. */
  prompt: Summary | null
}): React.JSX.Element {
  const { t, i18n } = useTranslation()
  if (!prompt) return <p className="text-xs text-muted-foreground">{t('promptSummary.missing')}</p>
  const m = prompt.media
  const hasMedia = m.tmdb || m.notes

  return (
    <section className="grid gap-2" aria-label={t('promptSummary.heading')}>
      <p className="text-xs text-muted-foreground">{t('promptSummary.heading')}</p>
      {m.unavailable ? (
        <p
          role="alert"
          className="flex gap-2 rounded-md border border-warning/40 bg-warning/10 p-3 text-sm text-warning"
        >
          <AlertTriangle className="size-4 shrink-0" />
          {t('promptSummary.unavailable', { reason: m.unavailable })}
        </p>
      ) : null}
      <ul className="flex flex-wrap gap-1.5" aria-label={t('promptSummary.blocks')}>
        <li>
          <Badge tone={prompt.glossaryEntries ? 'violet' : 'muted'}>
            {prompt.glossaryEntries
              ? t('promptSummary.glossary', { count: prompt.glossaryEntries })
              : t('promptSummary.noGlossary')}
          </Badge>
        </li>
        {prompt.style ? (
          <li>
            <Badge tone="violet">{t('promptSummary.style')}</Badge>
          </li>
        ) : null}
        {m.tmdb ? (
          <li>
            <Badge tone="success">{t('promptSummary.tmdb')}</Badge>
          </li>
        ) : null}
        {m.episode ? (
          <li>
            <Badge tone="success">{t('promptSummary.episode')}</Badge>
          </li>
        ) : null}
        {m.notes ? (
          <li>
            <Badge tone="success">{t('promptSummary.notes')}</Badge>
          </li>
        ) : null}
        {!hasMedia ? (
          <li>
            <Badge tone={m.unavailable ? 'warning' : 'muted'}>{t('promptSummary.noMedia')}</Badge>
          </li>
        ) : null}
      </ul>
      <details className="text-xs text-muted-foreground">
        <summary className="cursor-pointer">{t('promptSummary.show')}</summary>
        <p className="mt-1">
          {t('promptSummary.tokens', { value: formatInt(prompt.systemTokens, i18n.language) })}
        </p>
        <pre className="mt-1 max-h-72 overflow-auto rounded-md border bg-background/40 p-2 font-mono text-[11px] whitespace-pre-wrap break-words text-foreground/90">
          {prompt.system}
        </pre>
      </details>
    </section>
  )
}
