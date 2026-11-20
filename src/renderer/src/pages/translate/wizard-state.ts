import type { JobCreateRequest, SubtitleTrackInfo } from '@shared/ipc-contract'
import { noMedia, type MediaChoice } from '@renderer/components/media/media-choice'
import { sourceKindOf, type SourceKind } from '@shared/file-types'

export type WizardStep = 'file' | 'track' | 'preset' | 'output'

export interface WizardState {
  step: WizardStep
  file: { path: string; name: string; kind: SourceKind } | null
  trackId: number | null
  /** `null` = the default from Settings (shown prefilled). */
  presetId: string | null
  model: string | null
  targetLang: string | null
  notes: string
  /** `null` = next to the source file. */
  outputDir: string | null
  mux: { setDefault: boolean; keepOriginalSubtitles: boolean; alsoWriteSubtitle: boolean }
  media: MediaChoice
}

export const initialWizard: WizardState = {
  step: 'file',
  file: null,
  trackId: null,
  presetId: null,
  model: null,
  targetLang: null,
  notes: '',
  outputDir: null,
  mux: { setDefault: true, keepOriginalSubtitles: true, alsoWriteSubtitle: false },
  media: noMedia
}

/** A subtitle file has no track to pick and nothing to mux. */
export const stepsFor = (kind: SourceKind | undefined): WizardStep[] =>
  kind === 'subtitle' ? ['file', 'preset', 'output'] : ['file', 'track', 'preset', 'output']

export const NOTES_MAX = 4000

export type WizardAction =
  | { type: 'file'; path: string }
  | { type: 'track'; trackId: number }
  | {
      type: 'set'
      patch: Partial<Pick<WizardState, 'presetId' | 'model' | 'targetLang' | 'notes' | 'outputDir'>>
    }
  | { type: 'mux'; patch: Partial<WizardState['mux']> }
  | { type: 'media'; patch: Partial<MediaChoice> }
  | { type: 'go'; step: WizardStep }
  /** `defaults`: model/language from Settings, used when the user kept them. */
  | { type: 'next'; defaults?: Defaults }
  | { type: 'back' }
  | { type: 'reset' }

const baseName = (path: string): string => path.split(/[\\/]/).pop() ?? path

export function wizardReducer(s: WizardState, a: WizardAction): WizardState {
  const steps = stepsFor(s.file?.kind)
  const i = steps.indexOf(s.step)
  switch (a.type) {
    case 'file': {
      const kind = sourceKindOf(a.path)
      if (!kind) return s
      // A new file invalidates the track; the rest (preset, notes…) is kept.
      return {
        ...s,
        file: { path: a.path, name: baseName(a.path), kind },
        trackId: null,
        media: noMedia
      }
    }
    case 'track':
      return { ...s, trackId: a.trackId }
    case 'set':
      return { ...s, ...a.patch }
    case 'mux':
      return { ...s, mux: { ...s.mux, ...a.patch } }
    case 'media':
      return { ...s, media: { ...s.media, ...a.patch } }
    case 'go':
      return steps.includes(a.step) ? { ...s, step: a.step } : s
    case 'next':
      return canContinue(s, a.defaults) && i < steps.length - 1 ? { ...s, step: steps[i + 1] } : s
    case 'back':
      return i > 0 ? { ...s, step: steps[i - 1] } : s
    case 'reset':
      return initialWizard
  }
}

/** What the current step needs before "Continue". Model/language may come from the defaults. */
export interface Defaults {
  model: string | null
  targetLang: string | null
}

export function canContinue(
  s: WizardState,
  defaults: Defaults = { model: null, targetLang: null }
): boolean {
  switch (s.step) {
    case 'file':
      return s.file !== null
    case 'track':
      return s.trackId !== null
    case 'preset':
      return (
        !!(s.model ?? defaults.model) &&
        !!(s.targetLang ?? defaults.targetLang) &&
        s.notes.length <= NOTES_MAX
      )
    case 'output':
      return true
  }
}

/**
 * Track chosen automatically: a translatable one in the first preferred language, else the
 * first translatable; forced tracks (signs only) lose to full ones.
 */
export function pickTrack(
  tracks: readonly SubtitleTrackInfo[],
  preferred: readonly string[]
): number | null {
  const ok = tracks.filter((t) => t.format !== null)
  const base = (l?: string): string => (l ?? '').toLowerCase().split('-')[0]
  for (const lang of preferred) {
    const match = ok.filter((t) => base(t.language) === base(lang))
    const full = match.find((t) => !t.forced) ?? match[0]
    if (full) return full.id
  }
  return (ok.find((t) => !t.forced) ?? ok[0])?.id ?? null
}

/** The `jobs:create` request. Unset model/language/preset are left to the Main's defaults. */
export function buildJobRequest(s: WizardState): JobCreateRequest {
  if (!s.file) throw new Error('No file selected')
  const common = {
    source: s.file.path,
    ...(s.presetId ? { presetId: s.presetId } : {}),
    ...(s.model ? { model: s.model } : {}),
    ...(s.targetLang ? { targetLang: s.targetLang } : {}),
    ...(s.notes.trim() ? { notes: s.notes.trim() } : {}),
    ...(s.outputDir ? { outputDir: s.outputDir } : {}),
    ...mediaRequest(s.media),
    confirmBeforeTranslate: true
  }
  if (s.file.kind === 'subtitle') return { kind: 'translate', ...common }
  if (s.trackId === null) throw new Error('No track selected')
  return { kind: 'pipeline', ...common, trackId: s.trackId, options: { ...s.mux } }
}

/** `media` for the request: only when included; the episode only for a series with both numbers. */
function mediaRequest(
  m: MediaChoice
): Pick<Extract<JobCreateRequest, { kind: 'translate' }>, 'media'> {
  if (!m.include || !m.ref) return {}
  const episode =
    m.ref.kind === 'series' && m.season !== null && m.episode !== null
      ? { season: m.season, episode: m.episode }
      : {}
  return { media: { ref: m.ref, ...episode } }
}
