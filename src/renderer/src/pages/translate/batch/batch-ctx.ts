import { useTranslation } from 'react-i18next'
import type { BatchPlan, SubtitleTrackInfo } from '@shared/ipc-contract'
import { languageName } from '@renderer/lib/languages'
import type { BatchRow, RowEdit, RowProblem } from './batch-rows'
import type { BatchFlavor, BatchOptions } from './batch-state'
import type { Grouping } from './works'

/** What every step of the batch wizard reads and changes. */
export interface BatchCtx {
  plan: BatchPlan
  flavor: BatchFlavor
  rows: BatchRow[]
  grouping: Grouping
  /** The user changed the automatic grouping. */
  regrouped: boolean
  problems: (RowProblem | null)[]
  options: BatchOptions
  edit: (edits: Record<string, RowEdit>) => void
  setGrouping: (g: Grouping | null) => void
  setOptions: (patch: Partial<BatchOptions>) => void
}

export const editRow = (ctx: BatchCtx, i: number, e: RowEdit): void =>
  ctx.edit({ [ctx.rows[i].item.path]: e })

/** "English · ASS · Full Subtitles · 380 lines". */
export function useTrackText(): (t: SubtitleTrackInfo, withLines?: boolean) => string {
  const { t, i18n } = useTranslation()
  return (tr, withLines = true) =>
    [
      tr.language ? languageName(tr.language, i18n.language) : t('batch.tracks.noLanguage'),
      tr.format?.toUpperCase() ?? t('batch.tracks.image'),
      tr.name,
      withLines && tr.eventCount ? t('translate.track.events', { count: tr.eventCount }) : null
    ]
      .filter(Boolean)
      .join(' · ')
}
