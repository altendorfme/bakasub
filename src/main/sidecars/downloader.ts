import { createHash, type Hash } from 'node:crypto'
import { createReadStream, createWriteStream } from 'node:fs'
import { readFile, rename, rm, stat, writeFile } from 'node:fs/promises'
import { Readable, Transform } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import type { ReadableStream as NodeWebStream } from 'node:stream/web'
import { AppError } from '../errors'
import type { Log } from './types'

export interface DownloadOptions {
  url: string
  sha256: string
  destFile: string
  signal?: AbortSignal
  idleTimeoutMs: number
  /** Tentativas totais (cada retry retoma de onde parou). */
  maxAttempts?: number
  log?: Log
  onProgress?(received: number, total: number | null): void
}

interface PartMeta {
  /** Validador da representação baixada (ETag forte ou Last-Modified), usado em If-Range. */
  validator: string
}

const sleep = (ms: number, signal?: AbortSignal): Promise<void> =>
  new Promise((resolve) => {
    const t = setTimeout(resolve, ms)
    signal?.addEventListener('abort', () => (clearTimeout(t), resolve()), { once: true })
  })

/**
 * Download com SHA-256, resume por HTTP Range e retry com backoff exponencial.
 * - `<dest>.part` + `<dest>.part.json` (validador) persistem entre falhas, cancelamentos e reinícios.
 * - Resume só ocorre com validador (ETag forte/Last-Modified) enviado em `If-Range`;
 *   se o servidor responder 200, o arquivo recomeça do zero.
 * - Divergência de hash descarta tudo (conteúdo inválido não é retomável).
 */
export async function downloadVerified(opts: DownloadOptions): Promise<void> {
  const maxAttempts = opts.maxAttempts ?? 4
  for (let attempt = 1; ; attempt++) {
    try {
      return await attemptDownload(opts)
    } catch (err) {
      const retryable = err instanceof AppError && err.code === 'NETWORK'
      if (!retryable || attempt >= maxAttempts || opts.signal?.aborted) {
        if (err instanceof AppError && err.code === 'CHECKSUM_MISMATCH')
          await discardPart(opts.destFile)
        throw err
      }
      const delay = Math.min(1000 * 2 ** (attempt - 1), 8000)
      opts.log?.warn(
        `download falhou (tentativa ${attempt}/${maxAttempts}): ${(err as Error).message}; retry em ${delay}ms`
      )
      await sleep(delay, opts.signal)
      if (opts.signal?.aborted) throw new AppError('CANCELLED', 'Download cancelado')
    }
  }
}

const partPath = (dest: string): string => `${dest}.part`
const metaPath = (dest: string): string => `${dest}.part.json`

async function discardPart(dest: string): Promise<void> {
  await rm(partPath(dest), { force: true })
  await rm(metaPath(dest), { force: true })
}

async function readResumeState(dest: string): Promise<{ size: number; validator: string } | null> {
  try {
    const size = (await stat(partPath(dest))).size
    const meta = JSON.parse(await readFile(metaPath(dest), 'utf8')) as PartMeta
    return size > 0 && meta.validator ? { size, validator: meta.validator } : null
  } catch {
    return null
  }
}

async function hashFileInto(hash: Hash, file: string): Promise<void> {
  for await (const chunk of createReadStream(file)) hash.update(chunk as Buffer)
}

function pickValidator(headers: Headers): string | null {
  const etag = headers.get('etag')
  if (etag && !etag.startsWith('W/')) return etag // ETag fraco não serve para If-Range
  return headers.get('last-modified')
}

async function attemptDownload(opts: DownloadOptions): Promise<void> {
  const ctrl = new AbortController()
  const onAbort = (): void => ctrl.abort(new AppError('CANCELLED', 'Download cancelado'))
  if (opts.signal?.aborted) onAbort()
  opts.signal?.addEventListener('abort', onAbort, { once: true })

  let idle: NodeJS.Timeout | undefined
  const armIdle = (): void => {
    clearTimeout(idle)
    idle = setTimeout(
      () => ctrl.abort(new AppError('NETWORK', 'Download travado (sem dados)')),
      opts.idleTimeoutMs
    )
  }

  try {
    const resume = await readResumeState(opts.destFile)
    const headers: Record<string, string> = {}
    if (resume) {
      headers['Range'] = `bytes=${resume.size}-`
      headers['If-Range'] = resume.validator
    }

    armIdle()
    const res = await fetch(opts.url, { signal: ctrl.signal, redirect: 'follow', headers })
    // Redirect não pode rebaixar para http.
    if (!res.url.startsWith('https://'))
      throw new AppError('NETWORK', 'Redirect para URL não-https')

    if (res.status === 416) {
      await discardPart(opts.destFile) // parcial incompatível com o servidor: recomeça
      throw new AppError('NETWORK', 'Servidor recusou o Range (416); reiniciando')
    }
    if (!res.ok || !res.body) throw new AppError('NETWORK', `HTTP ${res.status} em ${opts.url}`)

    let offset = 0
    let total: number | null
    if (resume && res.status === 206) {
      const m = /^bytes (\d+)-\d+\/(\d+|\*)$/.exec(res.headers.get('content-range') ?? '')
      if (!m || Number(m[1]) !== resume.size) {
        await discardPart(opts.destFile)
        throw new AppError('NETWORK', 'Content-Range inconsistente; reiniciando')
      }
      offset = resume.size
      total = m[2] === '*' ? null : Number(m[2])
      opts.log?.info(`download retomado em ${offset} bytes`)
    } else {
      // 200: servidor ignorou o Range ou o validador mudou -> recomeça do zero.
      if (resume) opts.log?.info('servidor não retomou (200); reiniciando download')
      total = Number(res.headers.get('content-length')) || null
      await discardPart(opts.destFile)
      const validator = pickValidator(res.headers)
      if (validator)
        await writeFile(metaPath(opts.destFile), JSON.stringify({ validator } satisfies PartMeta))
    }

    const hash = createHash('sha256')
    if (offset > 0) await hashFileInto(hash, partPath(opts.destFile))

    let received = offset
    let lastEmit = 0
    const meter = new Transform({
      transform(chunk: Buffer, _enc, cb) {
        armIdle()
        hash.update(chunk)
        received += chunk.length
        const now = Date.now()
        if (now - lastEmit > 250) {
          lastEmit = now
          opts.onProgress?.(received, total)
        }
        cb(null, chunk)
      }
    })

    armIdle()
    await pipeline(
      Readable.fromWeb(res.body as unknown as NodeWebStream),
      meter,
      createWriteStream(partPath(opts.destFile), { flags: offset > 0 ? 'a' : 'w', mode: 0o600 }),
      { signal: ctrl.signal }
    )
    opts.onProgress?.(received, total)

    // Corpo truncado sem erro explícito: mantém o .part e deixa o retry retomar.
    if (total !== null && received !== total) {
      throw new AppError('NETWORK', `Download incompleto (${received}/${total} bytes)`)
    }

    const digest = hash.digest('hex')
    if (digest !== opts.sha256.toLowerCase()) {
      throw new AppError(
        'CHECKSUM_MISMATCH',
        `SHA-256 divergente para ${opts.url} (esperado ${opts.sha256}, obtido ${digest})`
      )
    }
    await rename(partPath(opts.destFile), opts.destFile)
    await rm(metaPath(opts.destFile), { force: true })
  } catch (err) {
    // O .part é mantido de propósito (falha de rede ou cancelamento): permite resume.
    if (err instanceof AppError) throw err
    if (opts.signal?.aborted) throw new AppError('CANCELLED', 'Download cancelado')
    const reason = ctrl.signal.reason
    if (reason instanceof AppError) throw reason
    throw new AppError('NETWORK', `Falha no download de ${opts.url}`, { cause: err })
  } finally {
    clearTimeout(idle)
    opts.signal?.removeEventListener('abort', onAbort)
  }
}
