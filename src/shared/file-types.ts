/** Extensões aceitas (Main valida, renderer classifica). Sem dependências: o preload também importa. */
export const MEDIA_EXTENSIONS = ['.mkv'] as const
export const SUBTITLE_EXTENSIONS = ['.srt', '.ass', '.ssa', '.vtt'] as const

export type SourceKind = 'video' | 'subtitle'

/** Pelo nome (o Main revalida o conteúdo). `null` = formato não aceito. */
export function sourceKindOf(path: string): SourceKind | null {
  const dot = path.lastIndexOf('.')
  const ext = dot === -1 ? '' : path.slice(dot).toLowerCase()
  if ((MEDIA_EXTENSIONS as readonly string[]).includes(ext)) return 'video'
  if ((SUBTITLE_EXTENSIONS as readonly string[]).includes(ext)) return 'subtitle'
  return null
}
