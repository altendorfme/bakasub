import { useState } from 'react'
import { Database } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import type { MemoryPruneScope } from '@shared/ipc-contract'
import { Button } from '@renderer/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@renderer/components/ui/select'
import { ACTIVE_STATUSES, useJobs } from '@renderer/data/jobs'
import { useMemoryStats, usePruneMemory } from '@renderer/data/memory'
import { errorMessage } from '@renderer/i18n/error-message'
import { formatDate, formatInt } from '@renderer/lib/format'

const SCOPES: readonly MemoryPruneScope[] = [1, 3, 7, 30, 'all']

const size = (bytes: number, lang: string): string =>
  new Intl.NumberFormat(lang, {
    style: 'unit',
    unit: bytes >= 1024 ** 3 ? 'gigabyte' : bytes >= 1024 ** 2 ? 'megabyte' : 'kilobyte',
    maximumFractionDigits: 1
  }).format(bytes / (bytes >= 1024 ** 3 ? 1024 ** 3 : bytes >= 1024 ** 2 ? 1024 ** 2 : 1024))

export function CacheSection(): React.JSX.Element {
  const { t, i18n } = useTranslation()
  const stats = useMemoryStats().data
  const prune = usePruneMemory()
  const busy = (useJobs().data ?? []).some((j) => ACTIVE_STATUSES.has(j.status))
  const [scope, setScope] = useState<MemoryPruneScope>(30)

  return (
    <div className="grid gap-4">
      <p className="max-w-[65ch] text-sm text-muted-foreground">{t('settings.cache.body')}</p>
      <div className="flex items-center gap-4 rounded-lg border bg-background/40 p-4">
        <Database className="size-6 text-violet" />
        {stats ? (
          stats.rows === 0 ? (
            <p className="text-sm">{t('settings.cache.empty')}</p>
          ) : (
            <div className="grid gap-0.5">
              <p className="text-lg font-semibold">{size(stats.bytes, i18n.language)}</p>
              <p className="text-xs text-muted-foreground">
                {t('settings.cache.entries', {
                  count: stats.rows,
                  n: formatInt(stats.rows, i18n.language)
                })}
                {stats.oldestUsedAt
                  ? ` · ${t('settings.cache.oldest', { date: formatDate(stats.oldestUsedAt, i18n.language) })}`
                  : ''}
              </p>
            </div>
          )
        ) : null}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm">{t('settings.cache.prune')}</span>
        <Select
          value={String(scope)}
          onValueChange={(v) => setScope(v === 'all' ? 'all' : (Number(v) as MemoryPruneScope))}
        >
          <SelectTrigger className="w-48" aria-label={t('settings.cache.prune')}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {SCOPES.map((s) => (
              <SelectItem key={s} value={String(s)}>
                {s === 'all' ? t('settings.cache.all') : t('settings.cache.days', { count: s })}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button
          variant={scope === 'all' ? 'destructive' : 'outline'}
          disabled={busy || prune.isPending || !stats?.rows}
          onClick={() =>
            prune.mutate(scope, {
              onSuccess: (r) => toast.success(t('settings.cache.done', { count: r.deleted })),
              onError: (err) => toast.error(errorMessage(err))
            })
          }
        >
          {t('settings.cache.apply')}
        </Button>
      </div>
      {busy ? <p className="text-xs text-warning">{t('settings.cache.busy')}</p> : null}
    </div>
  )
}
