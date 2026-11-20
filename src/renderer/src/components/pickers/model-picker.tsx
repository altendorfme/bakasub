import { useMemo, useState } from 'react'
import { Star, WifiOff } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import type { ModelSummary } from '@shared/ipc-contract'
import { Badge } from '@renderer/components/ui/badge'
import { Button } from '@renderer/components/ui/button'
import { Checkbox } from '@renderer/components/ui/checkbox'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@renderer/components/ui/select'
import {
  Command,
  CommandEmpty,
  CommandInput,
  CommandItem,
  CommandList
} from '@renderer/components/ui/command'
import { Tooltip } from '@renderer/components/ui/popover'
import { RangeSlider } from '@renderer/components/ui/range-slider'
import { isFreeModel, useModels } from '@renderer/data/models'
import { errorMessage } from '@renderer/i18n/error-message'
import {
  makeDefault,
  pricePerMillion,
  toggleItem,
  type ListWithDefault
} from '@renderer/lib/favorites'
import {
  defaultModelListOptions,
  families,
  filterAndSortModels,
  priceStops,
  type ModelListOptions,
  type ModelSort
} from '@renderer/lib/model-list'
import { cn } from '@renderer/lib/utils'

const SORTS: readonly ModelSort[] = ['catalog', 'price-asc', 'price-desc', 'context-desc']
const FLAGS = ['freeOnly', 'jsonOnly', 'hideModerated', 'favoritesOnly'] as const
const ALL = '*'

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
  const [opts, setOpts] = useState<ModelListOptions>(defaultModelListOptions)
  const set = (patch: Partial<ModelListOptions>): void => setOpts((o) => ({ ...o, ...patch }))
  const all = useMemo(() => models.data?.models ?? [], [models.data])
  const familyList = useMemo(() => families(all), [all])
  const stops = useMemo(() => priceStops(all), [all])
  // Favorites first (in the chosen order), so starred models stay at hand.
  const rows = useMemo(() => filterAndSortModels(all, opts, value.list), [all, opts, value.list])

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
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <Select value={opts.sort} onValueChange={(v) => set({ sort: v as ModelSort })}>
          <SelectTrigger className="h-8 w-48 text-xs" aria-label={t('models.sort.label')}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {SORTS.map((x) => (
              <SelectItem key={x} value={x}>
                {t(`models.sort.${x}`)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select
          value={opts.family ?? ALL}
          onValueChange={(v) => set({ family: v === ALL ? null : v })}
        >
          <SelectTrigger className="h-8 w-48 text-xs" aria-label={t('models.family')}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>{t('models.allFamilies')}</SelectItem>
            {familyList.map((f) => (
              <SelectItem key={f} value={f}>
                {f}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {FLAGS.map((flag) => (
          <label
            key={flag}
            className={cn(
              'inline-flex h-8 cursor-pointer items-center gap-2 rounded-md border px-2.5',
              opts[flag] ? 'border-primary/60 bg-primary-soft/40' : 'bg-background/40'
            )}
          >
            <Checkbox checked={opts[flag]} onCheckedChange={(v) => set({ [flag]: v === true })} />
            {t(`models.filter.${flag}`)}
          </label>
        ))}
        <span className="ml-auto text-muted-foreground">
          {t('models.shown', { shown: rows.length, total: all.length })} ·{' '}
          {t('models.favoritesCount', { count: value.list.length })}
        </span>
      </div>
      <PriceRange stops={stops} opts={opts} onChange={set} />
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
    // Nothing is truncated: names, ids and prices wrap (a cut price or provider is misleading).
    <CommandItem
      value={`${m.name} ${m.id}`}
      onSelect={onToggle}
      disabled={disabled}
      className="items-start py-2"
    >
      <Star
        className={cn(
          'mt-0.5 size-4 shrink-0',
          favorite ? 'fill-primary text-primary' : 'text-muted-foreground'
        )}
        aria-label={favorite ? t('models.unfavorite') : t('models.favorite')}
      />
      <span className="grid min-w-0 flex-1 gap-1">
        <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span className="font-medium break-words">{m.name}</span>
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
        </span>
        <span className="flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
          <span className="break-all">{m.id}</span>
          <span>
            {free
              ? t('models.free')
              : m.pricing
                ? t('models.perMillion', {
                    input: pricePerMillion(m.pricing.prompt),
                    output: pricePerMillion(m.pricing.completion)
                  })
                : t('models.dynamicPrice')}
          </span>
          {m.contextLength ? (
            <span>{t('models.context', { k: Math.round(m.contextLength / 1000) })}</span>
          ) : null}
        </span>
      </span>
      <span className="flex shrink-0 items-center gap-1">
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

/**
 * Price filter: one range for both the input and the output price (USD per 1M tokens). The
 * ends mean "no bound"; with the right end at the top, models with a dynamic price stay listed.
 */
function PriceRange({
  stops,
  opts,
  onChange
}: {
  stops: readonly number[]
  opts: ModelListOptions
  onChange: (patch: Partial<ModelListOptions>) => void
}): React.JSX.Element {
  const { t } = useTranslation()
  const last = stops.length - 1
  const index = (v: number | null, fallback: number): number =>
    v === null
      ? fallback
      : Math.max(
          0,
          stops.findIndex((s) => s >= v)
        )
  const lo = index(opts.priceMin, 0)
  const hi = index(opts.priceMax, last)
  const fmt = (v: number): string => `$${v}`
  return (
    <div className="grid gap-1.5 rounded-md border bg-background/40 px-3 py-2">
      <div className="flex items-baseline justify-between text-xs">
        <span className="text-muted-foreground">{t('models.price.label')}</span>
        <span className="tabular-nums">
          {fmt(stops[lo])} – {hi === last ? `${fmt(stops[last])}+` : fmt(stops[hi])}
        </span>
      </div>
      <RangeSlider
        max={last}
        value={[lo, hi]}
        labels={[t('models.price.min'), t('models.price.max')]}
        onChange={([a, b]) =>
          onChange({ priceMin: a === 0 ? null : stops[a], priceMax: b === last ? null : stops[b] })
        }
      />
    </div>
  )
}
