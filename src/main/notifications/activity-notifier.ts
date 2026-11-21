import type {
  AppUpdateStatus,
  Batch,
  Job,
  JobProgressEvent,
  JobStatus
} from '../../shared/ipc-contract'
import type { NotificationRequest } from './notification.service'
import {
  notificationText,
  type JobNotifyStatus,
  type NotificationLanguage
} from './notification-texts'

const JOB_NOTIFY: ReadonlySet<JobStatus> = new Set<JobNotifyStatus>([
  'completed',
  'completed-with-warnings',
  'failed',
  'awaiting-confirmation'
])
const ACTIVE: ReadonlySet<JobStatus> = new Set(['queued', 'running'])

export interface ActivityNotifierDeps {
  notify: (req: NotificationRequest) => Promise<boolean>
  getJob: (id: string) => Promise<Pick<Job, 'id' | 'source' | 'batchId'>>
  getBatch: (id: string) => Promise<Pick<Batch, 'id' | 'name' | 'total' | 'counts' | 'state'>>
  language: () => Promise<NotificationLanguage>
  log: { warn(...a: unknown[]): void }
}

/**
 * Traduz eventos do app em notificações: transições de estado dos jobs (o `jobs:progress` repete
 * o estado a cada tick de progresso), um aviso agregado por batch e a versão nova do updater.
 * Jobs de batch nunca notificam sozinhos. O processamento é serializado para que dois jobs do
 * mesmo batch terminando juntos não gerem duas notificações de "batch concluído".
 */
export class ActivityNotifier {
  private readonly lastStatus = new Map<string, JobStatus>()
  private readonly batchFinished = new Set<string>()
  private readonly batchAwaiting = new Set<string>()
  private readonly updateVersions = new Set<string>()
  private chain: Promise<void> = Promise.resolve()

  constructor(private readonly d: ActivityNotifierDeps) {}

  onJobEvent(e: JobProgressEvent): void {
    const prev = this.lastStatus.get(e.id)
    if (prev === e.status) return
    this.lastStatus.set(e.id, e.status)
    this.enqueue(() => this.handleJob(e.id, e.status))
  }

  onUpdateStatus(s: AppUpdateStatus): void {
    if (s.state !== 'available' || !s.latest || this.updateVersions.has(s.latest)) return
    // Marcada mesmo se a janela estiver focada: aí o dialog in-app já avisou desta versão.
    this.updateVersions.add(s.latest)
    const latest = s.latest
    this.enqueue(async () => {
      const t = notificationText(await this.d.language())
      await this.d.notify({
        kind: 'update',
        title: t.updateTitle,
        body: t.updateBody(latest),
        target: { kind: 'settings', tab: 'about' }
      })
    })
  }

  /** Resolve quando tudo o que já chegou foi processado (testes). */
  idle(): Promise<void> {
    return this.chain
  }

  private enqueue(task: () => Promise<void>): void {
    this.chain = this.chain
      .then(task)
      .catch((err: unknown) => this.d.log.warn('notification handling failed', err))
  }

  private async handleJob(id: string, status: JobStatus): Promise<void> {
    const job = await this.d.getJob(id)
    if (job.batchId) return this.handleBatch(job.batchId, status)
    if (!JOB_NOTIFY.has(status)) return
    const t = notificationText(await this.d.language())
    await this.d.notify({
      kind: 'job',
      title: t.job[status as JobNotifyStatus],
      body: job.source,
      target: { kind: 'job', id }
    })
  }

  private async handleBatch(batchId: string, status: JobStatus): Promise<void> {
    if (ACTIVE.has(status)) {
      // Retry/confirmação: o batch volta a andar e poderá terminar (ou parar) de novo.
      this.batchFinished.delete(batchId)
      this.batchAwaiting.delete(batchId)
      return
    }
    const batch = await this.d.getBatch(batchId)
    const n = (s: JobStatus): number => batch.counts[s] ?? 0
    const target = { kind: 'batch', id: batchId } as const

    if (batch.state === 'finished') {
      if (this.batchFinished.has(batchId)) return
      this.batchFinished.add(batchId)
      const ok = n('completed') + n('completed-with-warnings')
      const failed = n('failed') + n('interrupted')
      // Tudo cancelado: foi o usuário, não há o que avisar.
      if (ok === 0 && failed === 0) return
      const t = notificationText(await this.d.language())
      await this.d.notify({
        kind: 'batch',
        title: failed ? t.batchFailed : t.batchDone,
        body: t.batchBody({ name: batch.name, total: batch.total, ok, failed }),
        target
      })
      return
    }

    // Parado esperando o usuário: nada mais anda até ele confirmar.
    const awaiting = n('awaiting-confirmation')
    if (awaiting === 0 || n('queued') + n('running') > 0) return
    if (this.batchAwaiting.has(batchId)) return
    this.batchAwaiting.add(batchId)
    const t = notificationText(await this.d.language())
    await this.d.notify({
      kind: 'batch',
      title: t.batchConfirm,
      body: t.batchConfirmBody(batch.name, awaiting),
      target
    })
  }
}
