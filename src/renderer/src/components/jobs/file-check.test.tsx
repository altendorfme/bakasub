// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import '@renderer/i18n'
import { subtitleInspection } from '@renderer/test/fixtures'
import { CoverageSummary, DiagnosticsList, EncodingIndicator } from './file-check'

afterEach(cleanup)

describe('EncodingIndicator', () => {
  it('shows a certain encoding without a warning', () => {
    render(<EncodingIndicator encoding={subtitleInspection().encoding} />)
    expect(screen.getByText('UTF-8')).toBeTruthy()
    expect(screen.getByText('Certain')).toBeTruthy()
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('warns prominently when the confidence is low', () => {
    render(
      <EncodingIndicator
        encoding={{ name: 'windows-1252', confidence: 'low', score: 0.31, bom: false, eol: 'crlf' }}
      />
    )
    expect(screen.getByText('Low confidence')).toBeTruthy()
    expect(screen.getByRole('alert').textContent).toContain('not sure')
    expect(screen.getByRole('alert').textContent).toContain('0.31')
  })
})

describe('DiagnosticsList', () => {
  const diagnostics = {
    items: [
      {
        code: 'SRT_OVERLAP',
        severity: 'warn' as const,
        fix: 'report' as const,
        line: 12,
        column: 1
      },
      { code: 'NEW_CODE', severity: 'error' as const, fix: 'auto' as const, line: 40, column: 3 }
    ],
    totals: { info: 0, warn: 1, error: 1 },
    truncated: false
  }

  it('is collapsed by default and lists severity, line and message once opened', () => {
    render(<DiagnosticsList diagnostics={diagnostics} />)
    expect(screen.queryByText('A cue overlaps the next one')).toBeNull()
    const toggle = screen.getByRole('button', { name: /Parser warnings/ })
    expect(toggle.getAttribute('aria-expanded')).toBe('false')
    fireEvent.click(toggle)
    expect(screen.getByText('A cue overlaps the next one')).toBeTruthy()
    expect(screen.getByText(/Line 12 · col 1/)).toBeTruthy()
    expect(screen.getByText('Warning')).toBeTruthy()
    // A code this UI does not know yet still renders.
    expect(screen.getByText('Unrecognized problem (NEW_CODE)')).toBeTruthy()
  })

  it('says so when there is nothing to report', () => {
    render(
      <DiagnosticsList
        diagnostics={{ items: [], totals: { info: 0, warn: 0, error: 0 }, truncated: false }}
      />
    )
    expect(screen.getByText('No parser warnings.')).toBeTruthy()
  })
})

describe('CoverageSummary', () => {
  it('shows translatable, skipped and untranslated lines', () => {
    const { totals } = subtitleInspection().coverage
    render(
      <CoverageSummary
        report={{
          ...subtitleInspection().coverage,
          totals: { ...totals, translatable: 90, skipped: 8, untranslated: 2 }
        }}
      />
    )
    expect(screen.getByText('90 of 100 lines go to the AI')).toBeTruthy()
    expect(screen.getByText('Nothing to translate: 8')).toBeTruthy()
    expect(screen.getByText('Will stay as is: 2')).toBeTruthy()
  })
})
