import type {
  BatchCreateRequest,
  BatchPlan,
  BatchPlanItem,
  BatchSource,
  SubtitleTrackInfo
} from '@shared/ipc-contract'
import { trackSignature } from '../../translate/batch/batch-rows'

export type ExtractBatchStep = 'files' | 'tracks' | 'output'
export const EXTRACT_BATCH_STEPS: readonly ExtractBatchStep[] = ['files', 'tracks', 'output']

/** User changes on top of the plan's automatic selection (every supported text track). */
export interface ExtractEdit {
  include?: boolean
  trackIds?: number[]
}

export interface ExtractBatchState {
  step: ExtractBatchStep
  furthest: number
  source: BatchSource | null
  edits: Record<string, ExtractEdit>
  outputDir: string | null
}

export const initialExtractBatch: ExtractBatchState = {
  step: 'files',
  furthest: 0,
  source: null,
  edits: {},
  outputDir: null
}

export type ExtractBatchAction =
  | { type: 'source'; source: BatchSource }
  | { type: 'edit'; edits: Record<string, ExtractEdit> }
  | { type: 'outputDir'; dir: string | null }
  | { type: 'go'; step: ExtractBatchStep }
  | { type: 'reset' }

export function extractBatchReducer(
  s: ExtractBatchState,
  a: ExtractBatchAction
): ExtractBatchState {
  switch (a.type) {
    case 'source':
      // Another set of files: edits no longer apply; the output folder stays.
      return { ...initialExtractBatch, source: a.source, outputDir: s.outputDir }
    case 'edit': {
      const edits = { ...s.edits }
      for (const [path, e] of Object.entries(a.edits)) edits[path] = { ...edits[path], ...e }
      return { ...s, edits }
    }
    case 'outputDir':
      return { ...s, outputDir: a.dir }
    case 'go':
      return {
        ...s,
        step: a.step,
        furthest: Math.max(s.furthest, EXTRACT_BATCH_STEPS.indexOf(a.step))
      }
    case 'reset':
      return initialExtractBatch
  }
}

/** One file of the batch as the wizard shows it: plan item + user edits. */
export interface ExtractRow {
  item: BatchPlanItem
  include: boolean
  /** Tracks to save, in the file's own ids. */
  trackIds: number[]
}

/** Text tracks (the ones that can be saved); image tracks have `format: null`. */
export const textTracks = (item: BatchPlanItem): SubtitleTrackInfo[] =>
  (item.tracks ?? []).filter((t) => t.format !== null)

/** Plan + edits. Skipped files cannot be included; a track no longer in the file is dropped. */
export function buildRows(plan: BatchPlan, edits: Record<string, ExtractEdit>): ExtractRow[] {
  return plan.items.map((item) => {
    const e = edits[item.path]
    const valid = new Set(textTracks(item).map((t) => t.id))
    const trackIds = (e?.trackIds ?? item.selected).filter((id) => valid.has(id))
    return { item, include: item.skipped ? false : (e?.include ?? true), trackIds }
  })
}

/** An included file with nothing to save blocks the batch. */
export const rowBlocked = (r: ExtractRow): boolean => r.include && r.trackIds.length === 0

export function extractStepValid(
  step: ExtractBatchStep,
  rows: readonly ExtractRow[] | null
): boolean {
  if (step === 'output') return true
  if (!rows?.some((r) => r.include)) return false
  return step === 'files' || !rows.some(rowBlocked)
}

/** Back to any step; forward to a reached one while every step before it is valid. */
export function extractCanGo(
  s: ExtractBatchState,
  target: ExtractBatchStep,
  valid: (step: ExtractBatchStep) => boolean
): boolean {
  const t = EXTRACT_BATCH_STEPS.indexOf(target)
  if (t <= EXTRACT_BATCH_STEPS.indexOf(s.step)) return true
  return t <= s.furthest + 1 && EXTRACT_BATCH_STEPS.slice(0, t).every(valid)
}

export interface SignatureChoice {
  signature: string
  track: SubtitleTrackInfo
  /** Files (included ones) that have a track with this signature. */
  files: number
  /** Of those, how many have it selected. */
  selected: number
}

/** Track kinds across the included files (language + name + format), most common first. */
export function signatureChoices(rows: readonly ExtractRow[]): SignatureChoice[] {
  const m = new Map<string, SignatureChoice>()
  for (const r of rows) {
    if (!r.include) continue
    const seen = new Set<string>()
    for (const t of textTracks(r.item)) {
      const sig = trackSignature(t)
      if (seen.has(sig)) continue
      seen.add(sig)
      const on = r.item.tracks!.some((x) => trackSignature(x) === sig && r.trackIds.includes(x.id))
      const e = m.get(sig) ?? { signature: sig, track: t, files: 0, selected: 0 }
      e.files++
      if (on) e.selected++
      m.set(sig, e)
    }
  }
  return [...m.values()].sort((a, b) => b.files - a.files)
}

/** Edits that select (or unselect) every track with `signature` in the included files. */
export function signatureEdits(
  rows: readonly ExtractRow[],
  signature: string,
  on: boolean
): Record<string, ExtractEdit> {
  const out: Record<string, ExtractEdit> = {}
  for (const r of rows) {
    if (!r.include) continue
    const ids = textTracks(r.item)
      .filter((t) => trackSignature(t) === signature)
      .map((t) => t.id)
    if (!ids.length) continue
    const rest = r.trackIds.filter((id) => !ids.includes(id))
    out[r.item.path] = { trackIds: on ? [...rest, ...ids].sort((a, b) => a - b) : rest }
  }
  return out
}

/** The `batches:create` request: included files in plan order, each with its tracks. */
export function buildExtractRequest(
  plan: BatchPlan,
  rows: readonly ExtractRow[],
  outputDir: string | null
): BatchCreateRequest {
  return {
    kind: 'extract',
    root: plan.root,
    items: rows.filter((r) => r.include).map((r) => ({ path: r.item.path, trackIds: r.trackIds })),
    ...(outputDir ? { outputDir } : {})
  }
}

/**
 * `INVALID_INPUT` "item N: …" (N: 0-based, among the items sent): the included row to fix, and
 * the Main's reason; `null` when the message does not point at a file.
 */
export function failedItem(
  message: string,
  rows: readonly ExtractRow[]
): { row: ExtractRow; reason: string } | null {
  const m = /^item (\d+): (.*)$/s.exec(message)
  const row = m ? rows.filter((r) => r.include)[Number(m[1])] : undefined
  return m && row ? { row, reason: m[2] } : null
}
