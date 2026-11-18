import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'
import { z } from 'zod'
import type { Log } from './types'

const entrySchema = z.object({
  version: z.string(),
  archiveSha256: z.string(),
  archiveType: z.enum(['zip', '7z', 'appimage']),
  binaryRelativePath: z.string(),
  installedAt: z.string()
})
const fileSchema = z.object({ tools: z.record(z.string(), entrySchema) })

export type InstalledEntry = z.infer<typeof entrySchema>

/** Estado persistido em userData/bin/installed.json (escrita atômica e serializada). */
export class InstalledRegistry {
  private queue: Promise<unknown> = Promise.resolve()

  constructor(
    private readonly file: string,
    private readonly log: Log
  ) {}

  async read(): Promise<Record<string, InstalledEntry>> {
    try {
      const parsed = fileSchema.safeParse(JSON.parse(await readFile(this.file, 'utf8')))
      if (parsed.success) return parsed.data.tools
      this.log.warn('installed.json inválido, ignorando', parsed.error.message)
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== 'ENOENT')
        this.log.warn('installed.json ilegível', err)
    }
    return {}
  }

  /** Aplica `mutate` sobre o estado atual de forma serializada. */
  update(mutate: (tools: Record<string, InstalledEntry>) => void): Promise<void> {
    const run = async (): Promise<void> => {
      const tools = await this.read()
      mutate(tools)
      await mkdir(dirname(this.file), { recursive: true })
      const tmp = `${this.file}.tmp`
      await writeFile(tmp, JSON.stringify({ tools }, null, 2))
      await rename(tmp, this.file)
    }
    const next = this.queue.then(run, run)
    this.queue = next.catch(() => undefined)
    return next
  }
}
