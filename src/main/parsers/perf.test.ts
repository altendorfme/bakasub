import { describe, expect, it } from 'vitest'
import { analyzeCoverage } from './core/coverage'
import { applyTranslation } from './core/segmentation/reinject'
import { toTranslationUnit } from './core/segmentation/segmenter'
import type { Cue } from './core/types'
import { srtFormat } from './srt'

function bigSrt(cues: number): string {
  const ts = (ms: number): string => {
    const s = Math.floor(ms / 1000)
    const pad = (n: number, w = 2): string => String(n).padStart(w, '0')
    return `${pad(Math.floor(s / 3600))}:${pad(Math.floor(s / 60) % 60)}:${pad(s % 60)},${pad(ms % 1000, 3)}`
  }
  const out: string[] = []
  for (let i = 0; i < cues; i++) {
    const start = i * 2500
    const text =
      i % 3 === 0
        ? `<i>Linha ${i}</i> com {\\an8}texto\n- segunda linha`
        : `Diálogo número ${i}, tudo bem?`
    out.push(`${i + 1}\n${ts(start)} --> ${ts(start + 2000)}\n${text}\n`)
  }
  return out.join('\n')
}

/** Limites folgados: o objetivo é pegar regressões de complexidade (O(n²)), não microbenchmarks. */
describe('desempenho (10 mil cues)', () => {
  const src = bigSrt(10_000)
  const time = <T>(fn: () => T): [T, number] => {
    const t0 = performance.now()
    const r = fn()
    return [r, performance.now() - t0]
  }

  it('parse, serialize, repair, cobertura e reinjeção', () => {
    const [doc, tParse] = time(() => srtFormat.parse(src))
    const [out, tSer] = time(() => srtFormat.serialize(doc))
    const [, tRepair] = time(() => srtFormat.serializeRepaired(doc))
    const [report, tCov] = time(() => analyzeCoverage(doc))
    const [, tApply] = time(() => {
      for (const item of doc.items) {
        if (item.kind !== 'cue') continue
        const unit = toTranslationUnit(item)!
        applyTranslation(item as Cue<unknown>, unit, unit.payload, srtFormat.lexInline)
      }
    })

    console.info(
      `[perf] 10k cues: parse ${tParse.toFixed(0)}ms | serialize ${tSer.toFixed(0)}ms | repair ${tRepair.toFixed(0)}ms | coverage ${tCov.toFixed(0)}ms | segment+apply ${tApply.toFixed(0)}ms`
    )

    expect(out).toBe(src)
    expect(report.totals.translatable).toBe(10_000)
    for (const t of [tParse, tSer, tRepair, tCov, tApply]) expect(t).toBeLessThan(1500)
  })
})
