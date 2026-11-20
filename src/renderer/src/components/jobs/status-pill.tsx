import { useTranslation } from 'react-i18next'
import type { JobStatus } from '@shared/ipc-contract'
import { Badge } from '@renderer/components/ui/badge'

const TONE: Record<
  JobStatus,
  'muted' | 'primary' | 'violet' | 'warning' | 'success' | 'destructive'
> = {
  queued: 'muted',
  running: 'primary',
  'awaiting-confirmation': 'warning',
  completed: 'success',
  'completed-with-warnings': 'warning',
  failed: 'destructive',
  cancelled: 'muted',
  interrupted: 'destructive'
}

export function StatusPill({ status }: { status: JobStatus }): React.JSX.Element {
  const { t } = useTranslation()
  return (
    <Badge tone={TONE[status]} className="shrink-0">
      {t(`queue.pill.${status}`)}
    </Badge>
  )
}
