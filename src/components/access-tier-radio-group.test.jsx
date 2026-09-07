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
  it('vertically centers each option in its card', async () => {
    const user = userEvent.setup()
    render(<TestGroup />)

    const standard = screen.getByLabelText('Standard')
    const vip = screen.getByLabelText('VIP')

    expect(standard.closest('[data-slot="field-label"]')).toHaveClass('justify-center')
    expect(vip.closest('[data-slot="field-label"]')).toHaveClass('justify-center')
    expect(standard.closest('[data-slot="field"]')).toHaveClass('items-center')

    await user.click(vip)
    expect(vip).toBeChecked()
    expect(standard).not.toBeChecked()
  })
})
