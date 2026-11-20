import { useMemo, useReducer, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { Button } from '@renderer/components/ui/button'
import { useBatchPlans, useCreateBatch, useIdentifyAll } from '@renderer/data/batches'
import { useSettings } from '@renderer/data/settings'
import { errorMessage } from '@renderer/i18n/error-message'
import { StepBar } from '../step-bar'
import { BatchBackdrop } from './batch-backdrop'
import { BatchDetail } from './batch-detail'
import { BatchOutputStep } from './batch-output-step'
import type { BatchCtx } from './batch-ctx'
import { applyEdits, seedRows } from './batch-rows'
import {
  batchCanGo,
  batchStepValid,
  batchSteps,
  batchWizardReducer,
  buildBatchRequest,
  groupingOf,
  initialBatchWizard,
  rowProblems,
  type BatchFlavor,
  type BatchStep
} from './batch-state'
import { BatchSummary } from './batch-summary'
import { FilesStep } from './files-step'
import { SettingsStep } from './settings-step'
import { TracksStep } from './tracks-step'
import { WorksStep } from './works-step'
import { rowsOf } from './works'

const FLAVORS: readonly BatchFlavor[] = ['pipeline', 'translate']

/** New backdrop draw on each step change (called from event handlers only). */
const newDraw = (): number => Math.random()

/**
 * "Translate several files": files → tracks (videos) → works → preset & context (per work) →
 * output → batch (progress, total cost). Same look as the single-file wizard.
 */
export function BatchWizard({ onBack }: { onBack: () => void }): React.JSX.Element {
  const { t } = useTranslation()
  const [state, dispatch] = useReducer(batchWizardReducer, initialBatchWizard)
  const [batchId, setBatchId] = useState<string | null>(null)
  const settings = useSettings().data
  const defaults = {
    model: settings?.['translation.defaultModel'] ?? null,
    targetLang: settings?.['translation.defaultTargetLang'] ?? null
  }
  const create = useCreateBatch()

  const plans = useBatchPlans(state.source)
  const available = FLAVORS.filter((k) => (plans[k]?.items.length ?? 0) > 0)
  const flavor =
    state.flavor && available.includes(state.flavor) ? state.flavor : (available[0] ?? null)
  const plan = flavor ? plans[flavor] : undefined
  const identify = useIdentifyAll(plan?.items ?? [])
  // Rows only once every file is identified: the automatic grouping depends on it.
  const ids = identify.settled ? identify.data : null
  const idsKey = ids?.map((x) => x?.match?.id ?? x?.release.title ?? '').join('|')
  const seeded = useMemo(
    () => (plan && ids ? seedRows(plan, ids) : null),
    // `ids` is a new array every render; its content is what matters.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [plan, idsKey]
  )
  const rows = useMemo(
    () => (seeded ? applyEdits(seeded, state.edits) : null),
    [seeded, state.edits]
  )
  const grouping = groupingOf(state, rows ?? [])
  const problems = rows ? rowProblems(grouping, rows) : []

  const ctx: BatchCtx | null =
    plan && flavor && rows
      ? {
          plan,
          flavor,
          rows,
          grouping,
          regrouped: state.grouping !== null,
          problems,
          options: state.options,
          edit: (edits) => dispatch({ type: 'edit', edits }),
          setGrouping: (g) => dispatch({ type: 'grouping', grouping: g }),
          setOptions: (patch) => dispatch({ type: 'options', patch })
        }
      : null

  const steps = batchSteps(flavor)
  const step = steps.includes(state.step) ? state.step : 'files'
  const index = steps.indexOf(step)
  const last = index === steps.length - 1
  const valid = (s: BatchStep): boolean =>
    batchStepValid(s, { rows, grouping, options: state.options, defaults })
  const reachable = (s: BatchStep): boolean => batchCanGo({ ...state, step }, steps, s, valid)
  const go = (s: BatchStep): void =>
    dispatch({ type: 'go', step: s, index: steps.indexOf(s), draw: newDraw() })

  // Like the single-file wizard: artwork only once the works are known (from Works on), and
  // only of works whose media context goes to the AI.
  const backdropRefs =
    ctx && index >= steps.indexOf('works')
      ? grouping.works.flatMap((w) =>
          w.ref &&
          w.includeMedia &&
          rowsOf(grouping, ctx.rows, w.id).some((i) => ctx.rows[i].include)
            ? [w.ref]
            : []
        )
      : []

  const start = (): void => {
    if (!ctx) return
    create.mutate(buildBatchRequest(ctx.plan, ctx.rows, grouping, state.options), {
      onSuccess: (b) => setBatchId(b.id),
      onError: (err) => toast.error(errorMessage(err))
    })
  }
  const included = rows?.filter((r) => r.include).length ?? 0

  return (
    <div className="relative min-h-full">
      {!batchId ? <BatchBackdrop refs={backdropRefs} draw={state.draw} /> : null}
      <div className="relative mx-auto grid max-w-6xl gap-5 px-6 py-7">
        <h1 className="text-xl font-semibold tracking-tight">{t('batch.title')}</h1>

        {batchId ? (
          <section className="mx-auto w-full max-w-3xl rounded-xl border bg-card/92 p-5">
            <BatchDetail
              id={batchId}
              onAnother={() => {
                setBatchId(null)
                dispatch({ type: 'reset' })
              }}
            />
          </section>
        ) : (
          <>
            <StepBar
              steps={steps}
              current={step}
              label={(s) => t(`batch.steps.${s}`)}
              done={(s) => steps.indexOf(s) <= state.furthest && s !== step && valid(s)}
              reachable={reachable}
              onGo={go}
            />
            <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_17rem]">
              <section
                className="grid min-w-0 gap-4 rounded-xl border bg-card/92 p-5"
                aria-labelledby="batch-step"
              >
                <h2 id="batch-step" className="text-base font-semibold">
                  {t(`batch.${step}.heading`)}
                </h2>
                {step === 'files' ? (
                  <FilesStep
                    source={state.source}
                    onSource={(source) => dispatch({ type: 'source', source })}
                    plans={plans}
                    flavor={flavor}
                    onFlavor={(f) => dispatch({ type: 'flavor', flavor: f })}
                    identifying={!!plan && !identify.settled}
                    ctx={ctx}
                  />
                ) : null}
                {ctx && step === 'tracks' ? <TracksStep ctx={ctx} /> : null}
                {ctx && step === 'works' ? <WorksStep ctx={ctx} /> : null}
                {ctx && step === 'preset' ? <SettingsStep ctx={ctx} /> : null}
                {ctx && step === 'output' ? <BatchOutputStep ctx={ctx} /> : null}

                <div className="flex items-center justify-end gap-2 border-t pt-4">
                  <Button
                    variant="ghost"
                    className="mr-auto"
                    onClick={() => (index > 0 ? go(steps[index - 1]) : onBack())}
                  >
                    {index > 0 ? t('translate.back') : t('choose.back')}
                  </Button>
                  {last ? (
                    <Button
                      variant="default"
                      disabled={create.isPending || !steps.every(valid)}
                      onClick={start}
                    >
                      {create.isPending
                        ? t('batch.starting')
                        : t('batch.start', { count: included })}
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
              <BatchSummary
                source={state.source}
                ctx={ctx}
                steps={steps}
                current={step}
                canGo={reachable}
                onGo={go}
              />
            </div>
          </>
        )}
      </div>
    </div>
  )
}
