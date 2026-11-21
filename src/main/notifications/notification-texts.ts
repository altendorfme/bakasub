import type { JobStatus } from '../../shared/ipc-contract'
import type { ConsentLanguage } from '../services/sidecar-consent-text'

/** Idiomas da UI; a resolução (`ui.language` → locale do SO) é a mesma do consentimento. */
export type NotificationLanguage = ConsentLanguage

export type JobNotifyStatus = Extract<
  JobStatus,
  'completed' | 'completed-with-warnings' | 'failed' | 'awaiting-confirmation'
>

export interface BatchSummary {
  name: string
  total: number
  /** `completed` + `completed-with-warnings`. */
  ok: number
  /** `failed` + `interrupted`. */
  failed: number
}

interface Texts {
  job: Record<JobNotifyStatus, string>
  batchDone: string
  batchFailed: string
  batchBody: (s: BatchSummary) => string
  batchConfirm: string
  batchConfirmBody: (name: string, count: number) => string
  updateTitle: string
  updateBody: (version: string) => string
}

const TEXT: Record<NotificationLanguage, Texts> = {
  en: {
    job: {
      completed: 'Job finished',
      'completed-with-warnings': 'Finished, with warnings',
      failed: 'Job failed',
      'awaiting-confirmation': 'Confirm the cost to translate'
    },
    batchDone: 'Batch finished',
    batchFailed: 'Batch finished with failures',
    batchBody: (s) =>
      `${s.name}: ${s.ok} of ${s.total} done` + (s.failed ? `, ${s.failed} failed` : ''),
    batchConfirm: 'Confirm the batch cost',
    batchConfirmBody: (name, n) => `${name}: ${n} ${n === 1 ? 'file waits' : 'files wait'} for you`,
    updateTitle: 'Update available',
    updateBody: (v) => `BakaSub ${v} is available. Open Settings → About to update.`
  },
  'pt-BR': {
    job: {
      completed: 'Job concluído',
      'completed-with-warnings': 'Concluído, com avisos',
      failed: 'O job falhou',
      'awaiting-confirmation': 'Confirme o custo para traduzir'
    },
    batchDone: 'Lote concluído',
    batchFailed: 'Lote concluído com falhas',
    batchBody: (s) =>
      `${s.name}: ${s.ok} de ${s.total} concluídos` + (s.failed ? `, ${s.failed} com falha` : ''),
    batchConfirm: 'Confirme o custo do lote',
    batchConfirmBody: (name, n) =>
      `${name}: ${n} ${n === 1 ? 'arquivo aguarda' : 'arquivos aguardam'} você`,
    updateTitle: 'Atualização disponível',
    updateBody: (v) => `O BakaSub ${v} está disponível. Abra Configurações → Sobre para atualizar.`
  }
}

export const notificationText = (lang: NotificationLanguage): Texts => TEXT[lang]
