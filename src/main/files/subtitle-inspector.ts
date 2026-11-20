import { basename } from 'node:path'
import type {
  DetectedEncoding,
  DiagnosticSeverity,
  EncodingConfidence,
  SubtitleInspection
} from '../../shared/ipc-contract'
import { SUBTITLE_EXTENSIONS, MAX_SUBTITLE_BYTES, validateInputFile } from '../media/path-guard'
import { formatFromPath, readSubtitle } from '../jobs/steps/subtitle-io'
import { analyzeCoverage } from '../parsers'
import type { DocumentMeta } from '../parsers/core/types'

/** Teto de diagnósticos no payload (um arquivo ruim pode gerar um por linha). */
export const MAX_INSPECT_DIAGNOSTICS = 500

const EOL_NAME = { '\n': 'lf', '\r\n': 'crlf', '\r': 'cr', mixed: 'mixed' } as const

export function encodingConfidence(score: number | null): EncodingConfidence {
  if (score === null) return 'certain'
  if (score >= 0.8) return 'high'
  if (score >= 0.5) return 'medium'
  return 'low'
}

export function toDetectedEncoding(meta: DocumentMeta): DetectedEncoding {
  return {
    name: meta.encoding,
    confidence: encodingConfidence(meta.confidence),
    score: meta.confidence,
    bom: meta.bom,
    eol: EOL_NAME[meta.eol]
  }
}

/** Lê, decodifica e parseia uma legenda e devolve o que o parser sabe sobre ela. Sem LLM, sem job. */
export async function inspectSubtitle(path: string): Promise<SubtitleInspection> {
  const file = await validateInputFile(path, SUBTITLE_EXTENSIONS, MAX_SUBTITLE_BYTES)
  const { doc } = await readSubtitle(file.path)
  const totals: Record<DiagnosticSeverity, number> = { info: 0, warn: 0, error: 0 }
  for (const d of doc.diagnostics) totals[d.severity]++
  return {
    file: { name: basename(file.path), sizeBytes: file.size },
    format: formatFromPath(file.path),
    encoding: toDetectedEncoding(doc.meta),
    diagnostics: {
      items: doc.diagnostics.slice(0, MAX_INSPECT_DIAGNOSTICS).map((d) => ({ ...d })),
      totals,
      truncated: doc.diagnostics.length > MAX_INSPECT_DIAGNOSTICS
    },
    coverage: analyzeCoverage(doc)
  }
}
