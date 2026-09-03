/**
 * Shared read-only answer result components.
 *
 * Used by:
 *   - StudentTakeExercisePage: post-submit view (no correctAnswer shown)
 *   - StudentReviewPage:       full review (correctAnswer shown)
 */

import React from 'react'
import { useTranslation } from 'react-i18next'

// --- Utility ---

export function computeStatus(submittedAnswer, isCorrect) {
  if (submittedAnswer === null || submittedAnswer === undefined) return 'skipped'
  if (isCorrect === 1) return 'correct'
  if (isCorrect === 0) return 'incorrect'
  return null
}

export function CorrectnessIcon({ status }) {
  const { t } = useTranslation()
  if (status === 'correct') {
    return <span aria-label={t('student.results.correct')} className="font-bold text-success">✓</span>
  }
  if (status === 'incorrect') {
    return <span aria-label={t('student.results.incorrect')} className="font-bold text-destructive">✗</span>
  }
  if (status === 'skipped') {
    return <span aria-label={t('student.results.skipped')} className="font-bold text-muted-foreground">−</span>
  }
  return null
}

export function BooleanAnswerBadge({ value }) {
  const { t } = useTranslation()
  if (value === '1') {
    return (
      <span className="rounded px-1.5 py-0.5 text-xs font-semibold bg-success/15 text-success">
        {t('student.results.true')}
      </span>
    )
  }
  if (value === '0') {
    return (
      <span className="rounded px-1.5 py-0.5 text-xs font-semibold bg-destructive/15 text-destructive">
        {t('student.results.false')}
      </span>
    )
  }
  return <span className="text-muted-foreground">—</span>
}

// --- Result rows for the results table ---

/**
 * A single result row for MCQ or Numeric questions.
 *
 * Props:
 *   question        — { q_id, is_correct }
 *   answer          — string|null — student's submitted answer
 *   correctAnswer   — string|null — correct answer (shown when provided)
 */
export function McqNumericResultRow({ question, answer, correctAnswer }) {
  const { t } = useTranslation()
  const display = answer !== '' && answer !== null && answer !== undefined ? answer : '—'
  const status = computeStatus(answer, question.is_correct)

  return (
    <tr className="border-t">
      <td className="px-4 py-3 text-sm text-muted-foreground">{t('student.results.questionLabel', { id: question.q_id })}</td>
      <td className="px-4 py-3 text-sm font-medium">{display}</td>
      {correctAnswer !== undefined && (
        <td className="px-4 py-3 text-sm text-muted-foreground">{correctAnswer ?? '—'}</td>
      )}
      <td className="px-4 py-3 text-center">
        <CorrectnessIcon status={status} />
      </td>
    </tr>
  )
}

/**
 * A group of boolean sub-question rows.
 *
 * Props:
 *   group           — { q_id, subRows: [{sub_id}] }
 *   submittedAnswers — array of { q_id, sub_id, submitted_answer, is_correct }
 *   schemaAnswers   — array of { q_id, sub_id, correct_answer } — optional, shown when provided
 */
export function BooleanResultGroup({ group, submittedAnswers, schemaAnswers }) {
  const { t } = useTranslation()
  return (
    <>
      {group.subRows.map(({ sub_id }) => {
        const ans = submittedAnswers.find((a) => a.q_id === group.q_id && a.sub_id === sub_id)
        const raw = ans ? ans.submitted_answer : null
        const correctRow = schemaAnswers?.find((a) => a.q_id === group.q_id && a.sub_id === sub_id)

        return (
          <tr key={sub_id} className="border-t">
            <td className="px-4 py-3 text-sm text-muted-foreground">{t('student.results.questionLabel', { id: `${group.q_id}${sub_id}` })}</td>
            <td className="px-4 py-3 text-sm font-medium">
              <BooleanAnswerBadge value={raw} />
            </td>
            {schemaAnswers !== undefined && (
              <td className="px-4 py-3 text-sm text-muted-foreground">
                <BooleanAnswerBadge value={correctRow?.correct_answer} />
              </td>
            )}
            <td className="px-4 py-3 text-center">
              <CorrectnessIcon status={computeStatus(ans?.submitted_answer, ans?.is_correct)} />
            </td>
          </tr>
        )
      })}
    </>
  )
}
