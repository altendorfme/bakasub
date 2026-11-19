import { describe, expect, it, vi } from 'vitest'
import type { RunOptions, RunResult } from '../sidecars/process-runner'
import { MkvToolnix } from './mkvtoolnix-service'

function fakeRunner(
  script: (cmd: string, args: string[], opts: RunOptions) => RunResult | Promise<RunResult>
): {
  calls: { cmd: string; args: string[] }[]
  run: (cmd: string, args: string[], opts?: RunOptions) => Promise<RunResult>
} {
  const calls: { cmd: string; args: string[] }[] = []
  return {
    calls,
    run: vi.fn(async (cmd: string, args: string[], opts: RunOptions = {}) => {
      calls.push({ cmd, args })
      return script(cmd, args, opts)
    })
  }
}
const tools = {
  resolve: async (name: string) => ({ name, version: '1', path: `/bin/${name}`, env: { X: '1' } })
}
const identify = JSON.stringify({
  container: { recognized: true },
  tracks: [{ id: 2, type: 'subtitles', properties: { codec_id: 'S_TEXT/ASS', language: 'eng' } }]
})

describe('MkvToolnix', () => {
  it('probe: mkvmerge -J resolvido pelo SidecarManager', async () => {
    const r = fakeRunner(() => ({ code: 0, stdout: identify, stderr: '' }))
    const info = await new MkvToolnix(r, tools).probe('/v/ep.mkv')
    expect(r.calls[0]).toEqual({ cmd: '/bin/mkvmerge', args: ['-J', '/v/ep.mkv'] })
    expect(info.subtitles[0]).toMatchObject({ id: 2, format: 'ass', language: 'en' })
  })

  it('probe com erro: MEDIA_TOOL_FAILED com a mensagem do JSON', async () => {
    const r = fakeRunner(() => ({
      code: 2,
      stdout: JSON.stringify({ errors: ['The file could not be opened'] }),
      stderr: ''
    }))
    await expect(new MkvToolnix(r, tools).probe('/v/x.mkv')).rejects.toMatchObject({
      code: 'MEDIA_TOOL_FAILED',
      message: 'mkvmerge: The file could not be opened'
    })
  })

  it('mux: progresso via --gui-mode, exit 1 = avisos', async () => {
    const r = fakeRunner((_c, _a, opts) => {
      opts.onStdoutLine?.('#GUI#progress 50%')
      opts.onStdoutLine?.('#GUI#warning Track 3: odd timestamps')
      opts.onStdoutLine?.('#GUI#progress 100%')
      return { code: 1, stdout: '', stderr: '' }
    })
    const progress: number[] = []
    const res = await new MkvToolnix(r, tools).mux(
      {
        source: '/v/ep.mkv',
        output: '/o/.p.mkv',
        subtitles: [],
        sourceSubtitleTrackIds: [],
        setDefault: true,
        keepOriginalSubtitles: true
      },
      { onProgress: (p) => progress.push(p) }
    )
    expect(progress).toEqual([0.5, 1])
    expect(res.warnings).toEqual(['Track 3: odd timestamps'])
    expect(r.calls[0].cmd).toBe('/bin/mkvmerge')
  })

  it('extract: exit 2 => MEDIA_TOOL_FAILED com os #GUI#error', async () => {
    const r = fakeRunner((_c, _a, opts) => {
      opts.onStdoutLine?.('#GUI#error No track with the ID 9')
      return { code: 2, stdout: '', stderr: '' }
    })
    await expect(
      new MkvToolnix(r, tools).extract('/v/ep.mkv', [{ trackId: 9, output: '/w/9.ass' }])
    ).rejects.toMatchObject({
      code: 'MEDIA_TOOL_FAILED',
      message: 'mkvextract: No track with the ID 9'
    })
    expect(r.calls[0].cmd).toBe('/bin/mkvextract')
  })

  it('passa env do sidecar e o signal ao runner', async () => {
    const ac = new AbortController()
    const r = fakeRunner((_c, _a, opts) => {
      expect(opts.env).toEqual({ X: '1' })
      expect(opts.signal).toBe(ac.signal)
      return { code: 0, stdout: identify, stderr: '' }
    })
    await new MkvToolnix(r, tools).probe('/v/ep.mkv', ac.signal)
  })
})
