import type {
  BatchCreateRequest,
  BatchMuxPlan,
  BatchMuxPlanFile,
  BatchMuxPlanSubtitle,
  BatchSource
} from '@shared/ipc-contract'

export type MuxBatchStep = 'files' | 'pairing' | 'output'
export const MUX_BATCH_STEPS: readonly MuxBatchStep[] = ['files', 'pairing', 'output']

/** Same limit as the single-file Mux and the Main's `create`. */
export const MAX_SUBS_PER_VIDEO = 32

export interface MuxSubEdit {
  language?: string
  name?: string
}

export interface MuxBatchOptions {
  setDefault: boolean
  keepOriginalSubtitles: boolean
}

/**
 * Everything the user changed on top of the plan. The plan itself is never copied into the
 * state (it is a query): each edit is keyed by the file path.
 */
export interface MuxBatchState {
  step: MuxBatchStep
  furthest: number
  source: BatchSource | null
  /** Subtitle path → the video it goes to, or `null` (left out). No key: the plan's choice. */
  assign: Record<string, string | null>
  /** Videos the user left out. */
  excluded: Record<string, true>
  subs: Record<string, MuxSubEdit>
  /** Video → its default subtitle (`null`: none). No key: its first subtitle. */
  defaults: Record<string, string | null>
  options: MuxBatchOptions
  outputDir: string | null
}

export const initialMuxBatch: MuxBatchState = {
  step: 'files',
  furthest: 0,
  source: null,
  assign: {},
  excluded: {},
  subs: {},
  defaults: {},
  options: { setDefault: true, keepOriginalSubtitles: true },
  outputDir: null
}

export type MuxBatchAction =
  | { type: 'source'; source: BatchSource }
  /** `video: undefined` forgets the edit (back to what the plan said). */
  | { type: 'assign'; sub: string; video: string | null | undefined }
  | { type: 'include'; video: string; include: boolean }
  | { type: 'sub'; path: string; patch: MuxSubEdit }
  | { type: 'default'; video: string; sub: string | null }
  | { type: 'options'; patch: Partial<MuxBatchOptions> }
  | { type: 'outputDir'; dir: string | null }
  | { type: 'go'; step: MuxBatchStep }
  | { type: 'reset' }

export function muxBatchReducer(s: MuxBatchState, a: MuxBatchAction): MuxBatchState {
  switch (a.type) {
    case 'source':
      // Another set of files: the edits no longer apply; options and output folder stay.
      return { ...initialMuxBatch, source: a.source, options: s.options, outputDir: s.outputDir }
    case 'assign': {
      const assign = { ...s.assign }
      if (a.video === undefined) delete assign[a.sub]
      else assign[a.sub] = a.video
      return { ...s, assign }
    }
    case 'include': {
      const excluded = { ...s.excluded }
      if (a.include) delete excluded[a.video]
      else excluded[a.video] = true
      return { ...s, excluded }
    }
    case 'sub':
      return { ...s, subs: { ...s.subs, [a.path]: { ...s.subs[a.path], ...a.patch } } }
    case 'default':
      return { ...s, defaults: { ...s.defaults, [a.video]: a.sub } }
    case 'options':
      return { ...s, options: { ...s.options, ...a.patch } }
    case 'outputDir':
      return { ...s, outputDir: a.dir }
    case 'go':
      return {
        ...s,
        step: a.step,
        furthest: Math.max(s.furthest, MUX_BATCH_STEPS.indexOf(a.step))
      }
    case 'reset':
      return initialMuxBatch
  }
}

export interface MuxSub {
  file: BatchMuxPlanSubtitle
  /** Effective values: plan + edits. */
  language: string
  name: string
  isDefault: boolean
  /** How the plan paired it; `manual` when the user moved it here. */
  matchedBy: 'name' | 'episode' | 'manual'
}

export interface MuxRow {
  video: BatchMuxPlanFile
  subs: MuxSub[]
  /** Has subtitles and was not left out by the user. */
  include: boolean
}

export interface MuxView {
  /** Every video of the plan (paired or not), in plan order. */
  rows: MuxRow[]
  /** Subtitles with no video yet (the plan could not pair them): they block the batch. */
  unresolved: BatchMuxPlanSubtitle[]
  /** Subtitles the user dropped. */
  ignored: BatchMuxPlanSubtitle[]
}

/** Plan + edits. Pure: the wizard recomputes it on every change. */
export function buildView(plan: BatchMuxPlan, s: MuxBatchState): MuxView {
  const videos = [...plan.items.map((i) => i.video), ...plan.unmatchedVideos]
  const known = new Set(videos.map((v) => v.path))
  const planned = new Map<string, { video: string; by: 'name' | 'episode' }>()
  const all: BatchMuxPlanSubtitle[] = []
  for (const item of plan.items)
    for (const sub of item.subtitles) {
      planned.set(sub.path, { video: item.video.path, by: sub.matchedBy })
      all.push(sub)
    }
  all.push(...plan.unmatchedSubtitles)

  const byVideo = new Map<string, MuxSub[]>()
  const unresolved: BatchMuxPlanSubtitle[] = []
  const ignored: BatchMuxPlanSubtitle[] = []
  for (const file of all) {
    const p = planned.get(file.path)
    const edited = file.path in s.assign
    const target = edited ? s.assign[file.path] : (p?.video ?? undefined)
    if (target === null) ignored.push(file)
    else if (target === undefined || !known.has(target)) unresolved.push(file)
    else {
      const e = s.subs[file.path]
      const list = byVideo.get(target) ?? []
      list.push({
        file,
        language: e?.language ?? file.language,
        name: e?.name ?? '',
        isDefault: false,
        matchedBy: !edited && p ? p.by : 'manual'
      })
      byVideo.set(target, list)
    }
  }

  const rows = videos.map((video): MuxRow => {
    const subs = byVideo.get(video.path) ?? []
    const wanted = s.defaults[video.path]
    const chosen =
      wanted === undefined || !subs.some((x) => x.file.path === wanted) ? undefined : wanted
    const defaultPath = wanted === null ? null : (chosen ?? subs[0]?.file.path ?? null)
    return {
      video,
      subs: subs.map((x) => ({ ...x, isDefault: x.file.path === defaultPath })),
      include: subs.length > 0 && !s.excluded[video.path]
    }
  })
  return { rows, unresolved, ignored }
}

/** Subtitles not attached to any video: what can still be added to a video without one. */
export const looseSubtitles = (v: MuxView): BatchMuxPlanSubtitle[] => [
  ...v.unresolved,
  ...v.ignored
]

export const rowOverLimit = (r: MuxRow): boolean => r.subs.length > MAX_SUBS_PER_VIDEO

export function muxStepValid(step: MuxBatchStep, view: MuxView | null): boolean {
  if (!view) return false
  if (step === 'output') return true
  if (step === 'files')
    return (
      view.rows.length > 0 &&
      (view.rows.some((r) => r.subs.length > 0) || view.unresolved.length > 0)
    )
  return (
    view.unresolved.length === 0 &&
    view.rows.some((r) => r.include) &&
    !view.rows.some((r) => r.include && (rowOverLimit(r) || r.subs.some((x) => !x.language)))
  )
}

/** Back to any step; forward to a reached one while every step before it is valid. */
export function muxCanGo(
  s: MuxBatchState,
  target: MuxBatchStep,
  valid: (step: MuxBatchStep) => boolean
): boolean {
  const t = MUX_BATCH_STEPS.indexOf(target)
  if (t <= MUX_BATCH_STEPS.indexOf(s.step)) return true
  return t <= s.furthest + 1 && MUX_BATCH_STEPS.slice(0, t).every(valid)
}

/**
 * With an output folder the Main keeps the folder structure (mirrored from the batch folder;
 * flat for loose files). Videos that land on the same name get a number appended: not an error,
 * but worth telling. Returns the names that repeat.
 */
export function outputCollisions(
  rows: readonly MuxRow[],
  root: string | null,
  outputDir: string | null
): string[] {
  if (!outputDir) return []
  const seen = new Map<string, number>()
  const name = new Map<string, string>()
  for (const r of rows) {
    if (!r.include) continue
    const rel = r.video.relPath.replace(/\\/g, '/')
    const dest = root ? rel : (rel.split('/').pop() ?? rel)
    const key = dest.toLowerCase()
    seen.set(key, (seen.get(key) ?? 0) + 1)
    name.set(key, dest)
  }
  return [...seen].filter(([, n]) => n > 1).map(([k]) => name.get(k)!)
}

/** The `batches:create` request: included videos in plan order, each with its subtitles. */
export function buildMuxBatchRequest(
  plan: BatchMuxPlan,
  rows: readonly MuxRow[],
  s: Pick<MuxBatchState, 'options' | 'outputDir'>
): BatchCreateRequest {
  return {
    kind: 'mux',
    root: plan.root,
    items: rows
      .filter((r) => r.include)
      .map((r) => ({
        video: r.video.path,
        subtitles: r.subs.map((x) => ({
          path: x.file.path,
          language: x.language,
          ...(x.name.trim() ? { name: x.name.trim() } : {}),
          ...(x.isDefault ? { default: true } : {})
        }))
      })),
    ...(s.outputDir ? { outputDir: s.outputDir } : {}),
    options: { ...s.options }
  }
}

/**
 * `INVALID_INPUT` "item N: …" (N: 0-based, among the items sent): the included video to fix and
 * the Main's reason, plus the subtitle the reason names (when it does); `null` when the message
 * does not point at an item.
 */
export function failedItem(
  message: string,
  rows: readonly MuxRow[]
): { row: MuxRow; reason: string; sub: string | null } | null {
  const m = /^item (\d+): (.*)$/s.exec(message)
  const row = m ? rows.filter((r) => r.include)[Number(m[1])] : undefined
  if (!m || !row) return null
  const sub = row.subs.find((x) => m[2].includes(x.file.path))
  return { row, reason: m[2], sub: sub?.file.path ?? null }
}
