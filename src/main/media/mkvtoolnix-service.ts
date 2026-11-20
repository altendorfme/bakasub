import { AppError } from '../errors'
import type { RunOptions, RunResult } from '../sidecars/process-runner'
import { parseIdentify, type MkvInfo } from './mkv-probe'
import {
  buildExtractArgs,
  buildMuxArgs,
  interpretExit,
  parseGuiLine,
  type MuxPlan
} from './mkvtoolnix'

export interface CommandRunner {
  run(command: string, args: string[], opts?: RunOptions): Promise<RunResult>
}
export interface ToolResolver {
  resolve(name: string): Promise<{ path: string; env: Record<string, string> }>
}

export interface ToolRunOptions {
  signal?: AbortSignal
  /** 0..1 */
  onProgress?: (fraction: number) => void
}

/**
 * Fachada do mkvtoolnix: resolve o binário verificado (sidecar), roda via `ProcessRunner`
 * (abort -> SIGTERM/SIGKILL, sem timeout: arquivos grandes demoram) e interpreta `--gui-mode`
 * e os códigos de saída (1 = avisos, sucesso).
 */
export class MkvToolnix {
  constructor(
    private readonly runner: CommandRunner,
    private readonly tools: ToolResolver
  ) {}

  async probe(path: string, signal?: AbortSignal): Promise<MkvInfo> {
    const tool = await this.tools.resolve('mkvmerge')
    const r = await this.runner.run(tool.path, ['-J', path], { env: tool.env, signal })
    let json: { errors?: unknown } | null
    try {
      json = JSON.parse(r.stdout) as { errors?: unknown }
    } catch {
      json = null
    }
    if (interpretExit(r.code) === 'error' || !json) {
      const errors = Array.isArray(json?.errors) ? json.errors.map(String) : []
      throw new AppError(
        'MEDIA_TOOL_FAILED',
        `mkvmerge: ${errors[0] ?? (r.stderr.trim() || `exit ${r.code}`)}`
      )
    }
    try {
      return parseIdentify(json)
    } catch (err) {
      throw new AppError('MEDIA_TOOL_FAILED', `mkvmerge: ${(err as Error).message}`)
    }
  }

  extract(
    source: string,
    tracks: readonly { trackId: number; output: string }[],
    opts: ToolRunOptions = {}
  ): Promise<{ warnings: string[] }> {
    return this.gui('mkvextract', buildExtractArgs(source, tracks), opts)
  }

  mux(plan: MuxPlan, opts: ToolRunOptions = {}): Promise<{ warnings: string[] }> {
    return this.gui('mkvmerge', buildMuxArgs(plan), opts)
  }

  private async gui(
    name: 'mkvmerge' | 'mkvextract',
    args: string[],
    opts: ToolRunOptions
  ): Promise<{ warnings: string[] }> {
    const tool = await this.tools.resolve(name)
    const warnings: string[] = []
    const errors: string[] = []
    const r = await this.runner.run(tool.path, args, {
      env: tool.env,
      signal: opts.signal,
      onStdoutLine: (line) => {
        if (/^\s*(Error|Erro):/i.test(line)) errors.push(line.trim())
        const ev = parseGuiLine(line)
        if (!ev) return
        if (ev.type === 'progress') opts.onProgress?.(ev.percent / 100)
        else (ev.type === 'warning' ? warnings : errors).push(ev.message)
      }
    })
    if (interpretExit(r.code) === 'error')
      throw new AppError(
        'MEDIA_TOOL_FAILED',
        `${name}: ${errors[0] ?? (r.stderr.trim() || `exit ${r.code}`)}`
      )
    return { warnings }
  }
}
