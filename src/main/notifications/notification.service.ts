import type { NavigationTarget } from '../../shared/ipc-contract'

/** Categoria = toggle próprio em Settings (`notifications.<kind>`), abaixo do geral. */
export type NotificationKind = 'job' | 'batch' | 'update'

export interface NotificationRequest {
  kind: NotificationKind
  title: string
  body: string
  /** Para onde o clique leva a janela. */
  target: NavigationTarget
}

/** Uma notificação já criada pela plataforma (subconjunto de `electron.Notification`). */
export interface NativeNotificationLike {
  on(event: 'click' | 'close' | 'failed', listener: (...args: unknown[]) => void): unknown
  show(): void
}

/** Janela principal vista pelo serviço (o Electron fica no `create-notifications.ts`). */
export interface MainWindowPort {
  /** Visível, não minimizada e com o foco do SO. Sem janela = `false`. */
  isFocused(): boolean
  /** Restaura/mostra/foca (ou recria) a janela e entrega o alvo ao renderer (`app:navigate`). */
  reveal(target: NavigationTarget): void
}

export interface NotificationServiceDeps {
  /** `Notification.isSupported()`. */
  isSupported: () => boolean
  create: (n: { title: string; body: string }) => NativeNotificationLike
  window: MainWindowPort
  /** `notifications.enabled` && `notifications.<kind>`. */
  enabled: (kind: NotificationKind) => Promise<boolean>
  log: { warn(...a: unknown[]): void; debug?(...a: unknown[]): void }
}

/**
 * Notificações nativas do SO, emitidas pelo Main (independem do renderer estar vivo). Só com a
 * janela sem foco — inclusive erros: com foco, a UI já mostra o evento. Nunca lança: uma falha da
 * plataforma vira log e `false`, sem afetar o job ou o app.
 */
export class NotificationService {
  /**
   * Referências vivas até `click`/`close`: sem elas o GC coleta o objeto e o clique se perde
   * (comportamento conhecido do Electron no Windows/Linux).
   */
  private readonly live = new Set<NativeNotificationLike>()

  constructor(private readonly d: NotificationServiceDeps) {}

  isSupported(): boolean {
    try {
      return this.d.isSupported()
    } catch {
      return false
    }
  }

  /** `true` se a notificação foi mostrada. */
  async notify(req: NotificationRequest): Promise<boolean> {
    try {
      if (this.d.window.isFocused()) return false
      if (!(await this.d.enabled(req.kind))) return false
      if (!this.isSupported()) return false
      const n = this.d.create({ title: req.title, body: req.body })
      this.live.add(n)
      const release = (): void => {
        this.live.delete(n)
      }
      n.on('click', () => {
        release()
        try {
          this.d.window.reveal(req.target)
        } catch (err) {
          this.d.log.warn('notification click failed', err)
        }
      })
      n.on('close', release)
      n.on('failed', (...args: unknown[]) => {
        release()
        this.d.log.warn('native notification failed', args[1] ?? args[0])
      })
      n.show()
      return true
    } catch (err) {
      this.d.log.warn(`notification (${req.kind}) not shown`, err)
      return false
    }
  }

  /** Notificações aguardando clique (testes/diagnóstico). */
  get pending(): number {
    return this.live.size
  }
}
