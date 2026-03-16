/**
 * Shared read-only answer result components.
 *
 * Used by:
 *   - StudentTakeExercisePage: post-submit view (no correctAnswer shown)
 *   - StudentReviewPage:       full review (correctAnswer shown)
 */

import React from 'react'

// --- Utility ---

export function CorrectnessIcon({ isCorrect }) {
  if (isCorrect === 1) {
    return <span aria-label="correct" className="font-bold text-success">✓</span>
  }
  if (isCorrect === 0) {
    return <span aria-label="wrong" className="font-bold text-destructive">✗</span>
  }
  return null
}

export function BooleanAnswerBadge({ value }) {
  if (value === '1') {
    return (
      <span className="rounded px-1.5 py-0.5 text-xs font-semibold bg-success/15 text-success">
        True
      </span>
    )
  }
  if (value === '0') {
    return (
      <span className="rounded px-1.5 py-0.5 text-xs font-semibold bg-destructive/15 text-destructive">
        False
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
  const display = answer !== '' && answer !== null && answer !== undefined ? answer : '—'
  const isCorrect = answer !== null && answer !== undefined ? question.is_correct : null

  return (
    <tr className="border-t">
      <td className="px-4 py-3 text-sm text-muted-foreground">Q{question.q_id}</td>
      <td className="px-4 py-3 text-sm font-medium">{display}</td>
      {correctAnswer !== undefined && (
        <td className="px-4 py-3 text-sm text-muted-foreground">{correctAnswer ?? '—'}</td>
      )}
      <td className="px-4 py-3 text-center">
        <CorrectnessIcon isCorrect={isCorrect} />
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
  return (
    <>
      {group.subRows.map(({ sub_id }) => {
        const ans = submittedAnswers.find((a) => a.q_id === group.q_id && a.sub_id === sub_id)
        const raw = ans ? ans.submitted_answer : null
        const correctRow = schemaAnswers?.find((a) => a.q_id === group.q_id && a.sub_id === sub_id)

        return (
          <tr key={sub_id} className="border-t">
            <td className="px-4 py-3 text-sm text-muted-foreground">Q{group.q_id}{sub_id}</td>
            <td className="px-4 py-3 text-sm font-medium">
              <BooleanAnswerBadge value={raw} />
            </td>
            {schemaAnswers !== undefined && (
              <td className="px-4 py-3 text-sm text-muted-foreground">
                <BooleanAnswerBadge value={correctRow?.correct_answer} />
              </td>
            )}
            <td className="px-4 py-3 text-center">
              <CorrectnessIcon isCorrect={ans ? ans.is_correct : null} />
            </td>
          </tr>
        )
      })}
    </>
  )
}
