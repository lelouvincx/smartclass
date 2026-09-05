import React, { useState } from 'react'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import GradeCheckboxGroup, { GradeDropdown } from './grade-checkbox-group'

function TestGroup() {
  const [grades, setGrades] = useState([10, 11, 12])
  return (
    <GradeCheckboxGroup
      id="test-grades"
      legend="Grade access"
      description="Choose every grade that can use this item."
      value={grades}
      onChange={setGrades}
    />
  )
}

describe('GradeCheckboxGroup', () => {
  it('supports all grades and multiple individual grades', async () => {
    const user = userEvent.setup()
    render(<TestGroup />)

    expect(screen.getByLabelText('All grades')).toBeChecked()
    await user.click(screen.getByLabelText('Grade 12'))
    expect(screen.getByLabelText('All grades')).not.toBeChecked()
    expect(screen.getByLabelText('Grade 10')).toBeChecked()
    expect(screen.getByLabelText('Grade 11')).toBeChecked()
    expect(screen.getByLabelText('Grade 12')).not.toBeChecked()

    await user.click(screen.getByLabelText('All grades'))
    expect(screen.getByLabelText('All grades')).toBeChecked()
    expect(screen.getByLabelText('Grade 12')).toBeChecked()
  })
})

function TestDropdown() {
  const [grades, setGrades] = useState([10, 11, 12])
  return (
    <GradeDropdown
      id="dropdown-grades"
      legend="Grade access"
      description="Choose every grade that can use this item."
      value={grades}
      onChange={setGrades}
    />
  )
}

describe('GradeDropdown', () => {
  it('shows the selection in a compact dropdown and supports multiple grades', async () => {
    const user = userEvent.setup()
    render(<TestDropdown />)

    const trigger = screen.getByRole('button', { name: 'Grade access' })
    expect(trigger).toHaveTextContent('All grades')

    await user.click(trigger)
    const grade12 = screen.getByRole('menuitemcheckbox', { name: 'Grade 12' })
    expect(grade12).toHaveAttribute('aria-checked', 'true')
    await user.click(grade12)

    expect(trigger).toHaveTextContent('Grade 10, Grade 11')
    expect(screen.getByRole('menuitemcheckbox', { name: 'Grade 12' })).toHaveAttribute('aria-checked', 'false')
  })
})
