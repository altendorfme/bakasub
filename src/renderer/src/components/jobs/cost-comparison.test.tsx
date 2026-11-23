// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import '@renderer/i18n'
import type { Job, JobResult as Result, JobStatus, PreflightEstimate } from '@shared/ipc-contract'
import { CostComparison } from './cost-comparison'
import { costVerdict } from './cost-verdict'
import { JobResult } from './job-result'

// The error panel reads the query cache; not under test here.
vi.mock('./job-error', () => ({ JobError: () => null }))

afterEach(cleanup)

const estimate = (over: Partial<PreflightEstimate> = {}): PreflightEstimate => ({
  model: {
    id: 'google/gemini-2.5-flash',
    pricing: { prompt: 0.0000003, completion: 0.0000025 },
    catalogFetchedAt: null
  },
  approximate: false,
  lines: { total: 300, cached: 0, toTranslate: 300, copies: 0, chunks: 6 },
  tokens: { input: { low: 10_000, high: 12_000 }, output: { low: 5_000, high: 6_000 } },
  cost: { low: 0.01, high: 0.02 },
  decision: 'confirmed',
  ...over
})
const usage = (
  cost: number,
  over: Partial<NonNullable<Result['usage']>> = {}
): Result['usage'] => ({
  requests: 6,
  promptTokens: 11_000,
  completionTokens: 5_500,
  cachedTokens: 0,
  cost,
  costIncomplete: false,
  ...over
})
const show = (e: PreflightEstimate, u: Result['usage'], status: JobStatus = 'completed'): void => {
  render(<CostComparison estimate={e} usage={u} status={status} />)
}

describe('costVerdict', () => {
  it('uses the whole range; the deviation is relative to the nearest bound', () => {
    expect(costVerdict(estimate(), usage(0.015), 'completed')).toEqual({
      kind: 'within',
      deviation: 0
    })
    // Bounds count as inside, float noise included.
    expect(costVerdict(estimate(), usage(0.0200000001), 'completed').kind).toBe('within')
    const above = costVerdict(estimate(), usage(0.03), 'completed')
    expect(above.kind).toBe('above')
    expect('deviation' in above && above.deviation).toBeCloseTo(50)
    const below = costVerdict(estimate(), usage(0.005), 'completed')
    expect(below.kind).toBe('below')
    expect('deviation' in below && below.deviation).toBeCloseTo(-50)
  })

  it('a zero bound has no ratio', () => {
    const e = estimate({ cost: { low: 0, high: 0 } })
    expect(costVerdict(e, usage(0.01), 'completed')).toEqual({ kind: 'above', deviation: null })
    // Everything came from the cache: nothing billed, inside a 0–0 range.
    expect(costVerdict(e, undefined, 'completed')).toEqual({ kind: 'within', deviation: 0 })
  })

  it('incomplete cost: no verdict unless the known part is already above', () => {
    expect(costVerdict(estimate(), usage(0.012, { costIncomplete: true }), 'completed').kind).toBe(
      'partial'
    )
    expect(costVerdict(estimate(), usage(0.03, { costIncomplete: true }), 'completed').kind).toBe(
      'above'
    )
  })
})

describe('CostComparison', () => {
  it('completed job: estimated range, actual and the verdict', () => {
    show(estimate(), usage(0.015))
    expect(screen.getByText('US$ 0.010 – 0.020')).toBeTruthy()
    expect(screen.getByText('US$ 0.015')).toBeTruthy()
    expect(screen.getByText('Within the estimated range')).toBeTruthy()
  })

  it('above and below show the % from the nearest bound', () => {
    show(estimate(), usage(0.025))
    expect(screen.getByText('Above the estimate by 25%')).toBeTruthy()
    cleanup()
    show(estimate(), usage(0.0095))
    expect(screen.getByText('Below the estimate by 5%')).toBeTruthy()
  })

  it('no estimate (dynamic pricing): actual only, no verdict', () => {
    show(
      estimate({ cost: null, model: { id: 'x/y', pricing: null, catalogFetchedAt: null } }),
      usage(0.04)
    )
    expect(screen.getByText('Not estimated')).toBeTruthy()
    expect(screen.getByText('US$ 0.040')).toBeTruthy()
    expect(screen.getByText(/variable price/)).toBeTruthy()
    expect(screen.queryByText(/estimated range|the estimate by/)).toBeNull()
  })

  it('costIncomplete: the value is shown as partial, with a warning and no verdict', () => {
    show(estimate(), usage(0.012, { costIncomplete: true }))
    expect(screen.getByText('at least US$ 0.012')).toBeTruthy()
    expect(screen.getByRole('alert').textContent).toMatch(/Partial value/)
    expect(screen.queryByText('Within the estimated range')).toBeNull()
  })

  it('free model: no charge, no verdict', () => {
    show(
      estimate({
        model: {
          id: 'meta/llama:free',
          pricing: { prompt: 0, completion: 0 },
          catalogFetchedAt: null
        },
        cost: { low: 0, high: 0 }
      }),
      usage(0)
    )
    expect(screen.getByText('Free')).toBeTruthy()
    expect(screen.getByText('US$ 0.00')).toBeTruthy()
    expect(screen.getByText('Free model: nothing was billed.')).toBeTruthy()
    expect(screen.queryByText('Within the estimated range')).toBeNull()
  })

  it('cancelled or failed: actual cost so far, no verdict', () => {
    show(estimate(), usage(0.03), 'cancelled')
    expect(screen.getByText('US$ 0.030')).toBeTruthy()
    expect(screen.getByText(/did not finish/)).toBeTruthy()
    expect(screen.queryByText(/the estimate by/)).toBeNull()
    cleanup()
    // Cancelled at the review: nothing was sent.
    show(estimate(), undefined, 'failed')
    expect(screen.getByText('US$ 0.00')).toBeTruthy()
    expect(screen.getByText('nothing was sent to the AI')).toBeTruthy()
  })

  it('partial cache: says the estimate already counted the saved lines', () => {
    show(
      estimate({ lines: { total: 300, cached: 120, toTranslate: 180, copies: 0, chunks: 4 } }),
      usage(0.015)
    )
    expect(
      screen.getByText('The estimate already counted 120 lines from saved translations.')
    ).toBeTruthy()
  })
})

describe('JobResult', () => {
  const job = (result: Result): Job => ({
    id: 'j1',
    kind: 'translate',
    batchId: null,
    status: 'completed',
    step: null,
    source: 'ep.srt',
    progress: { step: null },
    result,
    error: null,
    attempt: 1,
    createdAt: '',
    updatedAt: '',
    startedAt: null,
    finishedAt: null
  })

  it('with a preflight estimate: the comparison replaces the plain cost line', () => {
    render(
      <JobResult
        job={job({ outputs: [], warnings: [], usage: usage(0.015), preflight: estimate() })}
      />
    )
    expect(screen.getByText('Within the estimated range')).toBeTruthy()
    expect(screen.queryByText('Cost: US$ 0.015')).toBeNull()
  })

  it('without one (older jobs): the plain cost line', () => {
    render(<JobResult job={job({ outputs: [], warnings: [], usage: usage(0.015) })} />)
    expect(screen.getByText('Cost: US$ 0.015')).toBeTruthy()
  })
})
