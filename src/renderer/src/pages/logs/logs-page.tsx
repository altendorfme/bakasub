import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useSearch } from '@tanstack/react-router'
import { Download, FolderOpen, X } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import type { LogEntry, LogLevel } from '@shared/ipc-contract'
import { Badge } from '@renderer/components/ui/badge'
import { Button } from '@renderer/components/ui/button'
import { Switch } from '@renderer/components/ui/checkbox'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@renderer/components/ui/select'
import { useJob } from '@renderer/data/jobs'
import { LOG_LEVELS, matchesLog, useLiveLogs } from '@renderer/data/logs'
import { errorMessage } from '@renderer/i18n/error-message'
import { unwrap } from '@renderer/lib/ipc'

const TONE: Record<LogLevel, 'muted' | 'primary' | 'warning' | 'destructive'> = {
  debug: 'muted',
  info: 'primary',
  warn: 'warning',
  error: 'destructive'
}
const ALL = '*'

const clock = (iso: string): string => {
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleTimeString(undefined, { hour12: false })
}

/**
 * Log viewer: history + live feed, filtered by level and area on screen. `?job=` (from the queue)
 * loads that job's lines from every rotated file instead of the global tail.
 */
export function LogsPage(): React.JSX.Element {
  const { t } = useTranslation()
  const { job } = useSearch({ from: '/shell/logs' })
  const navigate = useNavigate({ from: '/logs' })
  const [live, setLive] = useState(true)
  const [minLevel, setMinLevel] = useState<LogLevel>('info')
  const [scope, setScope] = useState<string | null>(null)
  const jobId = job ?? null
  const { entries, loading, error } = useLiveLogs(live, jobId)
  const shown = entries.filter((e) => matchesLog(e, { minLevel, scope, jobId }))
  const scopes = [...new Set(entries.map((e) => e.scope))].sort()
  const bottom = useRef<HTMLDivElement>(null)

  // Follow new lines while live, like `tail -f`.
  useEffect(() => {
    if (live) bottom.current?.scrollIntoView({ block: 'end' })
  }, [shown.length, live])

  const fail = (err: unknown): void => void toast.error(errorMessage(err))

  return (
    <div className="flex h-full min-h-0 flex-col gap-3 px-6 py-5">
      <div className="flex flex-wrap items-start gap-3">
        <div className="grid flex-1 gap-1">
          <h1 className="text-xl font-semibold tracking-tight">{t('pages.logs.title')}</h1>
          <p className="text-sm text-muted-foreground">{t('logsPage.body')}</p>
        </div>
        <Button onClick={() => unwrap(window.api.logs.openFolder()).catch(fail)}>
          <FolderOpen />
          {t('logsPage.openFolder')}
        </Button>
        <Button
          onClick={() =>
            unwrap(window.api.logs.export()).then(
              (r) => r.path && toast.success(t('logsPage.exported')),
              fail
            )
          }
        >
          <Download />
          {t('logsPage.export')}
        </Button>
      </div>

      <div className="flex flex-wrap items-center gap-3 text-sm">
        <label className="flex items-center gap-2">
          <Switch checked={live} onCheckedChange={setLive} />
          {t('logsPage.live')}
        </label>
        <Select value={minLevel} onValueChange={(v) => setMinLevel(v as LogLevel)}>
          <SelectTrigger className="h-8 w-48" aria-label={t('logsPage.level')}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {LOG_LEVELS.map((l) => (
              <SelectItem key={l} value={l}>
                {t(`logsPage.levels.${l}`)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={scope ?? ALL} onValueChange={(v) => setScope(v === ALL ? null : v)}>
          <SelectTrigger className="h-8 w-40" aria-label={t('logsPage.scope')}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>{t('logsPage.allScopes')}</SelectItem>
            {scopes.map((s) => (
              <SelectItem key={s} value={s}>
                {s}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {jobId ? <JobFilter jobId={jobId} onClear={() => void navigate({ search: {} })} /> : null}
        <span className="ml-auto text-xs text-muted-foreground">
          {t('logsPage.count', { shown: shown.length, total: entries.length })}
        </span>
      </div>

      <div
        className="min-h-0 flex-1 overflow-y-auto rounded-xl border bg-card/92 font-mono text-xs"
        role="log"
        aria-live="off"
      >
        {loading ? (
          <p className="p-4 font-sans text-sm text-muted-foreground">{t('logsPage.loading')}</p>
        ) : error ? (
          <p role="alert" className="p-4 font-sans text-sm text-destructive">
            {t('logsPage.loadFailed')} {errorMessage(error)}
          </p>
        ) : jobId && entries.length === 0 ? (
          <p className="p-4 font-sans text-sm text-muted-foreground">{t('logsPage.jobEmpty')}</p>
        ) : shown.length === 0 ? (
          <p className="p-4 font-sans text-sm text-muted-foreground">{t('logsPage.empty')}</p>
        ) : (
          <ul className="divide-y divide-border/60">
            {shown.map((e, i) => (
              <LogLine key={`${e.time}-${i}`} entry={e} />
            ))}
          </ul>
        )}
        <div ref={bottom} />
      </div>
    </div>
  )
}

/** "Showing job X" chip; the name comes from the job when it still exists, else the short id. */
function JobFilter({ jobId, onClear }: { jobId: string; onClear: () => void }): React.JSX.Element {
  const { t } = useTranslation()
  const { data } = useJob(jobId)
  const name = data?.source ?? jobId.slice(0, 8)
  return (
    <span className="flex min-w-0 items-center gap-1 rounded-md border px-2 py-0.5">
      <span className="max-w-80 truncate" title={jobId}>
        {t('logsPage.filteredJob', { name })}
      </span>
      <Button
        size="icon"
        variant="ghost"
        className="size-6"
        onClick={onClear}
        aria-label={t('logsPage.clearJob')}
      >
        <X />
      </Button>
    </span>
  )
}

function LogLine({ entry: e }: { entry: LogEntry }): React.JSX.Element {
  const { t } = useTranslation()
  return (
    <li className="grid gap-1 px-3 py-1.5">
      <div className="flex items-baseline gap-2">
        <span className="shrink-0 text-muted-foreground tabular-nums">{clock(e.time)}</span>
        <Badge tone={TONE[e.level]} className="w-12 shrink-0 justify-center font-sans uppercase">
          {e.level}
        </Badge>
        <span className="w-16 shrink-0 truncate text-violet">{e.scope}</span>
        <span className="min-w-0 flex-1 break-words whitespace-pre-wrap">{e.msg}</span>
        {e.jobId ? (
          <Link
            to="/queue"
            search={{ job: e.jobId }}
            className="shrink-0 font-sans text-primary hover:underline"
          >
            {t('logsPage.job', { id: e.jobId.slice(0, 8) })}
          </Link>
        ) : null}
      </div>
      {e.detail ? (
        <details className="pl-[8.5rem]">
          <summary className="cursor-pointer font-sans text-muted-foreground">
            {t('logsPage.details')}
          </summary>
          <pre className="mt-1 overflow-x-auto whitespace-pre-wrap text-muted-foreground">
            {e.detail}
          </pre>
        </details>
      ) : null}
    </li>
  )
}
