// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import '@renderer/i18n'
import { MemoryOption } from './memory-option'

afterEach(cleanup)

const box = (): HTMLElement => screen.getByRole('checkbox', { name: 'Ignore saved translations' })

describe('MemoryOption', () => {
  it("off ('use'): unchecked, explains the reuse; checking asks for 'skip'", async () => {
    const onChange = vi.fn()
    render(<MemoryOption value="use" onChange={onChange} />)
    expect(box().getAttribute('aria-checked')).toBe('false')
    expect(box().getAttribute('aria-describedby')).toBeTruthy()
    expect(screen.getByText(/reused at no cost/)).toBeTruthy()
    await userEvent.click(box())
    expect(onChange).toHaveBeenCalledWith('skip')
  })

  it("on ('skip'): checked, says the cache gets fixed; unchecking asks for 'use'", async () => {
    const onChange = vi.fn()
    render(<MemoryOption value="skip" onChange={onChange} />)
    expect(box().getAttribute('aria-checked')).toBe('true')
    expect(screen.getByText(/new translations replace the saved ones/)).toBeTruthy()
    await userEvent.click(box())
    expect(onChange).toHaveBeenCalledWith('use')
  })

  it('disabled: no change', async () => {
    const onChange = vi.fn()
    render(<MemoryOption value="use" onChange={onChange} disabled />)
    await userEvent.click(box())
    expect(onChange).not.toHaveBeenCalled()
  })
})
