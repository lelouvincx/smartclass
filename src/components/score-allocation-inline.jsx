import React, { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { AlertTriangle } from '@/components/material-symbol'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import {
  distributeEqualPoints,
  distributeTypeProportions,
  formatHundredths,
  parsePointsToHundredths,
  relativeWeight,
  scoreQuestions,
  validateCustomAllocation,
} from '@/lib/score-allocation'

function questionName(question, t) {
  return question.sectionTitle
    ? t('teacher.scoreAllocation.questionInSection', {
      section: question.sectionTitle,
      number: question.localNumber,
    })
    : t('teacher.scoreAllocation.question', { number: question.localNumber })
}

function errorMessage(code, t) {
  return t(`teacher.scoreAllocation.errors.${code}`)
}

const ScoreAllocationInline = forwardRef(function ScoreAllocationInline({
  rows,
  mode,
  onModeChange,
  values,
  onValuesChange,
  children,
  readOnly = false,
}, ref) {
  const { t } = useTranslation()
  const questions = useMemo(() => scoreQuestions(rows), [rows])
  const questionsById = useMemo(
    () => new Map(questions.map(question => [question.qId, question])),
    [questions],
  )
  const [fieldErrors, setFieldErrors] = useState({})
  const [showErrorSummary, setShowErrorSummary] = useState(false)
  const summaryRef = useRef(null)
  const customUnavailable = questions.length > 1000
  const validation = useMemo(
    () => validateCustomAllocation(rows, values),
    [rows, values],
  )
  const typeDistribution = useMemo(() => distributeTypeProportions(rows), [rows])

  useEffect(() => {
    if (customUnavailable && mode === 'custom') onModeChange('automatic')
  }, [customUnavailable, mode, onModeChange])

  function setDistribution(distribution) {
    if (!distribution) return
    onValuesChange(Object.fromEntries(
      Object.entries(distribution).map(([qId, value]) => [qId, formatHundredths(value)]),
    ))
    setFieldErrors({})
    setShowErrorSummary(false)
  }

  function validate({ focus = true } = {}) {
    if (mode !== 'custom') return true
    setFieldErrors(validation.errors)
    setShowErrorSummary(!validation.valid)
    if (!validation.valid && focus) {
      requestAnimationFrame(() => summaryRef.current?.focus())
    }
    return validation.valid
  }

  useImperativeHandle(ref, () => ({ validate }), [mode, validation])

  function handleModeChange(nextMode) {
    if (nextMode === 'custom' && Object.keys(values || {}).length === 0) {
      setDistribution(distributeEqualPoints(rows))
    }
    setFieldErrors({})
    setShowErrorSummary(false)
    onModeChange(nextMode)
  }

  function updateValue(qId, value) {
    onValuesChange({ ...values, [qId]: value })
    setFieldErrors(current => {
      const next = { ...current }
      delete next[qId]
      return next
    })
    setShowErrorSummary(false)
  }

  function validateField(question) {
    const raw = String(values?.[question.qId] ?? '').trim()
    const parsed = parsePointsToHundredths(raw)
    const code = !raw ? 'required' : parsed === null ? 'decimal' : parsed < 1 || parsed > 1000 ? 'range' : null
    if (!code && raw !== formatHundredths(parsed)) {
      onValuesChange({ ...values, [question.qId]: formatHundredths(parsed) })
    }
    setFieldErrors(current => {
      const next = { ...current }
      if (code) next[question.qId] = code
      else delete next[question.qId]
      return next
    })
  }

  const summaryText = mode === 'automatic'
    ? t('teacher.scoreAllocation.automaticSummary')
    : validation.totalHundredths === 1000 && validation.valid
      ? t('teacher.scoreAllocation.allocated')
      : validation.totalHundredths < 1000
        ? t('teacher.scoreAllocation.remaining', {
          points: formatHundredths(1000 - validation.totalHundredths),
        })
        : t('teacher.scoreAllocation.over', {
          points: formatHundredths(validation.totalHundredths - 1000),
        })

  function questionControl(qId) {
    const question = questionsById.get(Number(qId))
    if (!question) return null
    const name = questionName(question, t)
    const error = fieldErrors[question.qId]
    const fixedPoints = values?.[question.qId]
      ?? formatHundredths((rows || []).find(row => Number(row.q_id) === question.qId)?.max_score_hundredths ?? 0)
    return (
      <section className="rounded-lg border bg-muted/10 p-3" aria-label={t('teacher.scoreAllocation.title')}>
        <div className="mb-2 flex items-center justify-between gap-3">
          <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{t('teacher.scoreAllocation.shortTitle')}</h4>
          <span className="text-xs text-muted-foreground">
            {t(`teacher.scoreAllocation.types.${question.type}`)}
          </span>
        </div>
        {mode === 'automatic' ? (
          <p className="text-sm font-semibold tabular-nums">
            {t('teacher.scoreAllocation.weightShort')}: {relativeWeight(question.type).toFixed(2)}
          </p>
        ) : readOnly ? (
          <p className="text-sm font-semibold tabular-nums">
            {fixedPoints} {t('teacher.scoreAllocation.pointsShort')}
          </p>
        ) : (
          <div className="space-y-1.5">
            <Label htmlFor={`score-allocation-${question.qId}`}>
              {t('teacher.scoreAllocation.pointsFor', { question: name })}
            </Label>
            <Input
              id={`score-allocation-${question.qId}`}
              type="text"
              inputMode="decimal"
              value={values?.[question.qId] ?? ''}
              onChange={event => updateValue(question.qId, event.target.value)}
              onBlur={() => validateField(question)}
              aria-invalid={error ? 'true' : undefined}
              aria-describedby={error ? `score-allocation-error-${question.qId}` : undefined}
              className="max-w-32 tabular-nums"
            />
            {error && (
              <p id={`score-allocation-error-${question.qId}`} className="text-xs text-destructive">
                {errorMessage(error, t)}
              </p>
            )}
          </div>
        )}
      </section>
    )
  }

  const controls = (
    <section className="space-y-4 rounded-lg border bg-muted/20 p-4" aria-label={t('teacher.scoreAllocation.title')}>
      <div>
        <h3 className="font-semibold">{t('teacher.scoreAllocation.title')}</h3>
        <p className="mt-1 max-w-[70ch] text-sm text-muted-foreground">
          {t('teacher.scoreAllocation.description')}
        </p>
      </div>
      <RadioGroup
        value={mode}
        onValueChange={handleModeChange}
        aria-label={t('teacher.scoreAllocation.title')}
        className="grid gap-2 md:grid-cols-2"
      >
        <Label htmlFor="score-mode-automatic" className="flex min-h-12 cursor-pointer items-center gap-3 rounded-[var(--sc-component-control-shape)] border bg-background p-3 has-data-checked:border-primary has-data-checked:bg-primary/5">
          <RadioGroupItem id="score-mode-automatic" value="automatic" />
          <span>{t('teacher.scoreAllocation.automatic')}</span>
        </Label>
        <Label htmlFor="score-mode-custom" className="flex min-h-12 cursor-pointer items-center gap-3 rounded-[var(--sc-component-control-shape)] border bg-background p-3 has-data-checked:border-primary has-data-checked:bg-primary/5 has-data-disabled:cursor-not-allowed has-data-disabled:opacity-50">
          <RadioGroupItem id="score-mode-custom" value="custom" disabled={customUnavailable} />
          <span>{t('teacher.scoreAllocation.custom')}</span>
        </Label>
      </RadioGroup>
      {customUnavailable && (
        <p className="text-sm text-muted-foreground">{t('teacher.scoreAllocation.customUnavailable')}</p>
      )}
      <div
        ref={summaryRef}
        tabIndex="-1"
        role={showErrorSummary ? 'alert' : undefined}
        aria-label={showErrorSummary ? t('teacher.scoreAllocation.fixErrors') : undefined}
        className="focus:rounded-lg focus:outline-none focus:ring-3 focus:ring-ring/50"
      >
        {showErrorSummary && (
          <div className="rounded-lg border border-destructive/50 bg-destructive/5 p-4 text-destructive">
            <div className="flex gap-2">
              <AlertTriangle aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
              <div>
                <p className="font-medium">{t('teacher.scoreAllocation.fixErrors')}</p>
                <ul className="mt-2 list-disc space-y-1 pl-5 text-sm">
                  {questions.filter(question => validation.errors[question.qId]).map(question => (
                    <li key={question.qId}>
                      <a className="underline underline-offset-4" href={`#score-allocation-${question.qId}`}>
                        {questionName(question, t)}: {errorMessage(validation.errors[question.qId], t)}
                      </a>
                    </li>
                  ))}
                  {Object.keys(validation.errors).length === 0 && (
                    <li>
                      <a className="underline underline-offset-4" href={`#score-allocation-${questions[0]?.qId}`}>
                        {t('teacher.scoreAllocation.totalError')}
                      </a>
                    </li>
                  )}
                </ul>
              </div>
            </div>
          </div>
        )}
      </div>
      {mode === 'custom' && (
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="outline" onClick={() => setDistribution(typeDistribution)} disabled={!typeDistribution}>
            {t('teacher.scoreAllocation.useTypeProportions')}
          </Button>
          <Button type="button" variant="outline" onClick={() => setDistribution(distributeEqualPoints(rows))}>
            {t('teacher.scoreAllocation.useEqualPoints')}
          </Button>
          {!typeDistribution && (
            <p className="w-full text-xs text-muted-foreground">{t('teacher.scoreAllocation.typeUnavailable')}</p>
          )}
        </div>
      )}
      <p aria-live="polite" className="rounded-lg bg-background px-4 py-3 font-medium tabular-nums">
        {summaryText}
      </p>
    </section>
  )

  return children({ controls, questionControl })
})

export default ScoreAllocationInline
