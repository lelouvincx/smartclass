import React, { useState } from 'react'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import GradeDropdown from './grade-checkbox-group'

function TestDropdown() {
  const [grades, setGrades] = useState([10, 11, 12, 'dgnl'])
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
  it('shows the selection in a compact dropdown and supports multiple classes', async () => {
    const user = userEvent.setup()
    render(<TestDropdown />)

    const trigger = screen.getByRole('button', { name: 'Grade access' })
    expect(trigger).toHaveTextContent('All programmes')

    await user.click(trigger)
    const grade12 = screen.getByRole('menuitemcheckbox', { name: 'Grade 12' })
    expect(grade12).toHaveAttribute('aria-checked', 'true')
    await user.click(grade12)

    expect(trigger).toHaveTextContent('Grade 10, Grade 11, ĐGNL')
    expect(screen.getByRole('menuitemcheckbox', { name: 'Grade 12' })).toHaveAttribute('aria-checked', 'false')
    expect(screen.getByRole('menuitemcheckbox', { name: 'ĐGNL' })).toHaveAttribute('aria-checked', 'true')
  })
})
