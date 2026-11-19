import { AppError } from '../../errors'
import { outputNames, uniquePath } from '../../media/naming'
import { atomicCopy } from '../artifacts'
import type { Step } from '../step-context'

/** Publica os arquivos do diretório de trabalho na pasta de saída (nome único, cópia atômica). */
export const writeStep: Step = async (ctx) => {
  const { spec } = ctx
  const outputs: string[] = []
  if (spec.kind === 'extract') {
    for (const f of ctx.artifacts.extract?.files ?? []) {
      const final = await uniquePath(
        spec.outputDir,
        outputNames.extracted(spec.source, f.trackId, f.language, f.format)
      )
      await atomicCopy(f.path, final)
      outputs.push(final)
    }
  } else if (spec.kind === 'translate' || spec.kind === 'pipeline') {
    const t = ctx.artifacts.translate
    if (!t) throw new AppError('INVALID_INPUT', 'Translated file is missing')
    const final = await uniquePath(
      spec.outputDir,
      outputNames.subtitle(spec.source, spec.targetLang, t.file.format)
    )
    await atomicCopy(t.file.path, final)
    outputs.push(final)
  }
  ctx.artifacts.write = { outputs }
}
