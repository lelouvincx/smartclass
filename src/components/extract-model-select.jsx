import React, { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { getExtractModels } from '@/lib/api'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

// Sentinel used by Select to mean "use server default" (Radix Select disallows
// the empty string as a value).
const DEFAULT_SENTINEL = '__default__'

/**
 * Teacher-facing picker for the per-exercise vision-LLM extract model.
 *
 * Props:
 *   value      — string | null  — current extract_model (null = use default)
 *   onChange   — (id|null) => void
 *   disabled   — boolean
 *   labelHint  — optional secondary text shown next to the label
 *
 * Loads the allowlist from `GET /api/extract-models`. Shows a hint of which
 * model is the server default. The "Use default" option clears the field.
 */
export default function ExtractModelSelect({ value, onChange, disabled = false, labelHint }) {
  const { t } = useTranslation()
  const [models, setModels] = useState([])
  const [loadError, setLoadError] = useState('')

  useEffect(() => {
    let cancelled = false
    getExtractModels()
      .then((res) => {
        if (cancelled) return
        setModels(res.data?.models || [])
      })
      .catch((err) => {
        if (cancelled) return
        setLoadError(t('teacher.model.loadError'))
      })
    return () => {
      cancelled = true
    }
  }, [t])

  const selectValue = value == null ? DEFAULT_SENTINEL : value

  function handleChange(next) {
    onChange(next === DEFAULT_SENTINEL ? null : next)
  }

  return (
    <div className="space-y-1.5">
      <Label htmlFor="extract-model">
        {t('teacher.model.label')}
        {labelHint && <span className="ml-2 text-xs font-normal text-muted-foreground">{labelHint}</span>}
      </Label>
      <Select value={selectValue} onValueChange={handleChange} disabled={disabled}>
        <SelectTrigger id="extract-model" aria-label={t('teacher.model.label')} className="w-full">
          <SelectValue placeholder={t('teacher.model.loading')} />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={DEFAULT_SENTINEL}>
            {t('teacher.model.recommended')}
          </SelectItem>
          {models.map((m) => (
            <SelectItem key={m.id} value={m.id}>
              {m.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <p className="text-xs text-muted-foreground">
        {t('teacher.model.description')}
      </p>
      {loadError && <p className="text-xs text-destructive">{loadError}</p>}
    </div>
  )
}
