import React from 'react'
import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import ScrollToTopButton from './scroll-to-top-button'

function setScrollY(value) {
  Object.defineProperty(window, 'scrollY', {
    configurable: true,
    value,
  })
}

afterEach(() => {
  setScrollY(0)
  vi.restoreAllMocks()
})

describe('ScrollToTopButton', () => {
  it('appears after scrolling down and returns to the top', async () => {
    const user = userEvent.setup()
    const scrollTo = vi.spyOn(window, 'scrollTo').mockImplementation(() => {})

    setScrollY(0)
    render(<ScrollToTopButton threshold={100} />)

    expect(screen.queryByRole('button', { name: 'Back to top' })).not.toBeInTheDocument()

    setScrollY(160)
    fireEvent.scroll(window)

    await user.click(screen.getByRole('button', { name: 'Back to top' }))

    expect(scrollTo).toHaveBeenCalledWith({ top: 0, behavior: 'smooth' })
  })
})
