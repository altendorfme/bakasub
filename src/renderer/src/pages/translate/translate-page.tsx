import { useCallback, useReducer, useState } from 'react'
import { Info } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { FileDrop } from '@renderer/components/files/file-drop'
import { JobDetail } from '@renderer/components/jobs/job-detail'
import { Backdrop } from '@renderer/components/media/backdrop'
import type { MediaChoice } from '@renderer/components/media/media-choice'
import { MediaPanel } from '@renderer/components/media/media-panel'
import { TrackPicker } from '@renderer/components/media/track-picker'
import { Button } from '@renderer/components/ui/button'
import { Dialog, DialogClose, DialogContent, DialogFooter } from '@renderer/components/ui/dialog'
import { useCreateJob, useJob } from '@renderer/data/jobs'
import { useMediaLookup, useProbe } from '@renderer/data/media'
import { usePresets } from '@renderer/data/presets'
import { useSettings } from '@renderer/data/settings'
import { errorMessage } from '@renderer/i18n/error-message'
import { existingTarget } from '@renderer/lib/existing-subtitle'
import { languageName } from '@renderer/lib/languages'
import { OutputStep } from './output-step'
import { PresetStep } from './preset-step'
import { StepBar } from './step-bar'
import { WizardSummary } from './wizard-summary'
import {
  buildJobRequest,
  canContinue,
  canGo,
  initialWizard,
  stepsFor,
  stepValid,
  wizardReducer,
  type WizardStep
} from './wizard-state'

/**
 * "Translate a file": file → track (video) → preset & context → output → job (preflight, progress).
 * `onBack`: from the first step, back to the "one file / several" choice.
 */
export function TranslatePage({ onBack }: { onBack?: () => void } = {}): React.JSX.Element {
  const { t, i18n } = useTranslation()
  const [state, dispatch] = useReducer(wizardReducer, initialWizard)
  const [jobId, setJobId] = useState<string | null>(null)
  const [confirmExisting, setConfirmExisting] = useState(false)
  const settings = useSettings().data
  const presets = usePresets().data ?? []
  const create = useCreateJob()
  const onTrack = useCallback(
    (ids: number[]) => ids[0] !== undefined && dispatch({ type: 'track', trackId: ids[0] }),
    []
  )
  const onMedia = useCallback(
    (patch: Partial<MediaChoice>) => dispatch({ type: 'media', patch }),
    []
  )

  const defaults = {
    model: settings?.['translation.defaultModel'] ?? null,
    targetLang: settings?.['translation.defaultTargetLang'] ?? null
  }
  const model = state.model ?? defaults.model
  const targetLang = state.targetLang ?? defaults.targetLang
  const presetId = state.presetId ?? settings?.['translation.defaultPresetId']
  const preset = presets.find((p) => p.id === presetId)

  // Cached queries: the same keys the steps already use.
  const video = state.file?.kind === 'video' ? state.file.path : null
  const probe = useProbe(video).data
  const track = probe?.subtitles.find((tr) => tr.id === state.trackId)
  const chosen = useMediaLookup(state.media.include ? state.media.ref : null, null).data
  const created = useJob(jobId).data
  // Artwork: the chosen title while editing, the job's frozen media afterwards.
  const backdrop = jobId ? created?.media?.backdropUrl : chosen?.details.backdropUrl
  const existing = state.file
    ? existingTarget(targetLang, {
        path: state.file.path,
        kind: state.file.kind,
        tracks: probe?.subtitles
      })
    : null
  const targetName = targetLang ? languageName(targetLang, i18n.language) : ''

  const steps = stepsFor(state.file?.kind)
  const index = steps.indexOf(state.step)
  const last = index === steps.length - 1
  const ready = canContinue(state, defaults)
  const reachable = (s: WizardStep): boolean => canGo(state, s, defaults)
  const go = (s: WizardStep): void => dispatch({ type: 'go', step: s, defaults })

  const createJob = (): void =>
    create.mutate(buildJobRequest(state), {
      onSuccess: (job) => {
        setConfirmExisting(false)
        setJobId(job.id)
      },
      onError: (err) => toast.error(errorMessage(err))
    })
  // Already has a subtitle in the target language: ask first (never silently).
  const start = (): void => (existing ? setConfirmExisting(true) : createJob())

  return (
    <div className="relative min-h-full">
      <Backdrop url={backdrop} />
      <div className="relative mx-auto grid max-w-6xl gap-5 px-6 py-7">
        <h1 className="text-xl font-semibold tracking-tight">{t('pages.translate.title')}</h1>

        {jobId ? (
          <section className="mx-auto w-full max-w-3xl rounded-xl border bg-card/92 p-5">
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
            <StepBar
              steps={steps}
              current={state.step}
              label={(s) => t(`translate.steps.${s}`)}
              done={(s) => steps.indexOf(s) <= state.furthest && stepValid(state, s, defaults)}
              reachable={reachable}
              onGo={go}
            />
            {state.notice === 'file-changed' ? (
              <p
                role="status"
                className="mx-auto flex items-center gap-2 rounded-md bg-warning/10 px-3 py-2 text-sm text-warning"
              >
                <Info className="size-4 shrink-0" />
                {t('translate.fileChanged')}
              </p>
            ) : null}

            <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_17rem]">
              <div className="grid min-w-0 gap-5">
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
                      <p className="-mt-2 text-sm text-muted-foreground">
                        {t('translate.file.body')}
                      </p>
                      <FileDrop
                        path={state.file?.path ?? null}
                        onFile={(path) => dispatch({ type: 'file', path })}
                      />
                    </>
                  ) : null}
                  {state.step === 'track' && state.file ? (
                    <TrackPicker
                      path={state.file.path}
                      mode="single"
                      value={state.trackId === null ? [] : [state.trackId]}
                      onChange={onTrack}
                    />
                  ) : null}
                  {state.step === 'preset' ? (
                    <PresetStep
                      value={state}
                      onChange={(patch) => dispatch({ type: 'set', patch })}
                    />
                  ) : null}
                  {state.step === 'output' ? (
                    <OutputStep
                      video={state.file?.kind === 'video'}
                      outputDir={state.outputDir}
                      mux={state.mux}
                      onFolder={(outputDir) => dispatch({ type: 'set', patch: { outputDir } })}
                      onMux={(patch) => dispatch({ type: 'mux', patch })}
                    />
                  ) : null}

                  <div className="flex items-center justify-end gap-2 border-t pt-4">
                    {index > 0 || onBack ? (
                      <Button
                        variant="ghost"
                        className="mr-auto"
                        onClick={() => (index > 0 ? dispatch({ type: 'back' }) : onBack?.())}
                      >
                        {index > 0 ? t('translate.back') : t('choose.back')}
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
              </div>

              <WizardSummary
                state={state}
                preset={preset}
                model={model}
                targetLang={targetLang}
                track={track}
                media={chosen}
                existing={existing}
                canGo={reachable}
                onGo={go}
              />
            </div>
          </>
        )}
      </div>

      <Dialog open={confirmExisting} onOpenChange={setConfirmExisting}>
        <DialogContent
          title={t('translate.existing.title', { language: targetName })}
          description={
            existing?.where === 'track'
              ? t('translate.existing.track', {
                  language: targetName,
                  name: existing.track.name ?? `#${existing.track.id}`
                })
              : t('translate.existing.file', { language: targetName })
          }
        >
          <DialogFooter>
            <DialogClose asChild>
              <Button>{t('actions.cancel')}</Button>
            </DialogClose>
            <Button variant="default" disabled={create.isPending} onClick={createJob}>
              {t('translate.existing.go')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
