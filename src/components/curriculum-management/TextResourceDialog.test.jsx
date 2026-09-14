import React from 'react'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, expect, it, vi } from 'vitest'
import i18n from '@/i18n'
import { TextResourceDialog } from './TextResourceDialog'

beforeEach(async () => {
  await i18n.changeLanguage('en')
})

it('propagates topic title dirty state and resets when the draft matches the initial resource', async () => {
  const dirty = vi.fn()
  const cancel = vi.fn()
  const user = userEvent.setup()

  render(<TextResourceDialog open mode="edit-topic" resource={{ id: 12, title: 'Original topic', programme: 10 }} onDirtyChange={dirty} onCancel={cancel} />)

  await waitFor(() => expect(dirty).toHaveBeenLastCalledWith(false))

  await user.clear(screen.getByLabelText('Title'))
  await user.type(screen.getByLabelText('Title'), 'Updated topic')
  await waitFor(() => expect(dirty).toHaveBeenLastCalledWith(true))

  await user.clear(screen.getByLabelText('Title'))
  await user.type(screen.getByLabelText('Title'), 'Original topic')
  await waitFor(() => expect(dirty).toHaveBeenLastCalledWith(false))

  await user.click(screen.getByRole('button', { name: 'Cancel' }))
  expect(cancel).toHaveBeenLastCalledWith({ dirty: false })
})
