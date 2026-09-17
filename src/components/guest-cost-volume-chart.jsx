import React from 'react'

function toChartNumber(value) {
  const number = Number(value)
  return Number.isFinite(number) && number > 0 ? number : 0
}

export function GuestCostVolumeChart({ data, formatTick }) {
  const rows = data.map(row => ({ ...row, units: toChartNumber(row.units) }))
  const maxValue = Math.max(0, ...rows.map(row => row.units))
  const scaleDenominator = maxValue || 1

  return (
    <div className="space-y-3 text-sm" role="presentation">
      {rows.map((row, index) => {
        const barWidth = (row.units / scaleDenominator) * 100
        return (
          <div key={row.metric} className="grid grid-cols-[6.75rem_minmax(0,1fr)_3.5rem] items-center gap-3 sm:grid-cols-[8rem_minmax(0,1fr)_4.5rem]">
            <div className="min-w-0 font-medium leading-tight text-foreground">{row.metric}</div>
            <div className="relative h-5 overflow-hidden rounded-full bg-muted">
              <div
                data-testid={`guest-cost-volume-bar-${index}`}
                className="h-full rounded-full bg-[var(--chart-1)]"
                style={{ width: `${barWidth}%` }}
              />
            </div>
            <div className="text-right tabular-nums text-muted-foreground">{formatTick(row.units)}</div>
          </div>
        )
      })}
      <div className="grid grid-cols-[6.75rem_minmax(0,1fr)_3.5rem] gap-3 text-xs text-muted-foreground sm:grid-cols-[8rem_minmax(0,1fr)_4.5rem]">
        <span />
        <div className="flex justify-between tabular-nums">
          <span>{formatTick(0)}</span>
          <span>{formatTick(maxValue)}</span>
        </div>
        <span />
      </div>
    </div>
  )
}
