import { readFile, writeFile } from 'node:fs/promises'
import { basename, extname } from 'node:path'
import { AppError } from '../../errors'
import {
  assFormat,
  decodeSubtitle,
  srtFormat,
  SubtitleParseError,
  type SubtitleDocument,
  type SubtitleFormat
} from '../../parsers'

export type TextFormatId = 'srt' | 'ass' | 'ssa'

export function formatFor(id: TextFormatId): SubtitleFormat<unknown> {
  return (id === 'srt' ? srtFormat : assFormat) as SubtitleFormat<unknown>
}

export function formatFromPath(path: string): TextFormatId {
  const ext = extname(path).slice(1).toLowerCase()
  if (ext === 'srt' || ext === 'ass' || ext === 'ssa') return ext
  throw new AppError('INVALID_SUBTITLE', `Unsupported subtitle extension: ${basename(path)}`)
}

/** Lê, decodifica e parseia. Arquivo ilegível => `INVALID_SUBTITLE` (com o nome, sem o caminho). */
export async function readSubtitle(
  path: string,
  id: TextFormatId = formatFromPath(path)
): Promise<{ doc: SubtitleDocument<unknown>; format: SubtitleFormat<unknown> }> {
  const format = formatFor(id)
  const { text, meta } = decodeSubtitle(await readFile(path))
  try {
    return { doc: format.parse(text, meta), format }
  } catch (err) {
    if (err instanceof SubtitleParseError)
      throw new AppError('INVALID_SUBTITLE', `${basename(path)}: ${err.code}`)
    throw err
  }
}

/** Serializa com as correções `auto` e grava em UTF-8 (BOM se a origem tinha). */
export async function writeSubtitle(
  path: string,
  doc: SubtitleDocument<unknown>,
  format: SubtitleFormat<unknown>
): Promise<string[]> {
  const { text, applied } = format.serializeRepaired(doc)
  await writeFile(path, (doc.meta.bom ? '﻿' : '') + text, 'utf8')
  return applied.map((a) => a.code)
}
