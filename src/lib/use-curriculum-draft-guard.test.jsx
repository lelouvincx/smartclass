import React, { useState } from 'react'
import { act, fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { BrowserRouter, Link, MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import useCurriculumDraftGuard from './use-curriculum-draft-guard'

function BrowserGuardApp({ pending = false, onGuardedLeave }) {
  const [dirty, setDirty] = useState(false)
  const [leaveAction, setLeaveAction] = useState(null)
  useCurriculumDraftGuard({
    blocked: dirty || pending,
    onLeave: (action) => {
      if (pending) return
      onGuardedLeave?.(action)
      setLeaveAction(() => action)
    },
  })

  return (
    <Routes>
      <Route path="/form" element={(
        <div>
          <label htmlFor="draft">Draft</label>
          <input id="draft" onChange={() => setDirty(true)} />
          <Link to="/next" state={{ preserved: true }}>Next page</Link>
          <a href="https://example.test/help">External help</a>
          <a href="https://example.test/new-tab" target="_blank" rel="noreferrer">New tab help</a>
          <a href="https://example.test/download" download>Download help</a>
          {leaveAction && (
            <div role="dialog" aria-label="Discard changes?">
              <button type="button" onClick={() => setLeaveAction(null)}>Cancel</button>
              <button type="button" onClick={() => { setDirty(false); leaveAction.retry(); setLeaveAction(null) }}>Discard</button>
            </div>
          )}
        </div>
      )} />
      <Route path="/next" element={<h1>Arrived</h1>} />
    </Routes>
  )
}

function renderBrowserGuard(options) {
  window.history.replaceState({ idx: 0 }, '', '/form')
  return render(<BrowserRouter><BrowserGuardApp {...options} /></BrowserRouter>)
}

function MemoryGuard({ blocked, onLeave }) {
  useCurriculumDraftGuard({ blocked, onLeave })
  return <Link to="/next" state={{ from: 'memory' }}>Next page</Link>
}

describe('useCurriculumDraftGuard', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('blocks in-app links, keeps the current page on cancel, and confirms the original target once', async () => {
    const user = userEvent.setup()
    renderBrowserGuard()

    await user.type(screen.getByLabelText('Draft'), 'dirty')
    await user.click(screen.getByRole('link', { name: 'Next page' }))

    expect(screen.getByRole('dialog', { name: 'Discard changes?' })).toBeInTheDocument()
    expect(window.location.pathname).toBe('/form')
    expect(screen.getByDisplayValue('dirty')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(window.location.pathname).toBe('/form')
    expect(screen.getByDisplayValue('dirty')).toBeInTheDocument()

    await user.click(screen.getByRole('link', { name: 'Next page' }))
    await user.click(screen.getByRole('button', { name: 'Discard' }))

    expect(window.location.pathname).toBe('/next')
    expect(screen.getByRole('heading', { name: 'Arrived' })).toBeInTheDocument()
  })

  it('does not add browser history entries while the dirty state rerenders', async () => {
    const pushState = vi.spyOn(window.history, 'pushState')
    const user = userEvent.setup()
    renderBrowserGuard()

    await user.type(screen.getByLabelText('Draft'), 'abc')

    expect(pushState).not.toHaveBeenCalled()
    expect(window.history.state?.idx).toBe(0)
  })

  it('blocks MemoryRouter navigation through the navigator adapter', async () => {
    const leave = vi.fn()
    const user = userEvent.setup()
    render(<MemoryRouter initialEntries={['/form']}><MemoryGuard blocked onLeave={leave} /></MemoryRouter>)

    await user.click(screen.getByRole('link', { name: 'Next page' }))

    expect(leave).toHaveBeenCalledWith(expect.objectContaining({ type: 'push', state: { from: 'memory' } }))
    expect(screen.getByRole('link', { name: 'Next page' })).toBeInTheDocument()
  })

  it('blocks while pending without prompting from the parent', async () => {
    const onGuardedLeave = vi.fn()
    const user = userEvent.setup()
    renderBrowserGuard({ pending: true, onGuardedLeave })

    await user.click(screen.getByRole('link', { name: 'Next page' }))

    expect(window.location.pathname).toBe('/form')
    expect(screen.queryByRole('dialog', { name: 'Discard changes?' })).not.toBeInTheDocument()
    expect(onGuardedLeave).not.toHaveBeenCalled()
  })

  it('captures external links without breaking modifier-clicks, targets, or downloads', async () => {
    const onGuardedLeave = vi.fn()
    const user = userEvent.setup()
    renderBrowserGuard({ onGuardedLeave })

    await user.type(screen.getByLabelText('Draft'), 'dirty')
    const preventNavigation = (event) => event.preventDefault()
    document.addEventListener('click', preventNavigation)
    fireEvent.click(screen.getByRole('link', { name: 'External help' }), { button: 0, metaKey: true })
    fireEvent.click(screen.getByRole('link', { name: 'New tab help' }), { button: 0 })
    fireEvent.click(screen.getByRole('link', { name: 'Download help' }), { button: 0 })
    document.removeEventListener('click', preventNavigation)
    expect(screen.queryByRole('dialog', { name: 'Discard changes?' })).not.toBeInTheDocument()
    expect(onGuardedLeave).not.toHaveBeenCalled()

    await user.click(screen.getByRole('link', { name: 'External help' }))
    expect(screen.getByRole('dialog', { name: 'Discard changes?' })).toBeInTheDocument()
    expect(onGuardedLeave).toHaveBeenCalledWith(expect.objectContaining({ type: 'external', href: 'https://example.test/help' }))
  })

  it('restores a blocked physical popstate and replays the preserved direction after confirmation', () => {
    const leave = vi.fn()
    const routerListener = vi.fn()
    const go = vi.spyOn(window.history, 'go').mockImplementation(() => {})
    window.history.replaceState({ idx: 3 }, '', '/form')
    render(<MemoryRouter><MemoryGuard blocked onLeave={leave} /></MemoryRouter>)
    window.addEventListener('popstate', routerListener)

    act(() => {
      window.dispatchEvent(new PopStateEvent('popstate', { state: { idx: 2, marker: 'back-target' } }))
    })

    expect(go).toHaveBeenCalledWith(1)
    expect(routerListener).not.toHaveBeenCalled()
    expect(leave).toHaveBeenCalledWith(expect.objectContaining({ type: 'pop', delta: -1, fromIdx: 3, toIdx: 2, state: { idx: 2, marker: 'back-target' } }))

    act(() => {
      window.dispatchEvent(new PopStateEvent('popstate', { state: { idx: 3 } }))
    })
    expect(routerListener).not.toHaveBeenCalled()

    act(() => {
      leave.mock.calls[0][0].retry()
    })
    expect(go).toHaveBeenLastCalledWith(-1)

    window.removeEventListener('popstate', routerListener)
  })
})
