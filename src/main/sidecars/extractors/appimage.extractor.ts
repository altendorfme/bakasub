import { chmod, stat } from 'node:fs/promises'
import { join } from 'node:path'
import { AppError } from '../../errors'
import type { ProcessRunner } from '../process-runner'
import type { Extractor } from './extractor'

/** AppImage type 2: `--appimage-extract` descompacta o squashfs sem FUSE. */
export class AppImageExtractor implements Extractor {
  constructor(private readonly runner: ProcessRunner) {}

  async extract(archive: string, stagingDir: string, signal?: AbortSignal): Promise<string> {
    await chmod(archive, 0o755)
    const res = await this.runner.run(archive, ['--appimage-extract'], {
      cwd: stagingDir,
      signal,
      timeoutMs: 10 * 60_000,
      // Evita que o runtime tente montar via FUSE.
      env: { APPIMAGE_EXTRACT_AND_RUN: '1' }
    })
    if (res.code !== 0) {
      throw new AppError(
        'EXTRACT_FAILED',
        `AppImage saiu com código ${res.code}: ${res.stderr.slice(0, 500)}`
      )
    }
    const root = join(stagingDir, 'squashfs-root')
    await stat(root).catch(() => {
      throw new AppError('EXTRACT_FAILED', 'squashfs-root não foi criado')
    })
    return root
  }
}
