import { useTranslation } from 'react-i18next'
import type { JobTranslationSummary } from '@shared/ipc-contract'
import { useModels } from '@renderer/data/models'
import { languageName } from '@renderer/lib/languages'
import { presetLabel } from '@renderer/lib/preset-labels'

/**
 * Model, preset and languages a translation job used, as frozen in its spec (not the preset's
 * current values). Fields a legacy spec lacks read "not recorded".
 */
export function JobSetup({ setup }: { setup: JobTranslationSummary }): React.JSX.Element {
  const { t, i18n } = useTranslation()
  const catalog = useModels().data?.models
  const notRecorded = <span className="text-muted-foreground">{t('jobs.setup.notRecorded')}</span>
  const lang = (tag: string): string => languageName(tag, i18n.language)
  const modelName = setup.model ? catalog?.find((m) => m.id === setup.model)?.name : undefined

  return (
    <dl
      aria-label={t('jobs.setup.title')}
      className="grid gap-x-6 gap-y-1 rounded-md border bg-background/40 p-3 text-xs sm:grid-cols-[auto_1fr]"
    >
      <dt className="text-muted-foreground">{t('jobs.setup.model')}</dt>
      <dd className="min-w-0 break-all">
        {setup.model ? (
          modelName && modelName !== setup.model ? (
            <>
              {modelName} <code className="text-muted-foreground">{setup.model}</code>
            </>
          ) : (
            <code>{setup.model}</code>
          )
        ) : (
          notRecorded
        )}
      </dd>
      <dt className="text-muted-foreground">{t('jobs.setup.preset')}</dt>
      <dd className="min-w-0 break-words">
        {setup.preset
          ? presetLabel({ ...setup.preset, builtin: setup.preset.id.startsWith('builtin:') }, t)
          : notRecorded}
      </dd>
      <dt className="text-muted-foreground">{t('jobs.setup.languages')}</dt>
      <dd>
        {setup.sourceLang ? lang(setup.sourceLang) : t('jobs.setup.autoSource')}
        {' → '}
        {setup.targetLang ? lang(setup.targetLang) : notRecorded}
      </dd>
    </dl>
  )
}
