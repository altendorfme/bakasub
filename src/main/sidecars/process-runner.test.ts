import { describe, expect, it, vi } from 'vitest'
import { ProcessRunner } from './process-runner'

const log = { info: vi.fn(), warn: vi.fn(), error: vi.fn() }
const node = process.execPath
const script = (code: string): string[] => ['-e', code]

describe('ProcessRunner', () => {
  it('captura stdout/stderr e o código de saída', async () => {
    const r = await new ProcessRunner(log).run(
      node,
      script('process.stdout.write("ok"); process.stderr.write("err"); process.exit(1)')
    )
    expect(r).toEqual({ code: 1, stdout: 'ok', stderr: 'err' })
  })

  it('onStdoutLine: linhas completas, mesmo quebradas entre chunks e com CRLF', async () => {
    const lines: string[] = []
    await new ProcessRunner(log).run(
      node,
      script(
        'process.stdout.write("#GUI#progress 1"); setTimeout(() => { process.stdout.write("0%\\r\\n#GUI#warning x\\nfim") }, 20)'
      ),
      { onStdoutLine: (l) => lines.push(l) }
    )
    expect(lines).toEqual(['#GUI#progress 10%', '#GUI#warning x', 'fim'])
  })

  it('abort encerra o processo e rejeita com CANCELLED', async () => {
    const ac = new AbortController()
    const p = new ProcessRunner(log).run(node, script('setInterval(() => {}, 1000)'), {
      signal: ac.signal,
      killGraceMs: 200
    })
    setTimeout(() => ac.abort(), 50)
    await expect(p).rejects.toMatchObject({ code: 'CANCELLED' })
  })
})
