import { Link } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
import { NAV } from '@renderer/app/pages'
import logo from '@renderer/assets/logo.svg'
import { jobCounts, useJobs } from '@renderer/data/jobs'
import { cn } from '@renderer/lib/utils'

export function Sidebar(): React.JSX.Element {
  const { t } = useTranslation()
  const counts = jobCounts(useJobs().data)
  const queueBadge = counts.running + counts.queued + counts.awaiting
  const main = NAV.find((n) => n.group === 'main')!

  return (
    <aside className="flex w-56 shrink-0 flex-col border-r bg-card">
      <div className="px-2.5 pt-4 pb-4">
        <img src={logo} alt={t('appName')} className="block h-auto w-full" draggable={false} />
      </div>
      <nav aria-label="Main" className="grid gap-5 px-2.5">
        {/* Translate is the core of the app: on its own, larger, highlighted by colour. */}
        <Link
          to={`/${main.page}`}
          className="group flex items-center gap-3 rounded-lg border border-border/70 px-3 py-2.5 text-[15px] font-semibold text-foreground transition-colors hover:border-primary/50 hover:bg-accent"
          activeProps={{
            className: 'border-primary/60 bg-linear-to-r from-primary-soft/70 to-transparent'
          }}
        >
          {({ isActive }) => (
            <>
              <main.icon
                className={cn('size-5', isActive ? 'text-primary' : 'text-muted-foreground')}
                aria-hidden
              />
              <span
                className={cn(
                  isActive && 'bg-linear-to-r from-primary to-violet bg-clip-text text-transparent'
                )}
              >
                {t(`nav.${main.page}`)}
              </span>
            </>
          )}
        </Link>

        {(['work', 'manage'] as const).map((group) => (
          <div key={group} className="grid gap-1">
            <p className="px-2.5 pb-1 text-xs font-medium text-muted-foreground">
              {t(`nav.${group}`)}
            </p>
            {NAV.filter((n) => n.group === group).map(({ page, icon: Icon }) => (
              <Link
                key={page}
                to={`/${page}`}
                className="flex items-center gap-2.5 rounded-md px-2.5 py-2 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
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
