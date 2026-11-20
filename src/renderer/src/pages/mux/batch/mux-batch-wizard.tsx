import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { OutputFolder } from '@renderer/components/files/output-folder'
import { SimpleBatchRun } from '@renderer/components/jobs/simple-batch-run'
import { Button } from '@renderer/components/ui/button'
import { Checkbox } from '@renderer/components/ui/checkbox'
import { useCreateBatch, useMuxPlan } from '@renderer/data/batches'
import { errorMessage } from '@renderer/i18n/error-message'
import { IpcCallError } from '@renderer/lib/ipc'
import { usePageReducer, usePageState } from '@renderer/lib/page-state'
import { StepBar } from '../../translate/step-bar'
import {
  MUX_BATCH_STEPS,
  buildMuxBatchRequest,
  buildView,
  failedItem,
  initialMuxBatch,
  muxBatchReducer,
  muxCanGo,
  muxStepValid,
  outputCollisions,
  type MuxBatchStep
} from './mux-batch-state'
import { MuxFilesStep } from './mux-files-step'
import { MuxPairingStep } from './mux-pairing-step'

interface Failure {
  path: string
  file: string
  reason: string
  sub: string | null
}

/** "Mux several files": files → pairing → output → batch progress (no cost step). */
export function MuxBatchWizard({ onSwitchMode }: { onSwitchMode: () => void }): React.JSX.Element {
  const { t } = useTranslation()
  const [state, dispatch] = usePageReducer('mux.batch', muxBatchReducer, initialMuxBatch)
  const [batchId, setBatchId] = usePageState<string | null>('mux.batch.id', null)
  const [failure, setFailure] = useState<Failure | null>(null)
  const create = useCreateBatch()
  const planQuery = useMuxPlan(state.source)
  const plan = planQuery.data ?? null
  const view = useMemo(() => (plan ? buildView(plan, state) : null), [plan, state])

  const steps = MUX_BATCH_STEPS
  const step = state.step
  const index = steps.indexOf(step)
  const last = index === steps.length - 1
  const valid = (s: MuxBatchStep): boolean => muxStepValid(s, view)
  const go = (s: MuxBatchStep): void => dispatch({ type: 'go', step: s })
  const included = view?.rows.filter((r) => r.include) ?? []
  const collisions = view ? outputCollisions(view.rows, plan?.root ?? null, state.outputDir) : []

  const edit = (a: Parameters<typeof dispatch>[0]): void => {
    setFailure(null)
    dispatch(a)
  }

  const start = (): void => {
    if (!plan || !view) return
    setFailure(null)
    create.mutate(buildMuxBatchRequest(plan, view.rows, state), {
      onSuccess: (b) => setBatchId(b.id),
      onError: (err) => {
        const hit =
          err instanceof IpcCallError && err.code === 'INVALID_INPUT'
            ? failedItem(err.message, view.rows)
            : null
        if (hit)
          setFailure({
            path: hit.row.video.path,
            file: hit.row.video.relPath,
            reason: hit.reason,
            sub: hit.sub
          })
        else toast.error(errorMessage(err))
      }
    })
  }

  return (
    <div className="mx-auto grid max-w-3xl grid-cols-[minmax(0,1fr)] gap-5 px-6 py-7">
      <div className="grid gap-1">
        <h1 className="text-xl font-semibold tracking-tight">{t('muxBatch.title')}</h1>
        <p className="text-sm text-muted-foreground">{t('muxPage.body')}</p>
      </div>

      {batchId ? (
        <section className="grid grid-cols-[minmax(0,1fr)] min-w-0 rounded-xl border bg-card/92 p-5">
          <SimpleBatchRun
            id={batchId}
            ns="muxBatch"
            onAnother={() => {
              setBatchId(null)
              setFailure(null)
              dispatch({ type: 'reset' })
            }}
          />
        </section>
      ) : (
        <>
          <StepBar
            steps={steps}
            current={step}
            label={(s) => t(`muxBatch.steps.${s}`)}
            done={(s) => steps.indexOf(s) <= state.furthest && s !== step && valid(s)}
            reachable={(s) => muxCanGo(state, s, valid)}
            onGo={go}
          />
          <section
            className="grid grid-cols-[minmax(0,1fr)] min-w-0 gap-4 rounded-xl border bg-card/92 p-5"
            aria-labelledby="mb-step"
          >
            <h2 id="mb-step" className="text-base font-semibold">
              {t(`muxBatch.${step}.heading`)}
            </h2>
            {step === 'files' ? (
              <MuxFilesStep
                source={state.source}
                onSource={(source) => {
                  setFailure(null)
                  dispatch({ type: 'source', source })
                }}
                plan={plan}
                view={view}
                pending={planQuery.isFetching && !plan}
                error={planQuery.error}
              />
            ) : null}
            {view && step === 'pairing' ? (
              <MuxPairingStep
                view={view}
                dispatch={edit}
                failedPath={failure?.path ?? null}
                failedSub={failure?.sub ?? null}
              />
            ) : null}
            {step === 'output' ? (
              <div className="grid gap-4">
                <div className="grid gap-1.5">
                  <span className="text-sm font-medium">{t('extractPage.output')}</span>
                  <OutputFolder
                    value={state.outputDir}
                    onChange={(dir) => dispatch({ type: 'outputDir', dir })}
                  />
                </div>
                <div className="grid gap-2">
                  <h3 className="text-sm font-medium">{t('muxPage.options')}</h3>
                  <label className="flex items-center gap-2.5 text-sm">
                    <Checkbox
                      checked={state.options.setDefault}
                      onCheckedChange={(v) =>
                        dispatch({ type: 'options', patch: { setDefault: v === true } })
                      }
                    />
                    {t('muxPage.setDefault')}
                  </label>
                  <label className="flex items-center gap-2.5 text-sm">
                    <Checkbox
                      checked={state.options.keepOriginalSubtitles}
                      onCheckedChange={(v) =>
                        dispatch({ type: 'options', patch: { keepOriginalSubtitles: v === true } })
                      }
                    />
                    {t('muxPage.keepOriginal')}
                  </label>
                </div>
                {plan?.root && state.outputDir ? (
                  <p className="text-xs text-muted-foreground">
                    {t('batch.output.mirror', { root: plan.root })}
                  </p>
                ) : (
                  <p className="text-xs text-muted-foreground">{t('muxBatch.output.next')}</p>
                )}
                {collisions.length ? (
                  <div role="status" className="grid gap-1 text-xs text-warning">
                    <p>{t('muxBatch.output.collision', { count: collisions.length })}</p>
                    <ul className="grid gap-0.5 break-all text-muted-foreground">
                      {collisions.slice(0, 5).map((c) => (
                        <li key={c}>{c}</li>
                      ))}
                    </ul>
                  </div>
                ) : null}
                <p className="text-xs text-muted-foreground">{t('muxBatch.output.space')}</p>
                <p className="text-sm text-muted-foreground">
                  {t('muxBatch.output.review', {
                    videos: included.length,
                    subs: included.reduce((n, r) => n + r.subs.length, 0)
                  })}
                </p>
              </div>
            ) : null}

            {failure ? (
              <div
                role="alert"
                className="grid gap-1 rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-sm"
              >
                <p className="font-medium text-destructive">
                  {t('muxBatch.error.item', { file: failure.file })}
                </p>
                <p className="text-xs break-all text-muted-foreground">{failure.reason}</p>
                {step !== 'pairing' ? (
                  <Button
                    size="sm"
                    variant="outline"
                    className="justify-self-start"
                    onClick={() => go('pairing')}
                  >
                    {t('muxBatch.error.fix')}
                  </Button>
                ) : null}
              </div>
            ) : null}

            <div className="flex items-center justify-end gap-2 border-t pt-4">
              <Button
                variant="ghost"
                className="mr-auto"
                onClick={() => (index > 0 ? go(steps[index - 1]) : onSwitchMode())}
              >
                {index > 0 ? t('translate.back') : t('choose.toSingleMux')}
              </Button>
              {step === 'pairing' && view?.unresolved.length ? (
                <span className="text-xs text-warning">
                  {t('muxBatch.pairing.blocked', { count: view.unresolved.length })}
                </span>
              ) : null}
              {last ? (
                <Button
                  variant="default"
                  disabled={create.isPending || !steps.every(valid)}
                  onClick={start}
                >
                  {create.isPending
                    ? t('muxBatch.starting')
                    : t('muxBatch.start', { count: included.length })}
                </Button>
              ) : (
                <Button
                  variant="default"
                  disabled={!valid(step)}
                  onClick={() => go(steps[index + 1])}
                >
                  {t('translate.next')}
                </Button>
              )}
            </div>
          </section>
        </>
      )}
    </div>
  )
}
