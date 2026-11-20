import { AlertTriangle, RefreshCw } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { ModelPicker } from '@renderer/components/pickers/model-picker'
import { Button } from '@renderer/components/ui/button'
import { useFreeQuota, useModels, useRefreshModels } from '@renderer/data/models'
import { useListWithDefault } from '@renderer/data/preferences'
import { errorMessage } from '@renderer/i18n/error-message'
import { toggleItem } from '@renderer/lib/favorites'
import { formatDate } from '@renderer/lib/format'

export function ModelsPage(): React.JSX.Element {
  const { t, i18n } = useTranslation()
  const favorites = useListWithDefault('models.favorites', 'translation.defaultModel')
  const catalog = useModels().data
  const refresh = useRefreshModels()
  const quota = useFreeQuota().data
  // Favorites the catalog no longer lists: the picker cannot show them, so they are listed here.
  const known = new Set(catalog?.models.map((m) => m.id))
  const missing = catalog ? favorites.value.list.filter((id) => !known.has(id)) : []

  return (
    <div className="mx-auto grid max-w-3xl gap-5 px-6 py-7">
      <div className="flex flex-wrap items-start gap-3">
        <div className="grid flex-1 gap-1">
          <h1 className="text-xl font-semibold tracking-tight">{t('pages.models.title')}</h1>
          <p className="max-w-[65ch] text-sm text-muted-foreground">{t('modelsPage.body')}</p>
        </div>
        <Button
          disabled={refresh.isPending}
          onClick={() =>
            refresh.mutate(undefined, { onError: (e) => toast.error(errorMessage(e)) })
          }
        >
          <RefreshCw className={refresh.isPending ? 'animate-spin' : ''} />
          {t('modelsPage.refresh')}
        </Button>
      </div>

      <p className="flex flex-wrap gap-x-4 text-xs text-muted-foreground">
        {catalog ? (
          <span>
            {t('modelsPage.updated', { date: formatDate(catalog.fetchedAt, i18n.language) })}
          </span>
        ) : null}
        {quota && quota.remaining !== null ? (
          <span>{t('modelsPage.quota', { remaining: quota.remaining, limit: quota.limit })}</span>
        ) : null}
      </p>

      {missing.length > 0 ? (
        <section
          role="alert"
          className="grid gap-2 rounded-lg border border-warning/40 bg-warning/10 p-3"
        >
          <h2 className="flex items-center gap-2 text-sm font-medium text-warning">
            <AlertTriangle className="size-4" />
            {t('modelsPage.missingTitle')}
          </h2>
          <p className="text-xs text-muted-foreground">{t('modelsPage.missingBody')}</p>
          <ul className="grid gap-1">
            {missing.map((id) => (
              <li key={id} className="flex items-center gap-2 text-sm">
                <code className="flex-1 truncate">{id}</code>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => favorites.onChange(toggleItem(favorites.value, id))}
                >
                  {t('modelsPage.remove')}
                </Button>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <div className="rounded-xl border bg-card/92 p-4">
        <ModelPicker
          value={favorites.value}
          onChange={favorites.onChange}
          disabled={!favorites.ready}
        />
      </div>
    </div>
  )
}
