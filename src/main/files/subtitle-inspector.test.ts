import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { encodingConfidence, inspectSubtitle } from './subtitle-inspector'

let dir: string
beforeAll(async () => {
  dir = await mkdtemp(join(tmpdir(), 'bakasub-inspect-'))
})
afterAll(() => rm(dir, { recursive: true, force: true }))

const SRT =
  '1\n00:00:01,000 --> 00:00:02,000\nHello there\n\n2\n00:00:03,000 --> 00:00:04,000\n♪♪\n'

describe('encodingConfidence', () => {
  it.each([
    [null, 'certain'],
    [0.95, 'high'],
    [0.8, 'high'],
    [0.6, 'medium'],
    [0.49, 'low'],
    [0, 'low']
  ] as const)('%s -> %s', (score, level) => expect(encodingConfidence(score)).toBe(level))
})

describe('inspectSubtitle', () => {
  it('reports encoding, empty diagnostics and coverage of a clean UTF-8 SRT', async () => {
    const p = join(dir, 'ok.srt')
    await writeFile(p, SRT)
    const r = await inspectSubtitle(p)
    expect(r.file).toEqual({ name: 'ok.srt', sizeBytes: Buffer.byteLength(SRT) })
    expect(r.format).toBe('srt')
    expect(r.encoding).toMatchObject({
      name: 'utf-8',
      confidence: 'certain',
      score: null,
      bom: false,
      eol: 'lf'
    })
    expect(r.diagnostics).toEqual({
      items: [],
      totals: { info: 0, warn: 0, error: 0 },
      truncated: false
    })
    expect(r.coverage.totals).toMatchObject({ cues: 2, translatable: 1, skipped: 1 })
  })

  it('surfaces parser diagnostics with severity, line and code', async () => {
    const p = join(dir, 'bad.srt')
    await writeFile(p, '1\n00:00:05,000 --> 00:00:02,000\nBackwards\n')
    const r = await inspectSubtitle(p)
    const d = r.diagnostics.items.find((x) => x.code === 'SRT_END_BEFORE_START')
    expect(d).toMatchObject({
      line: expect.any(Number),
      severity: expect.any(String),
      fix: 'report'
    })
    expect(r.diagnostics.totals[d!.severity]).toBeGreaterThan(0)
  })

  it('flags a legacy 8-bit file as a non-certain encoding', async () => {
    const p = join(dir, 'latin.srt')
    await writeFile(
      p,
      Buffer.from(SRT.replace('Hello there', 'Voc\xea n\xe3o').replace('♪♪', 'ok'), 'latin1')
    )
    const r = await inspectSubtitle(p)
    expect(r.encoding.name).not.toBe('utf-8')
    expect(r.encoding.confidence).not.toBe('certain')
    expect(r.encoding.score).not.toBeNull()
  })

  it('detects BOM and CRLF', async () => {
    const p = join(dir, 'bom.srt')
    await writeFile(p, '﻿' + SRT.replace(/\n/g, '\r\n'))
    const r = await inspectSubtitle(p)
    expect(r.encoding).toMatchObject({
      name: 'utf-8',
      bom: true,
      eol: 'crlf',
      confidence: 'certain'
    })
  })

  it('rejects relative paths, bad extensions and missing files with INVALID_PATH', async () => {
    await expect(inspectSubtitle('x.srt')).rejects.toMatchObject({ code: 'INVALID_PATH' })
    await expect(inspectSubtitle(join(dir, 'a.txt'))).rejects.toMatchObject({
      code: 'INVALID_PATH'
    })
    await expect(inspectSubtitle(join(dir, 'nope.srt'))).rejects.toMatchObject({
      code: 'INVALID_PATH'
    })
  })

  it('maps an unusable subtitle to INVALID_SUBTITLE', async () => {
    const p = join(dir, 'empty.srt')
    await writeFile(p, '')
    await expect(inspectSubtitle(p)).rejects.toMatchObject({ code: 'INVALID_SUBTITLE' })
  })
})
