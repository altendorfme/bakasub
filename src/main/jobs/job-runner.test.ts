import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  writeFileSync
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest'
import { TranslationCancelled } from '../llm/translate-document'
import type { MkvInfo } from '../media/mkv-probe'
import type { Artifacts } from './artifacts'
import type { JobSpec } from './job-spec'
import { JobRunner, StepFailure, type RunHooks } from './job-runner'
import type { StepDeps, SubtitleTranslator } from './step-context'
import type { PreflightEstimate } from '../../shared/ipc-contract'

const ASS = `[Script Info]\nScriptType: v4.00+\n\n[Events]\nFormat: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text\nDialogue: 0,0:00:01.00,0:00:02.00,Default,,0,0,0,,Hello there\n`
const SRT = `1\n00:00:01,000 --> 00:00:02,000\nHello there\n`
const VTT = `WEBVTT\n\n00:01.000 --> 00:02.000 align:start\n<v Bob>Tom &amp; Jerry\n`
const INFO: MkvInfo = {
  attachments: 0,
  subtitles: [
    { id: 2, codecId: 'S_TEXT/ASS', format: 'ass', language: 'en', default: true, forced: false },
    {
      id: 4,
      codecId: 'S_HDMV/PGS',
      format: null,
      unsupported: 'image-based',
      default: false,
      forced: false
    }
  ]
}
const usage = {
  requests: 1,
  promptTokens: 10,
  completionTokens: 5,
  cachedTokens: 0,
  cost: 0.01,
  costIncomplete: false
}

let root: string
let workDir: string
let outDir: string
let mkv: { probe: Mock; extract: Mock; mux: Mock }
let translator: { translate: Mock }

beforeEach(() => {
  threshold = null
  freeQuota = undefined
  preflightRuns = 0
  root = mkdtempSync(join(tmpdir(), 'bakasub-runner-'))
  workDir = join(root, 'work')
  outDir = join(root, 'out')
  mkdirSync(workDir)
  mkdirSync(outDir)
  writeFileSync(join(root, 'ep01.mkv'), 'MKV-SOURCE')
  writeFileSync(join(root, 'ep01.en.srt'), SRT)
  writeFileSync(join(root, 'ep02.en.vtt'), VTT)
  writeFileSync(join(root, 'sub.pt-BR.ass'), ASS)
  writeFileSync(join(root, 'broken.ass'), '   ')
  mkv = {
    probe: vi.fn(async () => INFO),
    extract: vi.fn(
      async (
        _src: string,
        tracks: { output: string }[],
        opts?: { onProgress?: (f: number) => void }
      ) => {
        opts?.onProgress?.(1)
        for (const t of tracks) writeFileSync(t.output, ASS)
        return { warnings: [] }
      }
    ),
    mux: vi.fn(async (plan: { output: string; subtitles: unknown[] }) => {
      writeFileSync(plan.output, `MUXED ${JSON.stringify(plan.subtitles)}`)
      return { warnings: ['odd timestamps'] }
    })
  }
  translator = {
    translate: vi.fn(async (input) => ({
      doc: input.doc,
      failed: [],
      usage,
      cache: { hits: 0, misses: 1 },
      status: 'completed'
    }))
  }
})

const ESTIMATE = {
  model: { id: 'a/b', pricing: { prompt: 0, completion: 0 }, catalogFetchedAt: null },
  approximate: false,
  lines: { total: 1, cached: 0, toTranslate: 1, chunks: 1 },
  tokens: { input: { low: 100, high: 115 }, output: { low: 20, high: 23 } },
  cost: { low: 0.01, high: 0.02 }
}
let threshold: number | null
let freeQuota: PreflightEstimate['freeQuota']
let preflightRuns: number
const runner = (): JobRunner =>
  new JobRunner({
    mkv: mkv as unknown as StepDeps['mkv'],
    translator: translator as unknown as SubtitleTranslator,
    preflight: {
      run: async () => {
        preflightRuns++
        return {
          estimate: freeQuota ? { ...ESTIMATE, freeQuota } : ESTIMATE,
          coverage: { totals: {} } as never
        }
      },
      autoConfirmBelowUsd: async () => threshold
    }
  })
const preset = {
  id: 'p1',
  name: 'P',
  mediaType: 'series' as const,
  model: 'a/b',
  glossary: [],
  temperature: 0.3,
  prompt: ''
}
const pipeline = (over: Partial<JobSpec> = {}): JobSpec =>
  ({
    kind: 'pipeline',
    source: join(root, 'ep01.mkv'),
    sourceSize: 10,
    outputDir: outDir,
    trackId: 2,
    preset,
    targetLang: 'pt-BR',
    setDefault: true,
    keepOriginalSubtitles: true,
    alsoWriteSubtitle: false,
    confirmBeforeTranslate: false,
    ...over
  }) as JobSpec

function hooks(signal = new AbortController().signal): RunHooks & {
  steps: string[]
  saved: Artifacts[]
} {
  const steps: string[] = []
  const saved: Artifacts[] = []
  return {
    steps,
    saved,
    signal,
    onStep: async (s: string) => {
      steps.push(s)
    },
    onArtifacts: async (a: Artifacts) => {
      saved.push(structuredClone(a))
    },
    onProgress: vi.fn()
  }
}

describe('JobRunner', () => {
  it('pipeline completo: MKV novo ao lado, faixa com idioma/nome, avisos do mux', async () => {
    const h = hooks()
    const r = await runner().run({ spec: pipeline(), artifacts: {}, workDir }, h)
    expect(h.steps).toEqual(['probe', 'extract', 'preflight', 'translate', 'mux'])
    expect(r.result.preflight?.decision).toBe('auto-confirmed')
    expect(r.status).toBe('completed-with-warnings')
    expect(r.result.outputs).toEqual([join(outDir, 'ep01.pt-BR.mkv')])
    expect(r.result.warnings).toEqual(['odd timestamps'])
    expect(r.result.usage).toEqual(usage)
    expect(readFileSync(join(outDir, 'ep01.pt-BR.mkv'), 'utf8')).toContain(
      'Brazilian Portuguese (BakaSub)'
    )
    expect(mkv.mux.mock.calls[0][0]).toMatchObject({
      sourceSubtitleTrackIds: [2, 4],
      setDefault: true
    })
    expect(readdirSync(outDir)).toEqual(['ep01.pt-BR.mkv']) // nada de .partial
    expect(translator.translate.mock.calls[0][0]).toMatchObject({
      sourceLang: 'en',
      targetLang: 'pt-BR'
    })
    expect(h.saved.at(-1)?.translate?.file.sha256).toMatch(/^[0-9a-f]{64}$/)
  })

  it('pipeline com alsoWriteSubtitle grava a legenda solta também', async () => {
    const r = await runner().run(
      { spec: pipeline({ alsoWriteSubtitle: true } as Partial<JobSpec>), artifacts: {}, workDir },
      hooks()
    )
    expect(r.result.outputs).toEqual([
      join(outDir, 'ep01.pt-BR.ass'),
      join(outDir, 'ep01.pt-BR.mkv')
    ])
  })

  it('faixa de imagem: falha no probe', async () => {
    const err = await runner()
      .run({ spec: pipeline({ trackId: 4 } as Partial<JobSpec>), artifacts: {}, workDir }, hooks())
      .catch((e) => e)
    expect(err).toBeInstanceOf(StepFailure)
    expect(err.step).toBe('probe')
    expect(err.cause).toMatchObject({ code: 'INVALID_INPUT' })
  })

  it('extract: arquivos com nome <base>.<id>.<lang>.<ext>', async () => {
    const spec = {
      kind: 'extract',
      source: join(root, 'ep01.mkv'),
      sourceSize: 10,
      outputDir: outDir,
      trackIds: [2]
    } as JobSpec
    const r = await runner().run({ spec, artifacts: {}, workDir }, hooks())
    expect(r.result.outputs).toEqual([join(outDir, 'ep01.2.en.ass')])
    expect(r.status).toBe('completed')
  })

  it('translate de .srt solto: <base>.<lang>.srt; colisão vira (2)', async () => {
    writeFileSync(join(outDir, 'ep01.pt-BR.srt'), 'já existe')
    const spec = {
      kind: 'translate',
      source: join(root, 'ep01.en.srt'),
      sourceSize: 1,
      outputDir: outDir,
      preset,
      targetLang: 'pt-BR',
      sourceLang: 'en',
      confirmBeforeTranslate: false
    } as JobSpec
    const r = await runner().run({ spec, artifacts: {}, workDir }, hooks())
    expect(r.result.outputs).toEqual([join(outDir, 'ep01.pt-BR (2).srt')])
    expect(readFileSync(r.result.outputs[0], 'utf8')).toBe(SRT)
  })

  it('translate de .vtt solto: grava .vtt, cabeçalho e entidades preservados', async () => {
    const spec = {
      kind: 'translate',
      source: join(root, 'ep02.en.vtt'),
      sourceSize: 1,
      outputDir: outDir,
      preset,
      targetLang: 'pt-BR',
      sourceLang: 'en',
      confirmBeforeTranslate: false
    } as JobSpec
    const r = await runner().run({ spec, artifacts: {}, workDir }, hooks())
    expect(r.result.outputs).toEqual([join(outDir, 'ep02.pt-BR.vtt')])
    expect(readFileSync(r.result.outputs[0], 'utf8')).toBe(VTT)
  })

  it('mux: legenda ilegível falha no validate, antes de tocar no MKV', async () => {
    const spec = {
      kind: 'mux',
      source: join(root, 'ep01.mkv'),
      sourceSize: 10,
      outputDir: outDir,
      subtitles: [
        { path: join(root, 'broken.ass'), size: 3, language: 'pt-BR', name: 'X', default: true }
      ],
      setDefault: true,
      keepOriginalSubtitles: true
    } as JobSpec
    const err = await runner()
      .run({ spec, artifacts: {}, workDir }, hooks())
      .catch((e) => e)
    expect(err.step).toBe('validate')
    expect(err.cause).toMatchObject({ code: 'INVALID_SUBTITLE' })
    expect(mkv.mux).not.toHaveBeenCalled()
  })

  it('retry retoma da etapa que falhou quando os artefatos conferem', async () => {
    const first = hooks()
    translator.translate.mockRejectedValueOnce(
      Object.assign(new Error('LLM down'), { code: 'LLM_UNAVAILABLE' })
    )
    const err = await runner()
      .run({ spec: pipeline(), artifacts: {}, workDir }, first)
      .catch((e) => e)
    expect(err.step).toBe('translate')
    const artifacts = first.saved.at(-1)!

    const second = hooks()
    await runner().run({ spec: pipeline(), artifacts, workDir }, second)
    expect(second.steps).toEqual(['translate', 'mux'])
    expect(preflightRuns).toBe(1)
    expect(mkv.extract).toHaveBeenCalledTimes(1)
  })

  it('artefato adulterado: refaz a partir dele', async () => {
    const first = hooks()
    translator.translate.mockRejectedValueOnce(new Error('x'))
    await runner()
      .run({ spec: pipeline(), artifacts: {}, workDir }, first)
      .catch(() => undefined)
    const artifacts = first.saved.at(-1)!
    writeFileSync(artifacts.extract!.files[0].path, 'mudou')
    const second = hooks()
    await runner().run({ spec: pipeline(), artifacts, workDir }, second)
    expect(second.steps).toEqual(['extract', 'preflight', 'translate', 'mux'])
  })

  it('falha no mux remove o .partial', async () => {
    mkv.mux.mockImplementationOnce(async (plan: { output: string }) => {
      writeFileSync(plan.output, 'meio')
      throw Object.assign(new Error('boom'), { code: 'MEDIA_TOOL_FAILED' })
    })
    const err = await runner()
      .run({ spec: pipeline(), artifacts: {}, workDir }, hooks())
      .catch((e) => e)
    expect(err.step).toBe('mux')
    expect(readdirSync(outDir)).toEqual([])
  })

  it('linhas não traduzidas => completed-with-warnings com failedLines', async () => {
    translator.translate.mockImplementationOnce(async (input: { doc: unknown }) => ({
      doc: input.doc,
      failed: [{ cueId: 1, reason: 'UNTRANSLATED_VALIDATION_FAILED', issues: [] }],
      usage,
      cache: { hits: 0, misses: 1 },
      status: 'completed-with-warnings'
    }))
    mkv.mux.mockImplementationOnce(async (plan: { output: string }) => {
      writeFileSync(plan.output, 'ok')
      return { warnings: [] }
    })
    const r = await runner().run({ spec: pipeline(), artifacts: {}, workDir }, hooks())
    expect(r.status).toBe('completed-with-warnings')
    expect(r.result.failedLines).toEqual([{ cueId: 1, reason: 'UNTRANSLATED_VALIDATION_FAILED' }])
  })

  it('cancelamento na tradução: StepFailure com o uso já gasto', async () => {
    translator.translate.mockRejectedValueOnce(new TranslationCancelled({ ...usage, cost: 0.2 }))
    const err = await runner()
      .run({ spec: pipeline(), artifacts: {}, workDir }, hooks())
      .catch((e) => e)
    expect(err).toBeInstanceOf(StepFailure)
    expect(err.cause).toBeInstanceOf(TranslationCancelled)
    expect(err.partial.usage.cost).toBe(0.2)
    expect(existsSync(join(outDir, 'ep01.pt-BR.mkv'))).toBe(false)
  })

  it('confirmação exigida: para em awaiting-confirmation antes de traduzir', async () => {
    const h = hooks()
    const r = await runner().run(
      {
        spec: pipeline({ confirmBeforeTranslate: true } as Partial<JobSpec>),
        artifacts: {},
        workDir
      },
      h
    )
    expect(r.status).toBe('awaiting-confirmation')
    expect(h.steps).toEqual(['probe', 'extract', 'preflight'])
    expect(r.result.preflight).toMatchObject({
      decision: 'needs-confirmation',
      cost: { high: 0.02 }
    })
    expect(translator.translate).not.toHaveBeenCalled()

    // Confirmado: retoma em translate, sem refazer extract nem preflight.
    const artifacts = structuredClone(h.saved.at(-1)!)
    artifacts.preflight!.estimate.decision = 'confirmed'
    const h2 = hooks()
    const r2 = await runner().run(
      { spec: pipeline({ confirmBeforeTranslate: true } as Partial<JobSpec>), artifacts, workDir },
      h2
    )
    expect(h2.steps).toEqual(['translate', 'mux'])
    expect(r2.result.preflight?.decision).toBe('confirmed')
    expect(preflightRuns).toBe(1)
  })

  it('auto-confirma abaixo do limite configurado', async () => {
    threshold = 0.05
    const r = await runner().run(
      {
        spec: pipeline({ confirmBeforeTranslate: true } as Partial<JobSpec>),
        artifacts: {},
        workDir
      },
      hooks()
    )
    expect(r.result.preflight?.decision).toBe('auto-confirmed')
    expect(translator.translate).toHaveBeenCalled()
  })

  it('limite abaixo do custo máximo: pede confirmação', async () => {
    threshold = 0.015
    const r = await runner().run(
      {
        spec: pipeline({ confirmBeforeTranslate: true } as Partial<JobSpec>),
        artifacts: {},
        workDir
      },
      hooks()
    )
    expect(r.status).toBe('awaiting-confirmation')
  })

  it('cota free insuficiente: pede confirmação mesmo abaixo do limite de custo, e avisa', async () => {
    threshold = 0.05
    freeQuota = {
      tier: 'under-10',
      source: 'auto',
      limit: 50,
      used: 49,
      remaining: 1,
      requests: 2,
      enough: false
    }
    const r = await runner().run(
      {
        spec: pipeline({ confirmBeforeTranslate: true } as Partial<JobSpec>),
        artifacts: {},
        workDir
      },
      hooks()
    )
    expect(r.status).toBe('awaiting-confirmation')
    expect(r.result.warnings.join()).toContain('free-model daily quota')
  })
})
