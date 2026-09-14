import React from 'react'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, expect, it, vi } from 'vitest'
import i18n from '@/i18n'
import { DestinationDialog } from './DestinationDialog'

const lessons = [
  { id: 1, programme: 10, topic_title: 'Algebra', title: 'Lines' },
  { id: 2, programme: 12, topic_title: 'Calculus', title: 'Limits' },
]

beforeEach(async () => {
  Element.prototype.hasPointerCapture ??= () => false
  Element.prototype.setPointerCapture ??= () => {}
  Element.prototype.releasePointerCapture ??= () => {}
  Element.prototype.scrollIntoView ??= () => {}
  await i18n.changeLanguage('en')
})

it('propagates destination dirty state and resets when the draft matches the initial value', async () => {
  const dirty = vi.fn()
  const cancel = vi.fn()
  const user = userEvent.setup()

  render(<DestinationDialog open title="Move unit" description="Choose destination" label="Lesson" value={1} lessons={lessons} onDirtyChange={dirty} onCancel={cancel} />)

  await waitFor(() => expect(dirty).toHaveBeenLastCalledWith(false))

  await user.click(screen.getByLabelText('Lesson'))
  await user.click(await screen.findByRole('option', { name: 'Grade 12 › Calculus › Limits' }))
  await waitFor(() => expect(dirty).toHaveBeenLastCalledWith(true))

  await user.click(screen.getByLabelText('Lesson'))
  await user.click(await screen.findByRole('option', { name: 'Grade 10 › Algebra › Lines' }))
  await waitFor(() => expect(dirty).toHaveBeenLastCalledWith(false))

  await user.click(screen.getByRole('button', { name: 'Cancel' }))
  expect(cancel).toHaveBeenLastCalledWith({ dirty: false })
})
