import { basename, dirname, extname } from 'node:path'
import type {
  BatchMuxPlan,
  BatchMuxPlanItem,
  BatchMuxPlanSubtitle
} from '../../shared/ipc-contract'
import { parseReleaseName } from '../media-context/release-name'
import { langFromFilename } from '../media/naming'
import type { ScannedFile } from './scan-files'

/** Limite de legendas por MKV (o mesmo do job `mux` avulso). */
export const MAX_SUBTITLES_PER_VIDEO = 32

/** Pastas de legendas de releases: contam como a pasta do vídeo (`Show/Subs/ep1.en.srt`). */
const SUBTITLE_DIRS: ReadonlySet<string> = new Set(['subs', 'subtitles'])
/** Marcadores depois do idioma que não fazem parte do nome-base (`ep1.pt-BR.forced.srt`). */
const FLAG_SUFFIX = /\.(?:forced|sdh|cc|hi)$/

export type MuxPairing = Pick<BatchMuxPlan, 'items' | 'unmatchedVideos' | 'unmatchedSubtitles'>

interface Entry {
  file: ScannedFile
  dir: string
  /** Nome sem extensão, minúsculo. */
  stem: string
}

/**
 * Pareamento determinístico de MKVs com legendas externas. Nada é inferido por distância de
 * edição: a legenda que não cai numa das regras abaixo fica em `unmatchedSubtitles`.
 *
 *  1. Mesma pasta (`Subs`/`Subtitles` do vídeo conta como a pasta dele) e mesmo nome-base,
 *     ignorando sufixos de idioma/flags (`X.mkv` ↔ `X.pt-BR.srt`, `X.en.forced.ass`).
 *  2. Sem vídeo de mesmo nome: mesma pasta e mesma temporada/episódio extraídos do nome
 *     (`S01E05`, `1x05`, ou `Show - 28` absoluto).
 *  3. Mais de um vídeo candidato em qualquer regra: ambíguo, nunca resolvido sozinho.
 */
export function pairMux(
  videoFiles: readonly ScannedFile[],
  subtitleFiles: readonly ScannedFile[]
): MuxPairing {
  const videos = videoFiles.map((file): Entry => entry(file, dirname(file.path)))
  const byStem = new Map<string, Entry[]>()
  const byEpisode = new Map<string, Entry[]>()
  for (const v of videos) {
    push(byStem, `${v.dir}\0${v.stem}`, v)
    const ep = episodeKey(v.file.path)
    if (ep) push(byEpisode, `${v.dir}\0${ep}`, v)
  }

  const assigned = new Map<ScannedFile, BatchMuxPlanItem['subtitles']>()
  const unmatchedSubtitles: BatchMuxPlanSubtitle[] = []

  for (const file of subtitleFiles) {
    const sub = entry(file, subtitleDir(file.path))
    const language = languageOf(file.path)
    const out: BatchMuxPlanSubtitle = { path: file.path, relPath: file.relPath, language }

    let by: 'name' | 'episode' = 'name'
    let candidates =
      byStem.get(`${sub.dir}\0${sub.stem}`) ?? byStem.get(`${sub.dir}\0${baseStem(sub.stem)}`) ?? []
    if (candidates.length === 0) {
      by = 'episode'
      const ep = episodeKey(file.path)
      candidates = (ep && byEpisode.get(`${sub.dir}\0${ep}`)) || []
    }
    const target = candidates.length === 1 ? candidates[0].file : null
    const list = target && (assigned.get(target) ?? [])
    if (!target || !list || list.length >= MAX_SUBTITLES_PER_VIDEO) {
      unmatchedSubtitles.push(out)
      continue
    }
    list.push({ ...out, matchedBy: by })
    assigned.set(target, list)
  }

  const items: BatchMuxPlanItem[] = []
  const unmatchedVideos: BatchMuxPlan['unmatchedVideos'] = []
  for (const { file } of videos) {
    const subtitles = assigned.get(file)
    const video = { path: file.path, relPath: file.relPath }
    if (subtitles?.length) items.push({ video, subtitles })
    else unmatchedVideos.push(video)
  }
  return { items, unmatchedVideos, unmatchedSubtitles }
}

function entry(file: ScannedFile, dir: string): Entry {
  return { file, dir, stem: basename(file.path, extname(file.path)).toLowerCase() }
}

function push<K, V>(map: Map<K, V[]>, key: K, value: V): void {
  const list = map.get(key)
  if (list) list.push(value)
  else map.set(key, [value])
}

/** Idioma do sufixo (`ep1.pt-BR.srt`, `ep1.en.forced.ass`); `und` quando não há. */
function languageOf(path: string): string {
  let stem = basename(path, extname(path))
  while (FLAG_SUFFIX.test(stem.toLowerCase())) stem = stem.slice(0, stem.lastIndexOf('.'))
  return langFromFilename(`${stem}.srt`) ?? 'und'
}

/** A pasta lógica da legenda: `Show/Subs/x.srt` pareia com `Show/x.mkv`. */
function subtitleDir(path: string): string {
  const dir = dirname(path)
  return SUBTITLE_DIRS.has(basename(dir).toLowerCase()) ? dirname(dir) : dir
}

/** `ep1.en.forced` -> `ep1` (até 3 sufixos de idioma/flag, só os reconhecidos). */
function baseStem(stem: string): string {
  let s = stem
  for (let i = 0; i < 3; i++) {
    if (FLAG_SUFFIX.test(s)) s = s.replace(FLAG_SUFFIX, '')
    else if (langFromFilename(`${s}.srt`)) s = s.slice(0, s.lastIndexOf('.'))
    else break
  }
  return s
}

/** `se:1:5` (SxxExx / 1x05) ou `abs:28` (anime sem temporada). Sem número: sem regra 2. */
function episodeKey(path: string): string | null {
  const r = parseReleaseName(path)
  if (r.season !== undefined && r.episode !== undefined) return `se:${r.season}:${r.episode}`
  if (r.absoluteEpisode !== undefined) return `abs:${r.absoluteEpisode}`
  return null
}
