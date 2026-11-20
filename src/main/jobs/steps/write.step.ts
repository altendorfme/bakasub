import { AppError } from '../../errors'
import { outputNames, playerNames, resolveOutputPath } from '../../media/naming'
import { atomicCopy } from '../artifacts'
import type { Step } from '../step-context'

/**
 * Publica os arquivos do diretório de trabalho na pasta de saída (cópia atômica). Colisão de nome:
 * ` (2)`, ` (3)`… ou, com `overwrite`, substitui o arquivo existente (nunca a própria origem).
 */
export const writeStep: Step = async (ctx) => {
  const { spec } = ctx
  const outputs: string[] = []
  const opts = { overwrite: spec.kind !== 'mux' && spec.overwrite, protect: spec.source }
  if (spec.kind === 'extract') {
    const files = ctx.artifacts.extract?.files ?? []
    const player = spec.naming === 'player'
    const names = player
      ? playerNames(spec.source, files)
      : files.map((f) => outputNames.extracted(spec.source, f.trackId, f.language, f.format))
    for (const [i, f] of files.entries()) {
      const final = await resolveOutputPath(spec.outputDir, names[i], opts)
      await atomicCopy(f.path, final)
      outputs.push(final)
    }
  } else if (spec.kind === 'translate' || spec.kind === 'pipeline') {
    const t = ctx.artifacts.translate
    if (!t) throw new AppError('INVALID_INPUT', 'Translated file is missing')
    const final = await resolveOutputPath(
      spec.outputDir,
      outputNames.subtitle(spec.source, spec.targetLang, t.file.format),
      opts
    )
    await atomicCopy(t.file.path, final)
    outputs.push(final)
  }
  ctx.artifacts.write = { outputs }
}
