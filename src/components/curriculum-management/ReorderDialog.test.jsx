import React from 'react'
import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, expect, it, vi } from 'vitest'
import { ReorderDialog } from './ReorderDialog'

const drag = vi.hoisted(() => ({ handlers: null }))
vi.mock('@dnd-kit/core', async (original) => ({
  ...await original(),
  DndContext: ({ children, ...handlers }) => { drag.handlers = handlers; return children },
}))

const items = [
  { placement_id: 71, lecture: { id: 3, title: 'First', is_visible: 1 } },
  { placement_id: 82, lecture: { id: 5, title: 'Second', is_visible: 0 } },
  { placement_id: 93, lecture: { id: 7, title: 'Third', is_visible: 1 } },
]
beforeEach(() => { drag.handlers = null })

it('saves the live drag order once and restores the pre-drag draft on cancel', async () => {
  const save = vi.fn()
  const dirty = vi.fn()
  const user = userEvent.setup()
  render(<ReorderDialog open title="Reorder units" items={items} onSave={save} onDirtyChange={dirty} />)
  expect(screen.getByText('Hidden')).toBeInTheDocument()
  act(() => drag.handlers.onDragStart({ active: { id: '93' } }))
  act(() => drag.handlers.onDragOver({ active: { id: '93' }, over: { id: '71' } }))
  act(() => drag.handlers.onDragEnd({ active: { id: '93' }, over: { id: '71' } }))
  await user.click(screen.getByRole('button', { name: 'Save order' }))
  expect(save).toHaveBeenLastCalledWith([93, 71, 82])
  expect(dirty).toHaveBeenLastCalledWith(true)

  act(() => drag.handlers.onDragStart({ active: { id: '82' } }))
  act(() => drag.handlers.onDragOver({ active: { id: '82' }, over: { id: '93' } }))
  act(() => drag.handlers.onDragCancel())
  await user.click(screen.getByRole('button', { name: 'Save order' }))
  expect(save).toHaveBeenLastCalledWith([93, 71, 82])
})

it('keeps a button draft on save failure and disables resubmission of a stale draft', async () => {
  const user = userEvent.setup()
  const save = vi.fn()
  const { rerender } = render(<ReorderDialog open title="Reorder units" items={items} onSave={save} />)
  await user.click(screen.getByRole('button', { name: 'Move Second up' }))
  rerender(<ReorderDialog open title="Reorder units" items={items} onSave={save} error="Network unavailable" />)
  await user.click(screen.getByRole('button', { name: 'Save order' }))
  expect(save).toHaveBeenCalledWith([82, 71, 93])
  rerender(<ReorderDialog open title="Reorder units" items={items} onSave={save} stale />)
  expect(screen.getByRole('button', { name: 'Save order' })).toBeDisabled()
})
