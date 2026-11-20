// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import '@renderer/i18n'
import type { PromptSummary as Summary } from '@shared/ipc-contract'
import { PromptSummary } from './prompt-summary'

afterEach(cleanup)

const base: Summary = {
  system: 'You are a professional subtitle translator.\n<media>\nTitle: Gurren Lagann\n</media>',
  systemTokens: 1234,
  glossaryEntries: 2,
  style: true,
  media: { tmdb: true, episode: true, notes: false }
}

describe('PromptSummary', () => {
  it('lists the blocks that went into the system prompt and shows the exact text', () => {
    render(<PromptSummary prompt={base} />)
    expect(screen.getByText('Glossary (2 terms)')).toBeTruthy()
    expect(screen.getByText('Preset style')).toBeTruthy()
    expect(screen.getByText('TMDB details')).toBeTruthy()
    expect(screen.getByText('Episode synopsis')).toBeTruthy()
    expect(screen.queryByText('Your notes')).toBeNull()
    expect(screen.getByText('System prompt: 1,234 tokens, repeated in every request')).toBeTruthy()
    expect(screen.getByText(/Title: Gurren Lagann/)).toBeTruthy()
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('warns when the chosen TMDB context could not be fetched', () => {
    render(
      <PromptSummary
        prompt={{
          ...base,
          glossaryEntries: 0,
          media: {
            tmdb: false,
            episode: false,
            notes: false,
            unavailable: 'TMDB lookup failed (offline)'
          }
        }}
      />
    )
    expect(screen.getByRole('alert').textContent).toContain('TMDB lookup failed (offline)')
    expect(screen.getByText('No media context')).toBeTruthy()
    expect(screen.getByText('No glossary')).toBeTruthy()
  })

  it('says so for jobs created before the prompt was recorded', () => {
    render(<PromptSummary prompt={null} />)
    expect(
      screen.getByText('This job was created before BakaSub recorded the prompt.')
    ).toBeTruthy()
  })
})
