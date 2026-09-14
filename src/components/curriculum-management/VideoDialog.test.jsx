import React from 'react'
import { render, screen } from '@testing-library/react'
import { expect, it } from 'vitest'
import { VideoDialog } from './VideoDialog'

it('lets the video tier fieldset shrink without widening the mobile dialog', () => {
  render(<VideoDialog open mode="add-new" library={[]} />)

  const group = screen.getByRole('group', { name: 'Who can watch' })
  expect(group).toHaveClass('min-w-0')
  expect(screen.getByRole('button', { name: 'Standard' })).toHaveClass('whitespace-normal')
  expect(document.querySelector('#curriculum-video-form')).toHaveClass('min-w-0')
})
