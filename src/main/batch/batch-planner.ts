import type { BatchPlan, BatchPlanItem, BatchPlanRequest } from '../../shared/ipc-contract'
import type { MkvToolnix } from '../media/mkvtoolnix-service'
import { MEDIA_EXTENSIONS, SUBTITLE_EXTENSIONS } from '../media/path-guard'
import { collectFiles, scanFolder, type ScannedFile } from './scan-files'
import { selectExtractTracks, selectTranslationTrack } from './track-selection'

/** `mkvmerge -J` é leve: alguns em paralelo, sem saturar o disco. */
const PROBE_CONCURRENCY = 4

async function mapPool<T, R>(xs: readonly T[], n: number, fn: (x: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(xs.length)
  let next = 0
  const worker = async (): Promise<void> => {
    while (next < xs.length) {
      const i = next++
      out[i] = await fn(xs[i])
    }
  }
  await Promise.all(Array.from({ length: Math.min(n, xs.length) }, worker))
  return out
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
  let files: ScannedFile[]
  let rejected: BatchPlan['rejected'] = []
  let truncated = false
  let root: string | null = null
  if (req.source.type === 'folder') {
    const r = await scanFolder(req.source.path, {
      recursive: req.source.recursive ?? false,
      extensions
    })
    files = r.files
    truncated = r.truncated
    root = r.root
  } else {
    const r = await collectFiles(req.source.paths, extensions)
    files = r.files
    rejected = r.rejected
  }

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
