import { extname } from 'node:path'
import type {
  BatchMuxPlan,
  BatchMuxPlanRequest,
  BatchPlan,
  BatchPlanItem,
  BatchPlanRequest
} from '../../shared/ipc-contract'
import type { MkvToolnix } from '../media/mkvtoolnix-service'
import { MEDIA_EXTENSIONS, SUBTITLE_EXTENSIONS } from '../media/path-guard'
import { mapPool } from './pool'
import { pairMux } from './mux-pairing'
import { collectFiles, scanFolder, type ScannedFile } from './scan-files'
import { selectExtractTracks, selectTranslationTrack } from './track-selection'

/** `mkvmerge -J` é leve: alguns em paralelo, sem saturar o disco. */
const PROBE_CONCURRENCY = 4

/** Enumera pasta ou arquivos avulsos, com as extensões aceitas pelo `kind`. */
async function enumerate(
  source: BatchPlanRequest['source'],
  extensions: readonly string[]
): Promise<{
  files: ScannedFile[]
  rejected: BatchPlan['rejected']
  truncated: boolean
  root: string | null
}> {
  if (source.type === 'folder') {
    const r = await scanFolder(source.path, { recursive: source.recursive ?? false, extensions })
    return { files: r.files, rejected: [], truncated: r.truncated, root: r.root }
  }
  const r = await collectFiles(source.paths, extensions)
  return { files: r.files, rejected: r.rejected, truncated: false, root: null }
}

/**
 * Plano de `mux`: vídeos e legendas varridos juntos e pareados (`mux-pairing.ts`). Sem probe:
 * o job valida as legendas (parse) e o MKV.
 */
export async function planMuxBatch(req: BatchMuxPlanRequest): Promise<BatchMuxPlan> {
  const { files, rejected, truncated, root } = await enumerate(req.source, [
    ...MEDIA_EXTENSIONS,
    ...SUBTITLE_EXTENSIONS
  ])
  const isSubtitle = (f: ScannedFile): boolean =>
    (SUBTITLE_EXTENSIONS as readonly string[]).includes(extname(f.path).toLowerCase())
  const pairing = pairMux(
    files.filter((f) => !isSubtitle(f)),
    files.filter(isSubtitle)
  )
  return { kind: 'mux', root, ...pairing, rejected, truncated }
}

/**
 * Plano de um batch: enumera (pasta ou arquivos avulsos), faz o probe dos MKV e pré-seleciona
 * as faixas. Nada é criado aqui: a UI mostra o plano, o usuário ajusta e chama `create`.
 */
export async function planBatch(
  req: BatchPlanRequest,
  deps: { mkv: Pick<MkvToolnix, 'probe'>; preferredSourceLangs: () => Promise<string[]> }
): Promise<BatchPlan> {
  const extensions = req.kind === 'translate' ? SUBTITLE_EXTENSIONS : MEDIA_EXTENSIONS
  const { files, rejected, truncated, root } = await enumerate(req.source, extensions)

  if (req.kind === 'translate') {
    const items = files.map((f): BatchPlanItem => ({
      path: f.path,
      relPath: f.relPath,
      selected: []
    }))
    return { kind: req.kind, root, items, rejected, truncated }
  }

  const prefs = await deps.preferredSourceLangs()
  const items = await mapPool(files, PROBE_CONCURRENCY, async (f): Promise<BatchPlanItem> => {
    const base = { path: f.path, relPath: f.relPath }
    let info
    try {
      info = await deps.mkv.probe(f.path)
    } catch (err) {
      return {
        ...base,
        selected: [],
        skipped: 'probe-failed',
        error: err instanceof Error ? err.message : String(err)
      }
    }
    const tracks = [...info.subtitles]
    const pick =
      req.kind === 'extract' ? selectExtractTracks(tracks) : selectTranslationTrack(tracks, prefs)
    if ('reason' in pick) return { ...base, tracks, selected: [], skipped: pick.reason }
    return { ...base, tracks, selected: 'trackIds' in pick ? pick.trackIds : [pick.trackId] }
  })
  return { kind: req.kind, root, items, rejected, truncated }
}
