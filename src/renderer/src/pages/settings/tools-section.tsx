import { useTranslation } from 'react-i18next'
import { Button } from '@renderer/components/ui/button'
import { useQueryClient } from '@tanstack/react-query'
import { qk } from '@renderer/data/query-keys'
import { ToolsPanel } from '@renderer/components/sidecars/tools-panel'

/** Same list and installer as the onboarding step, plus a manual re-check. */
export function ToolsSection(): React.JSX.Element {
  const { t } = useTranslation()
  const qc = useQueryClient()
  return (
    <div className="grid gap-4">
      <p className="max-w-[65ch] text-sm text-muted-foreground">{t('settings.tools.body')}</p>
      <ToolsPanel />
      <Button
        size="sm"
        className="justify-self-start"
        onClick={() => void qc.invalidateQueries({ queryKey: qk.sidecars.report() })}
      >
        {t('settings.tools.check')}
      </Button>
    </div>
  )
}
