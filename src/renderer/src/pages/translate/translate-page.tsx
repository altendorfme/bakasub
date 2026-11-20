import { useCallback, useReducer, useState } from 'react'
import { Check } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { JobDetail } from '@renderer/components/jobs/job-detail'
import { Backdrop } from '@renderer/components/media/backdrop'
import type { MediaChoice } from '@renderer/components/media/media-choice'
import { MediaPanel } from '@renderer/components/media/media-panel'
import { Button } from '@renderer/components/ui/button'
import { useCreateJob, useJob } from '@renderer/data/jobs'
import { useMediaLookup } from '@renderer/data/media'
import { useSettings } from '@renderer/data/settings'
import { errorMessage } from '@renderer/i18n/error-message'
import { cn } from '@renderer/lib/utils'
import { FileStep } from './file-step'
import { OutputStep } from './output-step'
import { PresetStep } from './preset-step'
import { TrackStep } from './track-step'
import {
  buildJobRequest,
  canContinue,
  initialWizard,
  stepsFor,
  wizardReducer
} from './wizard-state'

/** "Translate a file": file → track (video) → preset & context → output → job (preflight, progress). */
export function TranslatePage(): React.JSX.Element {
  const { t } = useTranslation()
  const [state, dispatch] = useReducer(wizardReducer, initialWizard)
  const [jobId, setJobId] = useState<string | null>(null)
  const settings = useSettings().data
  const create = useCreateJob()
  const onTrack = useCallback((trackId: number) => dispatch({ type: 'track', trackId }), [])
  const onMedia = useCallback(
    (patch: Partial<MediaChoice>) => dispatch({ type: 'media', patch }),
    []
  )
  // Artwork: the chosen title while editing, the job's frozen media afterwards.
  const chosen = useMediaLookup(state.media.include ? state.media.ref : null, null).data
  const created = useJob(jobId).data
  const backdrop = jobId ? created?.media?.backdropUrl : chosen?.details.backdropUrl

  const steps = stepsFor(state.file?.kind)
  const index = steps.indexOf(state.step)
  const last = index === steps.length - 1
  const defaults = {
    model: settings?.['translation.defaultModel'] ?? null,
    targetLang: settings?.['translation.defaultTargetLang'] ?? null
  }
  const ready = canContinue(state, defaults)

  const start = (): void =>
    create.mutate(buildJobRequest(state), {
      onSuccess: (job) => setJobId(job.id),
      onError: (err) => toast.error(errorMessage(err))
    })

  return (
    <div className="relative min-h-full">
      <Backdrop url={backdrop} />
      <div className="relative mx-auto grid max-w-3xl gap-5 px-6 py-7">
        <h1 className="text-xl font-semibold tracking-tight">{t('pages.translate.title')}</h1>

        {jobId ? (
          <section className="rounded-xl border bg-card/92 p-5">
            <JobDetail
              id={jobId}
              showQueueLink
              onAnother={() => {
                setJobId(null)
                dispatch({ type: 'reset' })
              }}
            />
          </section>
        ) : (
          <>
            <ol className="flex flex-wrap gap-1" aria-label={t('pages.translate.title')}>
              {steps.map((s, i) => (
                <li key={s}>
                  <button
                    type="button"
                    disabled={i > index}
                    aria-current={i === index ? 'step' : undefined}
                    onClick={() => dispatch({ type: 'go', step: s })}
                    className={cn(
                      'flex items-center gap-2 rounded-full px-3 py-1 text-xs disabled:opacity-40',
                      i === index
                        ? 'bg-primary-soft text-primary'
                        : 'text-muted-foreground hover:text-foreground'
                    )}
                  >
                    <span className="grid size-4 place-items-center rounded-full border border-current text-[10px]">
                      {i < index ? <Check className="size-2.5" strokeWidth={3} /> : i + 1}
                    </span>
                    {t(`translate.steps.${s}`)}
                  </button>
                </li>
              ))}
            </ol>

            {state.step === 'preset' && state.file ? (
              <MediaPanel fileName={state.file.name} value={state.media} onChange={onMedia} />
            ) : null}

            <section
              className="grid gap-4 rounded-xl border bg-card/92 p-5"
              aria-labelledby="translate-step"
            >
              <h2 id="translate-step" className="text-base font-semibold">
                {t(`translate.${state.step}.heading`)}
              </h2>
              {state.step === 'file' ? (
                <>
                  <p className="-mt-2 text-sm text-muted-foreground">{t('translate.file.body')}</p>
                  <FileStep file={state.file} onFile={(path) => dispatch({ type: 'file', path })} />
                </>
              ) : null}
              {state.step === 'track' && state.file ? (
                <TrackStep path={state.file.path} trackId={state.trackId} onTrack={onTrack} />
              ) : null}
              {state.step === 'preset' ? (
                <PresetStep state={state} onChange={(patch) => dispatch({ type: 'set', patch })} />
              ) : null}
              {state.step === 'output' ? (
                <OutputStep
                  state={state}
                  onFolder={(outputDir) => dispatch({ type: 'set', patch: { outputDir } })}
                  onMux={(patch) => dispatch({ type: 'mux', patch })}
                />
              ) : null}

              <div className="flex items-center justify-end gap-2 border-t pt-4">
                {index > 0 ? (
                  <Button
                    variant="ghost"
                    className="mr-auto"
                    onClick={() => dispatch({ type: 'back' })}
                  >
                    {t('translate.back')}
                  </Button>
                ) : null}
                {last ? (
                  <Button variant="default" disabled={create.isPending} onClick={start}>
                    {create.isPending ? t('translate.starting') : t('translate.start')}
                  </Button>
                ) : (
                  <Button
                    variant="default"
                    disabled={!ready}
                    onClick={() => dispatch({ type: 'next', defaults })}
                  >
                    {t('translate.next')}
                  </Button>
                )}
              </div>
            </section>
          </>
        )}
      </div>
    </div>
  )
}
