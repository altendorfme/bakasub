import { useAppInfo } from '@renderer/hooks/use-app-info'
import {
  useAppUpdate,
  useInstallSidecars,
  useSidecarProgress,
  useSidecarReport
} from '@renderer/hooks/use-sidecars'

export default function App(): React.JSX.Element {
  const info = useAppInfo()
  const update = useAppUpdate()
  const report = useSidecarReport()
  const install = useInstallSidecars()
  const progress = useSidecarProgress()

  const missing = report.data?.tools.filter((t) => t.state === 'missing' || t.state === 'outdated')

  return (
    <main className="min-h-screen space-y-4 bg-zinc-950 p-8 text-zinc-100">
      <h1 className="text-2xl font-semibold">BakaSub {info.data && `v${info.data.version}`}</h1>

      {update.data?.updateAvailable && (
        <p className="rounded bg-amber-900/40 p-3 text-sm">
          Nova versão disponível: {update.data.latest} (atual {update.data.current})
        </p>
      )}

      <section className="rounded bg-zinc-900 p-4 text-sm">
        <h2 className="mb-2 font-medium">Sidecars</h2>
        {report.isPending && <p className="text-zinc-400">Verificando…</p>}
        {report.error && <p className="text-red-400">{report.error.message}</p>}
        <ul className="space-y-1">
          {report.data?.tools.map((t) => (
            <li key={t.name}>
              {t.name} {t.requiredVersion} — {t.state}
              {t.installedVersion && t.state !== 'ok' && ` (instalada ${t.installedVersion})`}
            </li>
          ))}
        </ul>
        {missing && missing.length > 0 && (
          <button
            className="mt-3 rounded bg-indigo-600 px-3 py-1.5 disabled:opacity-50"
            disabled={install.isPending}
            onClick={() => install.mutate(missing.map((t) => t.name))}
          >
            Instalar componentes…
          </button>
        )}
        {install.data?.outcome === 'declined' && (
          <p className="mt-2 text-zinc-400">Instalação recusada.</p>
        )}
        {install.error && <p className="mt-2 text-red-400">{install.error.message}</p>}
        {install.isPending &&
          Object.values(progress).map((p) => (
            <p key={p.archive} className="mt-1 text-zinc-400">
              {p.archive}: {p.phase}
              {p.total ? ` ${Math.round((p.received / p.total) * 100)}%` : ''}
            </p>
          ))}
      </section>
    </main>
  )
}
