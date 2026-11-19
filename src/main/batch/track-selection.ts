import type { SubtitleTrack } from '../media/mkv-probe'

export type NoTrackReason = 'no-subtitle-track' | 'no-supported-track'

/** Nomes que indicam faixa de placas/músicas (pouco ou nenhum diálogo). */
const SIGNS = /sign|song|karaoke|lyric/i

const primary = (tag: string | undefined): string | undefined => tag?.split('-')[0].toLowerCase()

/**
 * Faixa a traduzir num MKV, por critérios em ordem: idioma de origem preferido (na ordem da
 * lista; `en-US` casa com `en`), ASS/SSA antes de SRT, não `forced`, nome sem cara de
 * placas/músicas, mais eventos; empate pelo menor id.
 */
export function selectTranslationTrack(
  tracks: readonly SubtitleTrack[],
  preferredLangs: readonly string[]
): { trackId: number } | { reason: NoTrackReason } {
  if (tracks.length === 0) return { reason: 'no-subtitle-track' }
  const candidates = tracks.filter((t) => t.format !== null)
  if (candidates.length === 0) return { reason: 'no-supported-track' }

  const prefs = preferredLangs.map((l) => primary(l))
  const langRank = (t: SubtitleTrack): number => {
    const i = prefs.indexOf(primary(t.language))
    return i === -1 ? prefs.length : i
  }
  const key = (t: SubtitleTrack): number[] => [
    langRank(t),
    // ASS/SSA carrega mais estilo; SRT e VTT empatam.
    t.format === 'ass' || t.format === 'ssa' ? 0 : 1,
    t.forced ? 1 : 0,
    t.name && SIGNS.test(t.name) ? 1 : 0,
    -(t.eventCount ?? 0),
    t.id
  ]
  const best = [...candidates].sort((a, b) => {
    const ka = key(a)
    const kb = key(b)
    for (let i = 0; i < ka.length; i++) if (ka[i] !== kb[i]) return ka[i] - kb[i]
    return 0
  })[0]
  return { trackId: best.id }
}

/** Extração em lote: por padrão todas as faixas de texto suportadas. */
export function selectExtractTracks(
  tracks: readonly SubtitleTrack[]
): { trackIds: number[] } | { reason: NoTrackReason } {
  if (tracks.length === 0) return { reason: 'no-subtitle-track' }
  const ids = tracks
    .filter((t) => t.format !== null)
    .map((t) => t.id)
    .sort((a, b) => a - b)
  return ids.length ? { trackIds: ids } : { reason: 'no-supported-track' }
}
