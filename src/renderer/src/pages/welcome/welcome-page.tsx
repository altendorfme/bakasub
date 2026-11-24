import { useState, type ReactNode } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import { Check } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import type { ApiKeyStatus, PublicSettings } from '@shared/ipc-contract'
import { LanguageSelect } from '@renderer/components/common/language-select'
import { Button } from '@renderer/components/ui/button'
import { qk } from '@renderer/data/query-keys'
import { useApiKeyStatus, useSettings } from '@renderer/data/settings'
import { useSidecarReport } from '@renderer/data/sidecars'
import { cn } from '@renderer/lib/utils'
import { KeyStep } from './key-step'
import { LanguagesStep } from './languages-step'
import { ModelsStep } from './models-step'
import { TmdbStep } from './tmdb-step'
import { ToolsPanel } from '@renderer/components/sidecars/tools-panel'

type StepId = 'key' | 'models' | 'languages' | 'tools' | 'tmdb'

interface StepDef {
  id: StepId
  /** Required steps block "Continue" until done; optional ones can be skipped. */
  required: boolean
  body: () => ReactNode
}

const STEPS: readonly StepDef[] = [
  { id: 'key', required: true, body: () => <KeyStep /> },
  { id: 'models', required: true, body: () => <ModelsStep /> },
  { id: 'languages', required: true, body: () => <LanguagesStep /> },
  { id: 'tools', required: false, body: () => <ToolsPanel /> },
  { id: 'tmdb', required: false, body: () => <TmdbStep /> }
]

const isDone = (
  id: StepId,
  key: ApiKeyStatus | undefined,
  s: PublicSettings | undefined,
  toolsReady: boolean
): boolean => {
  switch (id) {
    case 'key':
      return !!key?.present
    case 'models':
      return !!s?.['translation.defaultModel']
    case 'languages':
      return !!s?.['translation.defaultTargetLang']
    case 'tools':
      return toolsReady
    case 'tmdb':
      return false
  }
}

/**
 * First run (and whenever the key, default model or default language is missing): a sequence of
 * steps that save as they go. Opens at the first required step that is not done yet.
 */
export function WelcomePage(): React.JSX.Element {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const qc = useQueryClient()
  const key = useApiKeyStatus().data
  const settings = useSettings().data
  const toolsReady = !!useSidecarReport().data?.ready

  const [index, setIndex] = useState(() => {
    // The route loader already put both in the cache.
    const k = qc.getQueryData<ApiKeyStatus>(qk.settings.apiKey())
    const s = qc.getQueryData<PublicSettings>(qk.settings.all())
    const first = STEPS.findIndex((st) => st.required && !isDone(st.id, k, s, false))
    return first === -1 ? 0 : first
  })
  const step = STEPS[index]
  const done = isDone(step.id, key, settings, toolsReady)
  const last = index === STEPS.length - 1
  const allRequired = STEPS.every((st) => !st.required || isDone(st.id, key, settings, toolsReady))

  const next = (): void => {
    if (last) {
      // Releases the session's auto update check, held while the wizard is open. Best effort.
      void window.api.app.onboardingFinished().catch(() => undefined)
      void navigate({ to: '/translate' })
    } else setIndex(index + 1)
  }

  return (
    <div className="grid min-h-screen place-items-center bg-[radial-gradient(ellipse_at_top,var(--primary-soft),transparent_60%)] p-4">
      <div className="grid w-full max-w-4xl items-center gap-6 md:grid-cols-[13rem_1fr]">
        <aside className="grid content-start gap-4">
          <h1 className="bg-linear-to-r from-primary to-violet bg-clip-text text-2xl font-semibold text-transparent">
            {t('welcome.title')}
          </h1>
          {/* First thing on screen: the rest of the setup reads in the chosen language. */}
          <div className="grid gap-1">
            <label htmlFor="welcome-language" className="text-xs text-muted-foreground">
              {t('settings.general.language')}
            </label>
            <LanguageSelect id="welcome-language" className="w-full" />
          </div>
          <ol className="grid gap-1" aria-label={t('welcome.title')}>
            {STEPS.map((st, i) => {
              const ok = isDone(st.id, key, settings, toolsReady)
              // Later required steps open only once the ones before are done.
              const reachable = STEPS.slice(0, i).every(
                (p) => !p.required || isDone(p.id, key, settings, toolsReady)
              )
              return (
                <li key={st.id}>
                  <button
                    type="button"
                    disabled={!reachable}
                    aria-current={i === index ? 'step' : undefined}
                    onClick={() => setIndex(i)}
                    className={cn(
                      'flex w-full items-center gap-2.5 rounded-md px-2 py-1.5 text-left text-sm disabled:opacity-40',
                      i === index
                        ? 'bg-card text-foreground'
                        : 'text-muted-foreground hover:text-foreground'
                    )}
                  >
                    <span
                      className={cn(
                        'grid size-5 shrink-0 place-items-center rounded-full border text-[11px]',
                        ok
                          ? 'border-success bg-success/15 text-success'
                          : i === index
                            ? 'border-primary text-primary'
                            : ''
                      )}
                    >
                      {ok ? <Check className="size-3" strokeWidth={3} /> : i + 1}
                    </span>
                    {t(`welcome.steps.${st.id}`)}
                  </button>
                </li>
              )
            })}
          </ol>
        </aside>

        <section
          className="grid content-start gap-4 rounded-xl border bg-card/92 p-5 shadow-xl"
          aria-labelledby="welcome-step"
        >
          <div className="grid gap-1">
            <span className="text-xs text-muted-foreground">
              {t('welcome.stepOf', { n: index + 1, total: STEPS.length })}
            </span>
            <h2 id="welcome-step" className="text-lg font-semibold">
              {t(`welcome.${step.id}.heading`)}
            </h2>
            <p className="max-w-[65ch] text-sm text-muted-foreground">
              {t(`welcome.${step.id}.body`)}
            </p>
          </div>

          {step.body()}

          <div className="flex items-center justify-end gap-2 border-t pt-4">
            {step.required && !done && (step.id === 'models' || step.id === 'languages') ? (
              <span className="mr-auto text-xs text-muted-foreground">
                {t(`welcome.${step.id}.needOne`)}
              </span>
            ) : null}
            {!step.required && !done && !last ? (
              <Button variant="ghost" onClick={next}>
                {t('welcome.skip')}
              </Button>
            ) : null}
            <Button
              variant="default"
              disabled={(step.required && !done) || (last && !allRequired)}
              onClick={next}
            >
              {last ? t('welcome.finish') : t('welcome.next')}
            </Button>
          </div>
        </section>
      </div>
    </div>
  )
}
