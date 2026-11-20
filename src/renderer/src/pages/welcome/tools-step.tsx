import { CheckCircle2, Download, WifiOff } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Badge } from '@renderer/components/ui/badge'
import { Button } from '@renderer/components/ui/button'
import { Progress } from '@renderer/components/ui/tabs'
import { useInstallSidecars, useSidecarProgress, useSidecarReport } from '@renderer/data/sidecars'
import { errorMessage } from '@renderer/i18n/error-message'

export function ToolsStep(): React.JSX.Element {
  const { t } = useTranslation()
  const report = useSidecarReport()
  const install = useInstallSidecars()
  const progress = Object.values(useSidecarProgress())
  const tools = report.data?.tools ?? []
  const missing = tools.filter((tool) => tool.state !== 'ok' && tool.state !== 'unsupported')

  return (
    <div className="grid gap-3">
      <ul className="grid gap-1.5">
        {tools.map((tool) => (
          <li key={tool.name} className="flex items-center gap-2 text-sm">
            <span className="font-medium">{tool.name}</span>
            <span className="text-xs text-muted-foreground">
              {tool.installedVersion ?? tool.requiredVersion}
            </span>
            <Badge
              className="ml-auto"
              tone={
                tool.state === 'ok' ? 'success' : tool.state === 'unsupported' ? 'muted' : 'warning'
              }
            >
              {t(`welcome.tools.state.${tool.state}`)}
            </Badge>
          </li>
        ))}
      </ul>
      {report.data?.offline ? (
        <p className="flex items-center gap-2 text-xs text-warning">
          <WifiOff className="size-3.5" />
          {t('welcome.tools.offline')}
        </p>
      ) : null}
      {report.data?.ready ? (
        <p className="flex items-center gap-2 text-sm text-success">
          <CheckCircle2 className="size-4" />
          {t('welcome.tools.ready')}
        </p>
      ) : missing.length > 0 ? (
        <div className="grid gap-2">
          <Button
            variant="default"
            className="justify-self-start"
            disabled={install.isPending}
            onClick={() => install.mutate(missing.map((tool) => tool.name))}
          >
            <Download />
            {install.isPending ? t('welcome.tools.installing') : t('welcome.tools.install')}
          </Button>
          {install.isPending
            ? progress.map((p) => (
                <div key={p.archive} className="grid gap-1 text-xs text-muted-foreground">
                  <span>
                    {p.archive} · {p.phase}
                  </span>
                  <Progress value={p.total ? p.received / p.total : undefined} />
                </div>
              ))
            : null}
          {install.data?.outcome === 'declined' || install.data?.outcome === 'cancelled' ? (
            <p className="text-xs text-muted-foreground">{t('welcome.tools.declined')}</p>
          ) : null}
          {install.error ? (
            <p role="alert" className="text-xs text-destructive">
              {errorMessage(install.error)}
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}
