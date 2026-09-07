import React, { useState } from 'react'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import AccessTierRadioGroup from './access-tier-radio-group'

function TestGroup() {
  const [tier, setTier] = useState('standard')
  return (
    <AccessTierRadioGroup
      id="test-access-tier"
      legend="Student access tier"
      value={tier}
      onChange={setTier}
    />
  )
}

describe('AccessTierRadioGroup', () => {
  it('renders subscription tiers as a segmented button group', async () => {
    const user = userEvent.setup()
    render(<TestGroup />)

    const group = screen.getByRole('group', { name: 'Student access tier' })
    const standard = screen.getByRole('button', { name: 'Standard' })
    const vip = screen.getByRole('button', { name: 'VIP' })

    expect(group.querySelector('[data-slot="segmented-button-group"]')).toBeInTheDocument()
    expect(standard).toHaveAttribute('aria-pressed', 'true')
    expect(vip).toHaveAttribute('aria-pressed', 'false')

    await user.click(vip)
    expect(vip).toHaveAttribute('aria-pressed', 'true')
    expect(standard).toHaveAttribute('aria-pressed', 'false')
  })
})
