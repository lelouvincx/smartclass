import React from 'react'
import { render, screen } from '@testing-library/react'
import { GuestCostVolumeChart } from './guest-cost-volume-chart'

function renderChart(data) {
  return render(<GuestCostVolumeChart data={data} formatTick={value => new Intl.NumberFormat('en').format(value)} />)
}

describe('GuestCostVolumeChart', () => {
  it('renders zero-valued data without invalid SVG dimensions', () => {
    const { container } = renderChart([
      { metric: 'Requests', units: 0 },
      { metric: 'Image reads', units: 0 },
      { metric: 'PDF reads', units: 0 },
    ])

    expect(screen.getByText('Requests')).toBeInTheDocument()
    expect(container.innerHTML).not.toMatch(/NaN|Infinity/)
  })

  it('renders high-skew data without a minimum-width distortion', () => {
    const { container } = renderChart([
      { metric: 'Requests', units: 1000 },
      { metric: 'Image reads', units: 1 },
      { metric: 'PDF reads', units: 0 },
    ])

    expect(container.querySelector('[data-testid="guest-cost-volume-bar-0"]')).toHaveStyle({ width: '100%' })
    expect(container.querySelector('[data-testid="guest-cost-volume-bar-1"]')).toHaveStyle({ width: '0.1%' })
    expect(container.querySelector('[data-testid="guest-cost-volume-bar-2"]')).toHaveStyle({ width: '0%' })
    expect(container.innerHTML).not.toMatch(/NaN|Infinity/)
  })
})
