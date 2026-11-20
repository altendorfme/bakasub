import { Hourglass } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import type { JobProgress } from '@shared/ipc-contract'
import { useCountdown } from '@renderer/lib/use-countdown'

/** "Waiting for the rate limit · 12 s" for a job's `progress.waiting`. */
export function WaitLabel({
  waiting
}: {
  waiting: NonNullable<JobProgress['waiting']>
}): React.JSX.Element {
  const { t } = useTranslation()
  const seconds = useCountdown(waiting.untilMs) ?? 0
  return (
    <span className="inline-flex items-center gap-1 text-xs text-warning" role="status">
      <Hourglass className="size-3.5" />
      {t('wait.in', { label: t(`wait.${waiting.reason}`), seconds })}
    </span>
  )
}
