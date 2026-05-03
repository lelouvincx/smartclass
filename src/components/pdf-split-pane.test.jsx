import React from 'react'
import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { PdfSplitPane } from './pdf-split-pane'

// localStorage mock is provided by jsdom automatically

describe('PdfSplitPane', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  afterEach(() => {
    localStorage.clear()
  })

  it('renders children without an iframe when fileUrl is null', () => {
    render(
      <PdfSplitPane fileUrl={null}>
        <div data-testid="child-content">Answer Form</div>
      </PdfSplitPane>
    )

    expect(screen.getByTestId('child-content')).toBeInTheDocument()
    expect(screen.queryByTitle('Exercise PDF')).not.toBeInTheDocument()
  })

  it('renders an iframe with the correct src when fileUrl is provided', () => {
    render(
      <PdfSplitPane fileUrl="/api/files/42">
        <div>Answer Form</div>
      </PdfSplitPane>
    )

    const iframe = screen.getByTitle('Exercise PDF')
    expect(iframe).toBeInTheDocument()
    expect(iframe).toHaveAttribute('src', '/api/files/42')
  })

  it('renders children alongside the iframe', () => {
    render(
      <PdfSplitPane fileUrl="/api/files/42">
        <div data-testid="form">Answer Form</div>
      </PdfSplitPane>
    )

    expect(screen.getByTestId('form')).toBeInTheDocument()
    expect(screen.getByTitle('Exercise PDF')).toBeInTheDocument()
  })

  it('shows a toggle button when fileUrl is provided', () => {
    render(
      <PdfSplitPane fileUrl="/api/files/42">
        <div>Content</div>
      </PdfSplitPane>
    )

    // Toggle button should be visible (for mobile collapse)
    expect(screen.getByRole('button', { name: /pdf/i })).toBeInTheDocument()
  })

  it('hides iframe after clicking the toggle button', () => {
    render(
      <PdfSplitPane fileUrl="/api/files/42">
        <div>Content</div>
      </PdfSplitPane>
    )

    const toggleButton = screen.getByRole('button', { name: /pdf/i })
    fireEvent.click(toggleButton)

    expect(screen.queryByTitle('Exercise PDF')).not.toBeInTheDocument()
  })

  it('shows iframe again after toggling twice', () => {
    render(
      <PdfSplitPane fileUrl="/api/files/42">
        <div>Content</div>
      </PdfSplitPane>
    )

    const toggleButton = screen.getByRole('button', { name: /pdf/i })
    fireEvent.click(toggleButton) // hide
    fireEvent.click(toggleButton) // show

    expect(screen.getByTitle('Exercise PDF')).toBeInTheDocument()
  })

  it('persists visibility state to localStorage', () => {
    render(
      <PdfSplitPane fileUrl="/api/files/42">
        <div>Content</div>
      </PdfSplitPane>
    )

    const toggleButton = screen.getByRole('button', { name: /pdf/i })
    fireEvent.click(toggleButton)

    expect(localStorage.getItem('smartclass-take-pdf-visible')).toBe('false')
  })

  it('reads initial visibility state from localStorage', () => {
    localStorage.setItem('smartclass-take-pdf-visible', 'false')

    render(
      <PdfSplitPane fileUrl="/api/files/42">
        <div>Content</div>
      </PdfSplitPane>
    )

    // Should start hidden — no iframe
    expect(screen.queryByTitle('Exercise PDF')).not.toBeInTheDocument()
  })
})
