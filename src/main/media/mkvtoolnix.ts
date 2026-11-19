/** Linha do `--gui-mode` do mkvtoolnix. */
export type GuiEvent =
  | { readonly type: 'progress'; readonly percent: number }
  | { readonly type: 'warning' | 'error'; readonly message: string }

export function parseGuiLine(line: string): GuiEvent | null {
  const m = /^#GUI#(progress|warning|error)\s*(.*)$/.exec(line.trim())
  if (!m) return null
  if (m[1] === 'progress') {
    const p = /(\d{1,3})%/.exec(m[2])
    return p ? { type: 'progress', percent: Math.min(100, Number(p[1])) } : null
  }
  return { type: m[1] as 'warning' | 'error', message: m[2] }
}

/** mkvtoolnix: 0 = sucesso, 1 = sucesso com avisos, 2 (ou sinal) = erro. */
export function interpretExit(code: number | null): 'ok' | 'warnings' | 'error' {
  return code === 0 ? 'ok' : code === 1 ? 'warnings' : 'error'
}

export interface MuxSubtitle {
  readonly path: string
  readonly language: string
  readonly name: string
  readonly default: boolean
}

export interface MuxPlan {
  readonly source: string
  /** Caminho temporário (renomeado para o final só após sucesso). */
  readonly output: string
  readonly subtitles: readonly MuxSubtitle[]
  /** Ids das legendas da origem (para tirar o `default` delas). */
  readonly sourceSubtitleTrackIds: readonly number[]
  readonly setDefault: boolean
  readonly keepOriginalSubtitles: boolean
}

/**
 * `mkvmerge` mantém todas as faixas e anexos da origem (inclusive fontes). Opções de um arquivo
 * vêm antes dele; `0:` refere-se à única faixa de cada arquivo de legenda.
 */
export function buildMuxArgs(p: MuxPlan): string[] {
  const args = ['--gui-mode', '-o', p.output]
  if (!p.keepOriginalSubtitles) args.push('--no-subtitles')
  else if (p.setDefault)
    for (const id of p.sourceSubtitleTrackIds) args.push('--default-track-flag', `${id}:no`)
  args.push(p.source)
  for (const s of p.subtitles)
    args.push(
      '--language',
      `0:${s.language}`,
      '--track-name',
      `0:${s.name}`,
      '--default-track-flag',
      `0:${s.default ? 'yes' : 'no'}`,
      s.path
    )
  return args
}

/** Uma única passada de `mkvextract` com todas as faixas pedidas. */
export function buildExtractArgs(
  source: string,
  tracks: readonly { trackId: number; output: string }[]
): string[] {
  return ['--gui-mode', source, 'tracks', ...tracks.map((t) => `${t.trackId}:${t.output}`)]
}
