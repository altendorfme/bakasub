import type {
  BatchCreateRequest,
  BatchGroup,
  BatchKind,
  BatchPlan,
  BatchSource
} from '@shared/ipc-contract'
import { NOTES_MAX } from '../wizard-state'
import {
  BLOCKING,
  majorityTrack,
  rowProblem,
  type BatchRow,
  type RowEdit,
  type RowProblem
} from './batch-rows'
import {
  autoGroup,
  effectiveSettings,
  rowsOf,
  workOf,
  workPreset,
  type Grouping,
  type PresetSuggestions,
  type WorkSettings
} from './works'

/** Translate flow only: videos → `pipeline`, subtitle files → `translate`. */
export type BatchFlavor = Extract<BatchKind, 'pipeline' | 'translate'>

export type BatchStep = 'files' | 'tracks' | 'works' | 'preset' | 'output'

export const batchSteps = (flavor: BatchFlavor | null): BatchStep[] =>
  flavor === 'translate'
    ? ['files', 'works', 'preset', 'output']
    : ['files', 'tracks', 'works', 'preset', 'output']

export interface BatchOptions extends WorkSettings {
  /** `null` = next to each file (with a folder and an output dir: the structure is mirrored). */
  outputDir: string | null
  mux: { setDefault: boolean; keepOriginalSubtitles: boolean; alsoWriteSubtitle: boolean }
  confirmBeforeTranslate: boolean
}

export interface BatchWizardState {
  step: BatchStep
  furthest: number
  source: BatchSource | null
  /** User pick when the folder has videos and subtitle files; `null` = the first available. */
  flavor: BatchFlavor | null
  edits: Record<string, RowEdit>
  /** `null` = automatic grouping (follows the identification). */
  grouping: Grouping | null
  options: BatchOptions
  /** Random number drawn on every step change: picks the backdrop. */
  draw: number
}

export const initialBatchWizard: BatchWizardState = {
  step: 'files',
  furthest: 0,
  source: null,
  flavor: null,
  edits: {},
  grouping: null,
  options: {
    model: null,
    targetLang: null,
    notes: '',
    outputDir: null,
    mux: { setDefault: true, keepOriginalSubtitles: true, alsoWriteSubtitle: false },
    confirmBeforeTranslate: true
  },
  draw: 0
}

export type BatchWizardAction =
  | { type: 'source'; source: BatchSource }
  | { type: 'flavor'; flavor: BatchFlavor }
  | { type: 'edit'; edits: Record<string, RowEdit> }
  | { type: 'grouping'; grouping: Grouping | null }
  | { type: 'options'; patch: Partial<BatchOptions> }
  /** `index`: of `step` in the current steps; `draw`: a random number (the reducer stays pure). */
  | { type: 'go'; step: BatchStep; index: number; draw: number }
  | { type: 'reset' }

export function batchWizardReducer(s: BatchWizardState, a: BatchWizardAction): BatchWizardState {
  switch (a.type) {
    case 'source':
      // Another set of files: the edits and works no longer apply; the options stay.
      return { ...initialBatchWizard, source: a.source, options: s.options, draw: s.draw }
    case 'flavor':
      return a.flavor === s.flavor
        ? s
        : { ...s, flavor: a.flavor, edits: {}, grouping: null, furthest: 0 }
    case 'edit': {
      const edits = { ...s.edits }
      for (const [path, e] of Object.entries(a.edits)) edits[path] = { ...edits[path], ...e }
      return { ...s, edits }
    }
    case 'grouping':
      return { ...s, grouping: a.grouping }
    case 'options':
      return { ...s, options: { ...s.options, ...a.patch } }
    case 'go':
      if (a.step === s.step) return s
      return { ...s, step: a.step, furthest: Math.max(s.furthest, a.index), draw: a.draw }
    case 'reset':
      return initialBatchWizard
  }
}

/** The grouping in effect: the user's, or the automatic one for these rows. */
export const groupingOf = (s: BatchWizardState, rows: readonly BatchRow[]): Grouping =>
  s.grouping ?? autoGroup(rows)

export const defaultSettings = (o: BatchOptions): WorkSettings => ({
  model: o.model,
  targetLang: o.targetLang,
  notes: o.notes
})

/** Problem of every row, with its work's majority track and media kind. */
export function rowProblems(g: Grouping, rows: readonly BatchRow[]): (RowProblem | null)[] {
  const majority = new Map<string, string | undefined>()
  for (const w of g.works)
    majority.set(
      w.id,
      majorityTrack(
        rowsOf(g, rows, w.id)
          .map((i) => rows[i])
          .filter((r) => r.include)
      )
    )
  return rows.map((r) => {
    const w = workOf(g, r)
    return rowProblem(r, {
      majority: w ? majority.get(w.id) : undefined,
      series: w?.ref?.kind === 'series'
    })
  })
}

/** Defaults from Settings, used when the batch keeps them. */
export interface SettingsDefaults {
  model: string | null
  targetLang: string | null
}

/** Whether a step's own fields are complete. */
export function batchStepValid(
  step: BatchStep,
  ctx: {
    rows: readonly BatchRow[] | null
    grouping: Grouping
    options: BatchOptions
    defaults: SettingsDefaults
  }
): boolean {
  const rows = ctx.rows
  switch (step) {
    case 'files':
      return !!rows && rows.some((r) => r.include)
    case 'tracks':
      return !!rows && !rowProblems(ctx.grouping, rows).some((p) => p !== null && BLOCKING.has(p))
    case 'works':
      return true
    case 'preset': {
      const used = ctx.grouping.works.filter((w) =>
        rowsOf(ctx.grouping, rows ?? [], w.id).some((i) => rows![i].include)
      )
      const sets = [
        defaultSettings(ctx.options),
        ...used.flatMap((w) => (w.custom ? [w.custom] : []))
      ]
      return sets.every(
        (x) =>
          !!(x.model ?? ctx.defaults.model) &&
          !!(x.targetLang ?? ctx.defaults.targetLang) &&
          x.notes.length <= NOTES_MAX
      )
    }
    case 'output':
      return true
  }
}

/** Back to any step; forward to a reached one while every step before it is valid. */
export function batchCanGo(
  s: BatchWizardState,
  steps: readonly BatchStep[],
  target: BatchStep,
  valid: (step: BatchStep) => boolean
): boolean {
  const t = steps.indexOf(target)
  if (t === -1) return false
  if (t <= steps.indexOf(s.step)) return true
  return t <= s.furthest + 1 && steps.slice(0, t).every(valid)
}

const trimmed = (notes: string): string | undefined => notes.trim() || undefined

/**
 * The `batches:create` request: included files in plan order, each pointing at its work.
 * Unset defaults are left to the Main (Settings); a customized work sends all its settings. The
 * preset is always the work's (the user's pick or the TMDB suggestion).
 */
export function buildBatchRequest(
  plan: BatchPlan,
  rows: readonly BatchRow[],
  g: Grouping,
  o: BatchOptions,
  suggestions: PresetSuggestions = {}
): BatchCreateRequest {
  const included = rows.filter((r) => r.include)
  const used = g.works.filter((w) => included.some((r) => g.of[r.item.path] === w.id))
  const index = new Map(used.map((w, i) => [w.id, i]))
  const groups: BatchGroup[] = used.map((w) => {
    const s = w.custom ? effectiveSettings(w, defaultSettings(o)) : null
    const presetId = workPreset(w, suggestions)
    return {
      name: w.name.trim() || undefined,
      ...(w.ref && w.includeMedia ? { media: w.ref } : {}),
      ...(presetId ? { presetId } : {}),
      ...(s?.model ? { model: s.model } : {}),
      ...(s?.targetLang ? { targetLang: s.targetLang } : {}),
      ...(s ? { notes: s.notes.trim() } : {})
    }
  })
  const notes = trimmed(o.notes)
  return {
    kind: plan.kind,
    root: plan.root,
    items: included.map((r) => {
      const w = workOf(g, r)!
      const episode =
        w.ref?.kind === 'series' && w.includeMedia && r.season !== null && r.episode !== null
          ? { season: r.season, episode: r.episode }
          : {}
      return {
        path: r.item.path,
        ...(plan.kind === 'pipeline' && r.trackId !== null ? { trackIds: [r.trackId] } : {}),
        group: index.get(w.id)!,
        ...episode
      }
    }),
    groups,
    ...(o.model ? { model: o.model } : {}),
    ...(o.targetLang ? { targetLang: o.targetLang } : {}),
    ...(notes ? { notes } : {}),
    ...(o.outputDir ? { outputDir: o.outputDir } : {}),
    ...(plan.kind === 'pipeline' ? { options: { ...o.mux } } : {}),
    confirmBeforeTranslate: o.confirmBeforeTranslate
  }
}
