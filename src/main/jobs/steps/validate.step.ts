import { AppError } from '../../errors'
import type { Step } from '../step-context'
import { readSubtitle } from './subtitle-io'

/** Job `mux`: cada legenda precisa parsear antes de tocar no MKV (não repara nada). */
export const validateStep: Step = async (ctx) => {
  if (ctx.spec.kind !== 'mux') throw new AppError('INVALID_INPUT', 'validate step outside mux')
  for (const s of ctx.spec.subtitles) {
    if (ctx.signal.aborted) throw new AppError('CANCELLED', 'Job cancelled')
    await readSubtitle(s.path)
  }
  ctx.artifacts.validate = { ok: true }
}
