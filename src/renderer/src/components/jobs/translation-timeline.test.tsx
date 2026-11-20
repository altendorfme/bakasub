// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import type { TranslationTimeline as Timeline } from '@shared/ipc-contract'
import '@renderer/i18n'
import { TranslationTimeline } from './translation-timeline'

afterEach(cleanup)

const base: Timeline = {
  total: 200,
  cached: [[150, 200]],
  translated: [
    [0, 40],
    [75, 100]
  ],
  failed: [[30, 31]],
  active: [
    [40, 75],
    [100, 140]
  ],
  lanes: [
    [0, 75],
    [75, 150]
  ]
}

describe('TranslationTimeline', () => {
  it('desenha cada faixa na posição do episódio e marca os cortes entre lanes', () => {
    const { container } = render(<TranslationTimeline timeline={base} done={66} />)
    const bar = screen.getByRole('progressbar', { name: /across the episode/ })
    expect(bar.getAttribute('aria-valuenow')).toBe('66')
    expect(bar.getAttribute('aria-valuemax')).toBe('200')

    const style = (layer: string): string[] =>
      [...container.querySelectorAll<HTMLElement>(`[data-layer="${layer}"]`)].map((el) =>
        `${el.style.left} ${el.style.width}`.trim()
      )
    expect(style('cached')).toEqual(['75% 25%'])
    expect(style('translated')).toEqual(['0% 20%', '37.5% 12.5%'])
    expect(style('active')).toEqual(['20% 17.5%', '50% 20%'])
    expect(style('failed')).toEqual(['15% 0.5%'])
    expect(style('cut')).toEqual(['37.5%'])
  })

  it('legenda só com o que aparece; lanes contadas quando há mais de uma', () => {
    render(<TranslationTimeline timeline={base} done={66} />)
    for (const label of ['Translated', 'From cache', 'In progress', 'Not translated'])
      expect(screen.getByText(label)).toBeTruthy()
    expect(screen.getByText('2 stretches in parallel')).toBeTruthy()
    cleanup()

    render(
      <TranslationTimeline
        timeline={{ ...base, cached: [], failed: [], active: [], lanes: [[0, 200]] }}
        done={65}
      />
    )
    expect(screen.queryByText('From cache')).toBeNull()
    expect(screen.queryByText('Not translated')).toBeNull()
    expect(screen.queryByText(/in parallel/)).toBeNull()
  })
})
