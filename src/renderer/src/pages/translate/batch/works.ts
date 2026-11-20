import type { MediaRef } from '@shared/ipc-contract'
import type { PresetSuggestion } from '@renderer/lib/preset-suggestion'
import type { BatchRow } from './batch-rows'

/**
 * A "work" (obra): the unit of context of a batch. Its files share the TMDB media and the
 * preset (always per work: suggested from TMDB) and, when customized, the model, language and
 * notes. Settings are never per file.
 */
export interface WorkSettings {
  model: string | null
  targetLang: string | null
  notes: string
}

export interface Work {
  /** Automatic works: `tmdb:<id>` or `name:<title>` (stable); manual: `manual:<n>`. */
  id: string
  name: string
  ref: MediaRef | null
  /** Send title, genres and synopses to the AI. */
  includeMedia: boolean
  /** The user's pick; `null` = the suggestion (TMDB), else the default from Settings. */
  presetId: string | null
  /** `null` = the batch defaults. */
  custom: WorkSettings | null
  /** Created by the user ("New work"), not by the automatic grouping. */
  manual: boolean
}

export interface Grouping {
  works: Work[]
  /** file path → work id */
  of: Record<string, string>
  /** Counter for manual work ids. */
  seq: number
}

const keyOf = (r: BatchRow): string =>
  r.match ? `tmdb:${r.match.id}` : `name:${r.title.trim().toLowerCase()}`

/**
 * Groups by the TMDB match, else by the parsed title; works keep the plan order. Files the plan
 * skipped (nothing to translate) belong to no work.
 */
export function autoGroup(rows: readonly BatchRow[]): Grouping {
  const works = new Map<string, Work>()
  const of: Record<string, string> = {}
  for (const r of rows) {
    if (r.item.skipped) continue
    const id = keyOf(r)
    if (!works.has(id))
      works.set(id, {
        id,
        name: r.title,
        ref: r.match,
        includeMedia: true,
        presetId: null,
        custom: null,
        manual: false
      })
    of[r.item.path] = id
  }
  return { works: [...works.values()], of, seq: 0 }
}

/** Works without files disappear. */
function prune(g: Grouping): Grouping {
  const used = new Set(Object.values(g.of))
  return { ...g, works: g.works.filter((w) => used.has(w.id)) }
}

/** Moves a file to another work, or to a new one named after the file's title. */
export function moveFile(g: Grouping, row: BatchRow, to: string | 'new'): Grouping {
  if (to !== 'new') return prune({ ...g, of: { ...g.of, [row.item.path]: to } })
  const seq = g.seq + 1
  const w: Work = {
    id: `manual:${seq}`,
    name: row.title,
    ref: null,
    includeMedia: true,
    presetId: null,
    custom: null,
    manual: true
  }
  return prune({ works: [...g.works, w], of: { ...g.of, [row.item.path]: w.id }, seq })
}

/** Every file of `from` goes to `into` (whose settings win). */
export function mergeWork(g: Grouping, from: string, into: string): Grouping {
  if (from === into) return g
  const of = Object.fromEntries(Object.entries(g.of).map(([p, w]) => [p, w === from ? into : w]))
  return prune({ ...g, of })
}

export function patchWork(g: Grouping, id: string, patch: Partial<Omit<Work, 'id'>>): Grouping {
  return { ...g, works: g.works.map((w) => (w.id === id ? { ...w, ...patch } : w)) }
}

/** Indexes of the rows in work `id` (plan order). */
export const rowsOf = (g: Grouping, rows: readonly BatchRow[], id: string): number[] =>
  rows.flatMap((r, i) => (g.of[r.item.path] === id ? [i] : []))

export const workOf = (g: Grouping, r: BatchRow): Work | undefined =>
  g.works.find((w) => w.id === g.of[r.item.path])

/** The settings a work runs with. */
export const effectiveSettings = (w: Work, defaults: WorkSettings): WorkSettings =>
  w.custom ?? defaults

/** Suggested preset per work id (`null`: no TMDB match or no details yet). */
export type PresetSuggestions = Readonly<Record<string, PresetSuggestion | null | undefined>>

/** The preset a work runs with; `null` = the default from Settings (resolved by the Main). */
export const workPreset = (w: Work, suggestions: PresetSuggestions): string | null =>
  w.presetId ?? suggestions[w.id]?.presetId ?? null
