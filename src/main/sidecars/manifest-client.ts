import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { ZodType } from 'zod'
import { AppError } from '../errors'
import type { Log } from './types'

export interface ManifestResult<T> {
  data: T
  /** true quando a rede falhou e o último manifest válido em cache foi usado. */
  offline: boolean
}

/** Busca manifests remotos com timeout, validação Zod e fallback para o último cache válido. */
export class ManifestClient {
  constructor(private readonly deps: { cacheDir: string; timeoutMs: number; log: Log }) {}

  async load<T>(name: string, url: string, schema: ZodType<T>): Promise<ManifestResult<T>> {
    try {
      const res = await fetch(url, {
        signal: AbortSignal.timeout(this.deps.timeoutMs),
        headers: { 'Cache-Control': 'no-cache', Accept: 'application/json' }
      })
      if (!res.ok) throw new AppError('NETWORK', `Manifest ${name}: HTTP ${res.status}`)
      const parsed = schema.safeParse(await res.json())
      if (!parsed.success) {
        throw new AppError('INVALID_MANIFEST', `Manifest ${name} inválido: ${parsed.error.message}`)
      }
      await this.writeCache(name, parsed.data).catch((e) =>
        this.deps.log.warn(`manifest cache write failed (${name})`, e)
      )
      return { data: parsed.data, offline: false }
    } catch (err) {
      // Manifest remoto inválido NÃO cai no cache: seria mascarar adulteração/erro de publicação.
      if (err instanceof AppError && err.code === 'INVALID_MANIFEST') throw err
      this.deps.log.warn(`manifest ${name} fetch failed, trying cache`, err)
      const cached = await this.readCache(name, schema)
      if (cached) return { data: cached, offline: true }
      throw err instanceof AppError
        ? err
        : new AppError('NETWORK', `Não foi possível obter o manifest ${name}`, { cause: err })
    }
  }

  private file(name: string): string {
    return join(this.deps.cacheDir, 'manifests', `${name}.json`)
  }

  private async writeCache(name: string, data: unknown): Promise<void> {
    await mkdir(join(this.deps.cacheDir, 'manifests'), { recursive: true })
    const tmp = `${this.file(name)}.tmp`
    await writeFile(tmp, JSON.stringify(data))
    await rename(tmp, this.file(name))
  }

  private async readCache<T>(name: string, schema: ZodType<T>): Promise<T | null> {
    try {
      const parsed = schema.safeParse(JSON.parse(await readFile(this.file(name), 'utf8')))
      return parsed.success ? parsed.data : null
    } catch {
      return null
    }
  }
}
