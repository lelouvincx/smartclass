import React, { useState } from 'react'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import GradeCheckboxGroup from './grade-checkbox-group'

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
