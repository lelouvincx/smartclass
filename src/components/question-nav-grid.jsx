import React from 'react'
import { useTranslation } from 'react-i18next'
import { Check, CircleDot, Minus } from 'lucide-react'
import { cn } from '@/lib/utils'

function getCellContent(qId, schema, answers, displayIdx) {
  const subRows = schema.filter((r) => r.q_id === qId)
  const type = subRows[0]?.type
  const text = String(displayIdx)

  if (type === 'mcq') {
    const a = answers[qId]
    return { answered: !!a, text }
  }

  if (type === 'numeric') {
    const a = answers[qId]
    return { answered: !(a === '' || a == null), text }
  }

  // boolean: all sub-rows must have a non-empty answer
  const subAns = answers[qId] || {}
  const allAnswered = subRows.every((r) => subAns[r.sub_id] !== '' && subAns[r.sub_id] != null)
  return { answered: allAnswered, text }
}

export function countUnanswered(schema, answers) {
  const qIds = [...new Set(schema.map((r) => r.q_id))]
  return qIds.filter((qId, idx) => {
    const { answered } = getCellContent(qId, schema, answers, idx + 1)
    return !answered
  }).length
}

export function QuestionNavGrid({ schema, answers, currentQId, onJump }) {
  const { t } = useTranslation()
  const qIds = [...new Set(schema.map((r) => r.q_id))]
  const unansweredCount = countUnanswered(schema, answers)
  const answeredCount = qIds.length - unansweredCount
  return (
    <div>
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-1">
        <p className="text-sm font-semibold text-foreground">
          {t('student.nav.answerSheet')}
        </p>
        <p className="text-xs font-medium text-muted-foreground" aria-live="polite">
          {t('student.nav.answeredProgress', { answered: answeredCount, total: qIds.length })}
        </p>
      </div>
      <div className="grid grid-cols-5 gap-2">
        <span id="question-answered-status" className="sr-only">{t('student.nav.answered')}</span>
        <span id="question-unanswered-status" className="sr-only">{t('student.nav.unanswered')}</span>
        {qIds.map((qId, idx) => {
          const { answered, text } = getCellContent(qId, schema, answers, idx + 1)
          const isCurrent = qId === currentQId
          return (
            <button
              key={qId}
              type="button"
              aria-label={t('student.nav.jump', { number: idx + 1 })}
              aria-describedby={answered ? 'question-answered-status' : 'question-unanswered-status'}
              aria-current={isCurrent ? 'step' : undefined}
              onClick={() => onJump(qId)}
              className={cn(
                'flex min-h-[var(--sc-component-question-target)] w-full items-center justify-center rounded-[var(--sc-shape-md)] text-sm font-medium transition-[color,background-color,border-color,box-shadow] duration-[var(--sc-motion-duration-short)]',
                isCurrent && 'ring-2 ring-primary ring-offset-2 ring-offset-background',
                answered
                  ? 'bg-primary/15 text-primary'
                  : 'border border-muted-foreground/30 text-muted-foreground hover:bg-muted',
              )}
            >
              {text}
            </button>
          )
        })}
      </div>
      <div className="mt-3 flex flex-wrap gap-x-4 gap-y-2 text-xs text-muted-foreground" aria-label={t('student.nav.legend')}>
        <span className="inline-flex items-center gap-1.5">
          <CircleDot aria-hidden="true" className="h-4 w-4 text-primary" />
          {t('student.nav.current')}
        </span>
        <span className="inline-flex items-center gap-1.5">
          <Check aria-hidden="true" className="h-4 w-4 text-primary" />
          {t('student.nav.answered')}
        </span>
        <span className="inline-flex items-center gap-1.5">
          <Minus aria-hidden="true" className="h-4 w-4" />
          {t('student.nav.unanswered')}
        </span>
      </div>
    </div>
  )
}
