import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { OutputFolder } from '@renderer/components/files/output-folder'
import { Button } from '@renderer/components/ui/button'
import { useCreateBatch, useExtractPlan } from '@renderer/data/batches'
import { IpcCallError } from '@renderer/lib/ipc'
import { errorMessage } from '@renderer/i18n/error-message'
import { usePageReducer, usePageState } from '@renderer/lib/page-state'
import { StepBar } from '../../translate/step-bar'
import { SimpleBatchRun } from '@renderer/components/jobs/simple-batch-run'
import {
  EXTRACT_BATCH_STEPS,
  buildExtractRequest,
  buildRows,
  extractBatchReducer,
  extractCanGo,
  extractStepValid,
  failedItem,
  initialExtractBatch,
  type ExtractBatchStep
} from './extract-batch-state'
import { ExtractFilesStep } from './extract-files-step'
import { ExtractTracksStep } from './extract-tracks-step'

/** "Extract from several files": files → tracks → output → batch progress (no cost step). */
export function ExtractBatchWizard({
  onSwitchMode
}: {
  onSwitchMode: () => void
}): React.JSX.Element {
  const { t } = useTranslation()
  const [state, dispatch] = usePageReducer(
    'extract.batch',
    extractBatchReducer,
    initialExtractBatch
  )
  const [batchId, setBatchId] = usePageState<string | null>('extract.batch.id', null)
  const [failure, setFailure] = useState<{ path: string; file: string; reason: string } | null>(
    null
  )
  const create = useCreateBatch()
  const planQuery = useExtractPlan(state.source)
  const plan = planQuery.data ?? null
  const rows = useMemo(() => (plan ? buildRows(plan, state.edits) : null), [plan, state.edits])

  const steps = EXTRACT_BATCH_STEPS
  const step = state.step
  const index = steps.indexOf(step)
  const last = index === steps.length - 1
  const valid = (s: ExtractBatchStep): boolean => extractStepValid(s, rows)
  const go = (s: ExtractBatchStep): void => dispatch({ type: 'go', step: s })
  const included = rows?.filter((r) => r.include).length ?? 0

  const start = (): void => {
    if (!plan || !rows) return
    setFailure(null)
    create.mutate(buildExtractRequest(plan, rows, state.outputDir), {
      onSuccess: (b) => setBatchId(b.id),
      onError: (err) => {
        const hit =
          err instanceof IpcCallError && err.code === 'INVALID_INPUT'
            ? failedItem(err.message, rows)
            : null
        if (hit)
          setFailure({ path: hit.row.item.path, file: hit.row.item.relPath, reason: hit.reason })
        else toast.error(errorMessage(err))
      }
    })
  }

  return (
    <div className="mx-auto grid max-w-3xl grid-cols-[minmax(0,1fr)] gap-5 px-6 py-7">
      <div className="grid gap-1">
        <h1 className="text-xl font-semibold tracking-tight">{t('extractBatch.title')}</h1>
        <p className="text-sm text-muted-foreground">{t('extractPage.body')}</p>
      </div>

      {batchId ? (
        <section className="grid grid-cols-[minmax(0,1fr)] min-w-0 rounded-xl border bg-card/92 p-5">
          <SimpleBatchRun
            id={batchId}
            ns="extractBatch"
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
            label={(s) => t(`extractBatch.steps.${s}`)}
            done={(s) => steps.indexOf(s) <= state.furthest && s !== step && valid(s)}
            reachable={(s) => extractCanGo(state, s, valid)}
            onGo={go}
          />
          <section
            className="grid grid-cols-[minmax(0,1fr)] min-w-0 gap-4 rounded-xl border bg-card/92 p-5"
            aria-labelledby="eb-step"
          >
            <h2 id="eb-step" className="text-base font-semibold">
              {t(`extractBatch.${step}.heading`)}
            </h2>
            {step === 'files' ? (
              <ExtractFilesStep
                source={state.source}
                onSource={(source) => {
                  setFailure(null)
                  dispatch({ type: 'source', source })
                }}
                plan={plan}
                pending={planQuery.isFetching && !plan}
                error={planQuery.error}
                rows={rows}
              />
            ) : null}
            {rows && step === 'tracks' ? (
              <ExtractTracksStep
                rows={rows}
                edit={(edits) => dispatch({ type: 'edit', edits })}
                failedPath={failure?.path ?? null}
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
                {plan?.root && state.outputDir ? (
                  <p className="text-xs text-muted-foreground">
                    {t('batch.output.mirror', { root: plan.root })}
                  </p>
                ) : (
                  <p className="text-xs text-muted-foreground">{t('extractBatch.output.next')}</p>
                )}
                <p className="text-sm text-muted-foreground">
                  {t('extractBatch.output.review', {
                    files: included,
                    tracks: rows?.reduce((n, r) => n + (r.include ? r.trackIds.length : 0), 0) ?? 0
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
                  {t('extractBatch.error.item', { file: failure.file })}
                </p>
                <p className="text-xs break-all text-muted-foreground">{failure.reason}</p>
                {step !== 'tracks' ? (
                  <Button
                    size="sm"
                    variant="outline"
                    className="justify-self-start"
                    onClick={() => go('tracks')}
                  >
                    {t('extractBatch.error.fix')}
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
                {index > 0 ? t('translate.back') : t('choose.toSingleExtract')}
              </Button>
              {last ? (
                <Button
                  variant="default"
                  disabled={create.isPending || !steps.every(valid)}
                  onClick={start}
                >
                  {create.isPending
                    ? t('extractBatch.starting')
                    : t('extractBatch.start', { count: included })}
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
