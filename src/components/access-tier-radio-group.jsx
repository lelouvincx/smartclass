import React from 'react'
import { useTranslation } from 'react-i18next'
import { Field, FieldLabel, FieldLegend, FieldSet } from '@/components/ui/field'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'

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
      <RadioGroup
        aria-labelledby={`${id}-legend`}
        value={value}
        onValueChange={onChange}
        disabled={disabled}
        className="grid gap-2 sm:grid-cols-[repeat(auto-fit,minmax(8rem,1fr))]"
      >
        {tiers.map((tier) => (
          <FieldLabel key={tier} htmlFor={`${id}-${tier}`} className="min-h-12 cursor-pointer">
            <Field orientation="horizontal">
              <RadioGroupItem id={`${id}-${tier}`} value={tier} />
              <span>{t(`common.accessTier.${tier}`)}</span>
            </Field>
          </FieldLabel>
        ))}
      </RadioGroup>
    </FieldSet>
  )
}
