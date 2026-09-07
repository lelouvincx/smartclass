import React from 'react'
import { useTranslation } from 'react-i18next'
import { FieldLegend, FieldSet } from '@/components/ui/field'
import { SegmentedButton, SegmentedButtonGroup } from '@/components/ui/segmented-button'

export const STUDENT_ACCESS_TIERS = ['standard', 'vip']
export const LECTURE_ACCESS_TIERS = ['guest', ...STUDENT_ACCESS_TIERS]

export function AccessTierBadge({ tier }) {
  const { t } = useTranslation()
  return (
    <span className="inline-flex w-fit rounded-full border border-border bg-muted px-2 py-0.5 text-xs font-medium text-foreground">
      {t(`common.accessTier.${tier || 'standard'}`)}
    </span>
  )
}

export default function AccessTierRadioGroup({
  id,
  legend,
  value,
  onChange,
  tiers = STUDENT_ACCESS_TIERS,
  disabled = false,
  className,
}) {
  const { t } = useTranslation()

  return (
    <FieldSet className={className}>
      <FieldLegend id={`${id}-legend`} variant="label">{legend}</FieldLegend>
      <SegmentedButtonGroup className="grid w-full grid-cols-[repeat(auto-fit,minmax(7rem,1fr))]">
        {tiers.map((tier) => (
          <SegmentedButton
            key={tier}
            id={`${id}-${tier}`}
            selected={value === tier}
            disabled={disabled}
            onClick={() => onChange(tier)}
          >
            {t(`common.accessTier.${tier}`)}
          </SegmentedButton>
        ))}
      </SegmentedButtonGroup>
    </FieldSet>
  )
}
