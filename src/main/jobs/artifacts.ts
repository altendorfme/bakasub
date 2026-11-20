import type { SubtitleTextFormat } from '../../shared/ipc-contract'
import { createHash } from 'node:crypto'
import { createReadStream } from 'node:fs'
import { copyFile, rename, stat, unlink } from 'node:fs/promises'
import type { SubtitleTrack } from '../media/mkv-probe'
import { outputNames } from '../media/naming'
import type { JobStep } from '../../shared/ipc-contract'

export interface FileArtifact {
  readonly path: string
  readonly size: number
  readonly sha256: string
}

/** Saídas de cada etapa, persistidas em `jobs.artifacts` (base do retry por etapa). */
export interface Artifacts {
  probe?: { tracks: SubtitleTrack[] }
  extract?: {
    files: (FileArtifact & { trackId: number; format: SubtitleTextFormat; language?: string })[]
  }
  translate?: {
    file: FileArtifact & { format: SubtitleTextFormat }
    failedLines: import('../../shared/ipc-contract').FailedLine[]
    usage: NonNullable<import('../../shared/ipc-contract').JobResult['usage']>
    cache: { hits: number; misses: number }
  }
  preflight?: {
    estimate: import('../../shared/ipc-contract').PreflightEstimate
    /** `CoverageReport` completa (servida por `jobs:preflight`). */
    coverage: import('../parsers').CoverageReport
    /** System Prompt e blocos enviados (ausente em jobs anteriores a este campo). */
    prompt?: import('../../shared/ipc-contract').PromptSummary
  }
  validate?: { ok: true }
  write?: { outputs: string[] }
  mux?: { output: string; warnings: string[] }
}

export async function fileArtifact(path: string): Promise<FileArtifact> {
  const { size } = await stat(path)
  const hash = createHash('sha256')
  for await (const chunk of createReadStream(path)) hash.update(chunk as Buffer)
  return { path, size, sha256: hash.digest('hex') }
}

/** O arquivo ainda está lá e é o mesmo (tamanho + sha256). */
export async function verifyArtifact(a: FileArtifact): Promise<boolean> {
  try {
    const now = await fileArtifact(a.path)
    return now.size === a.size && now.sha256 === a.sha256
  } catch {
    return false
  }
}

/** Uma etapa está concluída quando seu artefato existe e os arquivos dele conferem. */
export async function isStepComplete(step: JobStep, a: Artifacts): Promise<boolean> {
  switch (step) {
    case 'probe':
      return a.probe !== undefined
    case 'extract':
      return a.extract !== undefined && (await allValid(a.extract.files))
    case 'translate':
      return a.translate !== undefined && (await verifyArtifact(a.translate.file))
    case 'preflight':
      return a.preflight !== undefined
    case 'validate':
      return a.validate !== undefined
    case 'write':
    case 'mux':
      // Saídas finais: nunca "reaproveitadas" num retry (o job só falha antes delas existirem).
      return false
  }
}

async function allValid(files: readonly FileArtifact[]): Promise<boolean> {
  for (const f of files) if (!(await verifyArtifact(f))) return false
  return true
}

/** Copia para `.partial` no mesmo diretório e renomeia: nunca deixa um arquivo final pela metade. */
export async function atomicCopy(src: string, finalPath: string): Promise<void> {
  const partial = outputNames.partial(finalPath)
  try {
    await copyFile(src, partial)
    await rename(partial, finalPath)
  } catch (err) {
    await unlink(partial).catch(() => undefined)
    throw err
  }
}
