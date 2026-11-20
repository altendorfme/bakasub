// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import '@renderer/i18n'
import { FailedLines } from './job-result'

afterEach(cleanup)

describe('FailedLines', () => {
  it('shows each line left in the original language: where, why and the text', () => {
    render(
      <FailedLines
        lines={[
          {
            cueId: 12,
            reason: 'UNTRANSLATED_VALIDATION_FAILED',
            excerpt: '{\\an8}Row, row, fight the power!',
            location: { line: 40, endLine: 42, startMs: 83_000 }
          },
          { cueId: 99, reason: 'UNTRANSLATED_CONTENT_FILTERED' }
        ]}
      />
    )
    expect(screen.getByText('2 lines stayed in the original language')).toBeTruthy()
    expect(screen.getByText('{\\an8}Row, row, fight the power!')).toBeTruthy()
    expect(screen.getByText('00:01:23')).toBeTruthy()
    expect(screen.getByText('The model kept breaking the formatting')).toBeTruthy()
    // Jobs saved before the excerpt existed still say which line it was.
    expect(screen.getByText('Line #99 (text not recorded for this job)')).toBeTruthy()
  })
})
