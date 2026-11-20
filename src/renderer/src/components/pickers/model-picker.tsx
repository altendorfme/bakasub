import { useMemo, useState } from 'react'
import { Star, WifiOff } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import type { ModelSummary } from '@shared/ipc-contract'
import { Badge } from '@renderer/components/ui/badge'
import { Button } from '@renderer/components/ui/button'
import { Switch } from '@renderer/components/ui/checkbox'
import {
  Command,
  CommandEmpty,
  CommandInput,
  CommandItem,
  CommandList
} from '@renderer/components/ui/command'
import { Tooltip } from '@renderer/components/ui/popover'
import { isFreeModel, useModels } from '@renderer/data/models'
import { errorMessage } from '@renderer/i18n/error-message'
import {
  makeDefault,
  pricePerMillion,
  toggleItem,
  type ListWithDefault
} from '@renderer/lib/favorites'
import { cn } from '@renderer/lib/utils'

/**
 * OpenRouter catalog with search, favorites (star) and the default model. Controlled: the parent
 * persists `{ list, default }` (favorites + `translation.defaultModel`).
 */
export function ModelPicker({
  value,
  onChange,
  disabled
}: {
  value: ListWithDefault
  onChange: (next: ListWithDefault) => void
  disabled?: boolean
}): React.JSX.Element {
  const { t } = useTranslation()
  const models = useModels()
  const [favoritesOnly, setFavoritesOnly] = useState(false)

  // Favorites first, then the catalog order (OpenRouter's), so starred models stay at hand.
  const rows = useMemo(() => {
    const all = models.data?.models ?? []
    const fav = new Set(value.list)
    const shown = favoritesOnly ? all.filter((m) => fav.has(m.id)) : all
    return [...shown.filter((m) => fav.has(m.id)), ...shown.filter((m) => !fav.has(m.id))]
  }, [models.data, value.list, favoritesOnly])

  if (models.isPending)
    return <p className="text-sm text-muted-foreground">{t('models.loading')}</p>
  if (models.isError)
    return (
      <p role="alert" className="text-sm text-destructive">
        {t('models.loadFailed')} {errorMessage(models.error)}
      </p>
    )

  return (
    <div className="grid gap-2">
      <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
        <span>{t('models.favoritesCount', { count: value.list.length })}</span>
        <label className="ml-auto inline-flex items-center gap-2">
          <Switch checked={favoritesOnly} onCheckedChange={setFavoritesOnly} />
          {t('models.favoritesOnly')}
        </label>
      </div>
      {models.data.offline ? (
        <p className="flex items-center gap-2 text-xs text-warning">
          <WifiOff className="size-3.5" />
          {t('models.offline')}
        </p>
      ) : null}
      <Command className="rounded-md border bg-background/40" loop>
        <CommandInput placeholder={t('models.search')} />
        <CommandList className="max-h-[min(24rem,50vh)]">
          <CommandEmpty>{t('models.empty')}</CommandEmpty>
          {rows.map((m) => (
            <ModelRow
              key={m.id}
              model={m}
              favorite={value.list.includes(m.id)}
              isDefault={value.default === m.id}
              disabled={disabled}
              onToggle={() => onChange(toggleItem(value, m.id))}
              onDefault={() => onChange(makeDefault(value, m.id))}
            />
          ))}
        </CommandList>
      </Command>
    </div>
  )
}

function ModelRow({
  model: m,
  favorite,
  isDefault,
  disabled,
  onToggle,
  onDefault
}: {
  model: ModelSummary
  favorite: boolean
  isDefault: boolean
  disabled?: boolean
  onToggle: () => void
  onDefault: () => void
}): React.JSX.Element {
  const { t } = useTranslation()
  const free = isFreeModel(m)
  return (
    <CommandItem value={`${m.name} ${m.id}`} onSelect={onToggle} disabled={disabled}>
      <Star
        className={cn(
          'size-4 shrink-0',
          favorite ? 'fill-primary text-primary' : 'text-muted-foreground'
        )}
        aria-label={favorite ? t('models.unfavorite') : t('models.favorite')}
      />
      <span className="grid min-w-0 flex-1">
        <span className="truncate">{m.name}</span>
        <span className="truncate text-xs text-muted-foreground">
          {m.id}
          {' · '}
          {free
            ? t('models.free')
            : m.pricing
              ? t('models.perMillion', {
                  input: pricePerMillion(m.pricing.prompt),
                  output: pricePerMillion(m.pricing.completion)
                })
              : t('models.dynamicPrice')}
          {m.contextLength
            ? ` · ${t('models.context', { k: Math.round(m.contextLength / 1000) })}`
            : ''}
        </span>
      </span>
      <span className="flex shrink-0 items-center gap-1">
        {free ? <Badge tone="success">{t('models.free')}</Badge> : null}
        {m.structuredOutputs ? (
          <Tooltip content={t('models.structuredHint')}>
            <span tabIndex={-1}>
              <Badge tone="violet">{t('models.structured')}</Badge>
            </span>
          </Tooltip>
        ) : null}
        {m.isModerated ? (
          <Tooltip content={t('models.moderatedHint')}>
            <span tabIndex={-1}>
              <Badge tone="warning">{t('models.moderated')}</Badge>
            </span>
          </Tooltip>
        ) : null}
        {isDefault ? (
          <Badge tone="primary">{t('models.default')}</Badge>
        ) : favorite ? (
          <Button
            size="sm"
            variant="ghost"
            disabled={disabled}
            onClick={(e) => {
              // Inside a cmdk item: don't also toggle the star.
              e.stopPropagation()
              onDefault()
            }}
            onPointerDown={(e) => e.stopPropagation()}
          >
            {t('models.makeDefault')}
          </Button>
        ) : null}
      </span>
    </CommandItem>
  )
}
