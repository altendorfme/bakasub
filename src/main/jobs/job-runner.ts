import type { JobProgress, JobResult, JobStep } from '../../shared/ipc-contract'
import { isStepComplete, type Artifacts } from './artifacts'
import type { JobSpec } from './job-spec'
import { planFor, STEPS } from './plan'
import type { StepDeps } from './step-context'

export interface RunHooks {
  readonly signal: AbortSignal
  /** Persistir a etapa corrente antes de executá-la. */
  onStep(step: JobStep): Promise<void>
  /** Persistir os artefatos após cada etapa concluída (base do retry). */
  onArtifacts(artifacts: Artifacts): Promise<void>
  onProgress(progress: JobProgress): void
}

export interface RunOutcome {
  readonly status: 'completed' | 'completed-with-warnings' | 'awaiting-confirmation'
  readonly result: JobResult
}

/** Falha numa etapa: carrega onde parou e o resultado parcial (ex.: custo já gasto). */
export class StepFailure extends Error {
  constructor(
    readonly step: JobStep,
    override readonly cause: unknown,
    readonly partial: JobResult
  ) {
    super(cause instanceof Error ? cause.message : String(cause))
    this.name = 'StepFailure'
  }
}

/**
 * Executa as etapas de UM job, retomando da primeira etapa cujo artefato não confere (retry).
 * Não conhece fila, banco nem IPC: só `hooks`.
 */
export class JobRunner {
  constructor(private readonly deps: StepDeps) {}

  async run(
    input: { spec: JobSpec; artifacts: Artifacts; workDir: string },
    hooks: RunHooks
  ): Promise<RunOutcome> {
    const plan = planFor(input.spec)
    const artifacts: Artifacts = structuredClone(input.artifacts)

    let start = 0
    while (start < plan.length && (await isStepComplete(plan[start], artifacts))) start++
    // Tudo a partir da primeira etapa incompleta é refeito: artefatos posteriores são descartados.
    for (const step of plan.slice(start)) delete artifacts[step]

    const warnings: string[] = []
    let usage: JobResult['usage'] = artifacts.translate?.usage
    const partial = (): JobResult => this.result(artifacts, warnings, usage)

    for (const step of plan.slice(start)) {
      // Preflight pediu confirmação: encerra aqui (libera o slot); `jobs:confirm` retoma.
      if (step === 'translate' && artifacts.preflight?.estimate.decision === 'needs-confirmation')
        return { status: 'awaiting-confirmation', result: partial() }
      await hooks.onStep(step)
      hooks.onProgress({ step })
      try {
        await STEPS[step]({
          spec: input.spec,
          workDir: input.workDir,
          artifacts,
          signal: hooks.signal,
          deps: this.deps,
          progress: (p) => hooks.onProgress({ step, ...p }),
          warn: (m) => warnings.push(m),
          recordUsage: (u) => {
            usage = u
          }
        })
      } catch (err) {
        throw new StepFailure(step, err, partial())
      }
      await hooks.onArtifacts(artifacts)
    }

    const result = partial()
    const warned = result.warnings.length > 0 || (result.failedLines?.length ?? 0) > 0
    return { status: warned ? 'completed-with-warnings' : 'completed', result }
  }

  private result(a: Artifacts, warnings: string[], usage: JobResult['usage']): JobResult {
    return {
      outputs: [...(a.write?.outputs ?? []), ...(a.mux ? [a.mux.output] : [])],
      warnings: [...warnings],
      ...(usage ? { usage } : {}),
      ...(a.translate
        ? {
            cache: a.translate.cache,
            failedLines: a.translate.failedLines,
            ...(a.translate.consistency ? { consistency: a.translate.consistency } : {})
          }
        : {}),
      ...(a.preflight ? { preflight: a.preflight.estimate } : {})
    }
  }
}
