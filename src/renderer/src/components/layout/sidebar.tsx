import { Link } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
import { NAV } from '@renderer/app/pages'
import { jobCounts, useJobs } from '@renderer/data/jobs'
import { cn } from '@renderer/lib/utils'

export function Sidebar(): React.JSX.Element {
  const { t } = useTranslation()
  const counts = jobCounts(useJobs().data)
  const queueBadge = counts.running + counts.queued + counts.awaiting

  return (
    <aside className="flex w-52 shrink-0 flex-col border-r bg-card">
      <div className="flex items-center gap-2 px-4 py-4">
        <div className="bg-brand size-7 rounded-lg" aria-hidden />
        <span className="text-lg font-semibold tracking-tight">{t('appName')}</span>
      </div>
      <nav aria-label="Main" className="space-y-3 px-2">
        {(['work', 'manage'] as const).map((group) => (
          <div key={group}>
            <p className="px-2 pb-1 text-xs font-medium text-muted-foreground">
              {t(`nav.${group}`)}
            </p>
            {NAV.filter((n) => n.group === group).map(({ page, icon: Icon }) => (
              <Link
                key={page}
                to={`/${page}`}
                className="flex items-center gap-2.5 rounded-md px-2 py-1.5 text-sm text-muted-foreground hover:bg-accent hover:text-foreground"
                activeProps={{
                  className:
                    'bg-primary-soft font-medium text-primary hover:bg-primary-soft hover:text-primary'
                }}
              >
                <Icon className="size-4" aria-hidden />
                <span className="flex-1">{t(`nav.${page}`)}</span>
                {page === 'queue' && queueBadge > 0 && (
                  <span
                    className={cn(
                      'rounded-full px-1.5 text-[11px]',
                      counts.awaiting ? 'bg-warning/20 text-warning' : 'bg-secondary text-violet'
                    )}
                  >
                    {queueBadge}
                  </span>
                )}
              </Link>
            ))}
          </div>
        ))}
      </nav>
    </aside>
  )
}
