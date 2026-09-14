import React, { useState } from 'react'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import GradeDropdown from './grade-checkbox-group'
import { MATHS_GRADES } from '@/lib/grades'

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

  it('uses the supplied workspace programme choices without upgrading old all-four selections', async () => {
    const user = userEvent.setup()
    function MathsDropdown() {
      const [grades, setGrades] = useState([10, 11, 12, 'dgnl'])
      return (
        <GradeDropdown
          id="maths-grades"
          legend="Student programmes"
          value={grades}
          onChange={setGrades}
          grades={MATHS_GRADES}
        />
      )
    }
    render(<MathsDropdown />)

    const trigger = screen.getByRole('button', { name: 'Student programmes' })
    expect(trigger).toHaveTextContent('Grade 10, Grade 11, Grade 12, ĐGNL')

    await user.click(trigger)
    expect(screen.getByRole('menuitemcheckbox', { name: 'THPT' })).toHaveAttribute('aria-checked', 'false')
    await user.click(screen.getByRole('menuitemcheckbox', { name: 'All programmes' }))
    expect(trigger).toHaveTextContent('All programmes')
    expect(screen.getByRole('menuitemcheckbox', { name: 'THPT' })).toHaveAttribute('aria-checked', 'true')
  })

  it('labels THPT badges with the programme name', () => {
    render(<GradeDropdown id="badge-source" legend="Programme access" value={['thpt']} onChange={() => {}} grades={MATHS_GRADES} />)
    expect(screen.getByRole('button', { name: 'Programme access' })).toHaveTextContent('THPT')
  })
})
