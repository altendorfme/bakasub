import { access, chmod, copyFile, mkdir, stat } from 'node:fs/promises'
import { constants } from 'node:fs'
import { basename, join } from 'node:path'
import { AppError } from '../../errors'
import type { ProcessRunner } from '../process-runner'
import type { Extractor } from './extractor'

/** zip e 7z via 7za (pacote `7zip-bin`) — sem depender de ferramentas do SO. */
export class SevenZipExtractor implements Extractor {
  private resolved: Promise<string> | null = null

  /**
   * @param bundledPath 7za empacotado (pode estar em mount somente-leitura, ex.: AppImage)
   * @param toolsDir diretório gravável (userData/bin/tools) para a cópia executável
   */
  constructor(
    private readonly runner: ProcessRunner,
    private readonly bundledPath: string,
    private readonly toolsDir: string
  ) {}

  async extract(archive: string, stagingDir: string, signal?: AbortSignal): Promise<string> {
    const sevenZip = await (this.resolved ??= this.ensureExecutable().catch((err) => {
      this.resolved = null
      throw err
    }))
    const res = await this.runner.run(
      sevenZip,
      ['x', '-y', '-bd', '-aoa', `-o${stagingDir}`, archive],
      { signal, timeoutMs: 10 * 60_000 }
    )
    if (res.code !== 0) {
      throw new AppError(
        'EXTRACT_FAILED',
        `7za saiu com código ${res.code}: ${res.stderr.slice(0, 500)}`
      )
    }
    return stagingDir
  }

  /**
   * O npm não preserva o bit de execução do 7za e, no AppImage, o binário fica num squashfs
   * somente-leitura (chmod in-place falha com EROFS). Se não for executável, usa uma cópia.
   */
  private async ensureExecutable(): Promise<string> {
    if (process.platform === 'win32') return this.bundledPath
    // access(X_OK) não é confiável em FUSE/squashfs (AppImage): responde OK e o spawn falha com
    // EACCES. O bit de execução do mode é a fonte da verdade.
    const bundled = await stat(this.bundledPath)
    if ((bundled.mode & 0o111) !== 0) {
      try {
        await access(this.bundledPath, constants.X_OK)
        return this.bundledPath
      } catch {
        /* segue para a cópia */
      }
    }
    const target = join(this.toolsDir, basename(this.bundledPath))
    const [src, dst] = [bundled, await stat(target).catch(() => null)]
    if (!dst || dst.size !== src.size) {
      await mkdir(this.toolsDir, { recursive: true })
      await copyFile(this.bundledPath, target)
    }
    await chmod(target, 0o755)
    return target
  }
}
