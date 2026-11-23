import { useId } from 'react'
import { useTranslation } from 'react-i18next'
import type { JobMemoryMode } from '@shared/ipc-contract'
import { Checkbox } from '@renderer/components/ui/checkbox'

/**
 * "Ignore saved translations": the job sends every line to the AI and its new translations
 * replace the saved ones (the cache is corrected, not just bypassed). Off by default.
 */
export function MemoryOption({
  value,
  onChange,
  disabled
}: {
  value: JobMemoryMode
  onChange: (v: JobMemoryMode) => void
  disabled?: boolean
}): React.JSX.Element {
  const { t } = useTranslation()
  const hint = useId()
  const skip = value === 'skip'
  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-1">
      <label className="flex items-center gap-2.5 text-sm">
        <Checkbox
          checked={skip}
          disabled={disabled}
          aria-describedby={hint}
          onCheckedChange={(v) => onChange(v === true ? 'skip' : 'use')}
        />
        {t('jobs.memory.option')}
      </label>
      <p id={hint} className="pl-6.5 text-xs text-muted-foreground">
        {skip ? t('jobs.memory.on') : t('jobs.memory.off')}
      </p>
    </div>
  )
}
