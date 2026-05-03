import React from 'react'
import { computeStatus } from '@/components/answer-result'
import { MCQ_POINTS, NUMERIC_POINTS, BOOLEAN_SCORE_TABLE } from '@/lib/grading-display'

function StatusDot({ status }) {
  if (status === 'correct')
    return <span aria-label="correct" className="inline-block h-2.5 w-2.5 rounded-full bg-success" />
  if (status === 'incorrect')
    return <span aria-label="wrong" className="inline-block h-2.5 w-2.5 rounded-full bg-destructive" />
  return <span aria-label="skipped" className="inline-block h-2.5 w-2.5 rounded-full bg-muted-foreground/40" />
}

function formatTimeTaken(started_at, submitted_at) {
  if (!started_at || !submitted_at) return '—'
  const start = new Date(started_at.endsWith('Z') ? started_at : started_at + 'Z')
  const end = new Date(submitted_at.endsWith('Z') ? submitted_at : submitted_at + 'Z')
  const secs = Math.round((end - start) / 1000)
  const m = Math.floor(secs / 60)
  const s = secs % 60
  return `${m}:${String(s).padStart(2, '0')}`
}

function buildSidebarRows(answers) {
  const seen = new Map()
  const rows = []

  for (const a of answers) {
    if (!seen.has(a.q_id)) {
      if (a.type === 'boolean') {
        const entry = { q_id: a.q_id, type: 'boolean', subs: [a] }
        seen.set(a.q_id, entry)
        rows.push(entry)
      } else {
        const entry = { q_id: a.q_id, type: a.type, answer: a }
        seen.set(a.q_id, entry)
        rows.push(entry)
      }
    } else if (a.type === 'boolean') {
      seen.get(a.q_id).subs.push(a)
    }
  }

  return rows
}

function rowStatus(row) {
  if (row.type === 'boolean') {
    if (row.subs.every((s) => s.submitted_answer === null)) return 'skipped'
    return row.subs.every((s) => s.is_correct === 1) ? 'correct' : 'incorrect'
  }
  return computeStatus(row.answer.submitted_answer, row.answer.is_correct)
}

function rowChosen(row) {
  if (row.type === 'boolean') {
    if (row.subs.every((s) => s.submitted_answer === null)) return '—'
    const correctCount = row.subs.filter((s) => s.is_correct === 1).length
    return `${correctCount}/4`
  }
  const val = row.answer.submitted_answer
  if (val === null || val === undefined || val === '') return '—'
  return String(val).substring(0, 6)
}

function rowPts(row) {
  if (row.type === 'boolean') {
    const correctCount = row.subs.filter((s) => s.is_correct === 1).length
    return BOOLEAN_SCORE_TABLE[correctCount] ?? 0
  }
  if (row.type === 'numeric') {
    return row.answer.is_correct === 1 ? NUMERIC_POINTS : 0
  }
  return row.answer.is_correct === 1 ? MCQ_POINTS : 0
}

export function SubmissionReviewSidebar({ submission, questionRefs }) {
  if (!submission) return null

  const { score, submitted_at, started_at, answers = [] } = submission

  const counts = answers.reduce(
    (acc, a) => {
      if (a.submitted_answer == null) acc.skipped++
      else if (a.is_correct === 1) acc.correct++
      else acc.incorrect++
      return acc
    },
    { correct: 0, incorrect: 0, skipped: 0 },
  )

  const scoreColor =
    score === null || score === undefined
      ? 'text-foreground'
      : score >= 7
      ? 'text-green-600 dark:text-green-400'
      : score >= 4
      ? 'text-yellow-600 dark:text-yellow-400'
      : 'text-destructive'

  const timeTaken = formatTimeTaken(started_at, submitted_at)
  const submittedDate = submitted_at
    ? new Date(submitted_at + (submitted_at.endsWith('Z') ? '' : 'Z')).toLocaleString()
    : '—'

  const rows = buildSidebarRows(answers)

  return (
    <div className="space-y-4">
      {/* Score */}
      <div className="rounded-lg border bg-card p-4 text-center">
        {score !== null && score !== undefined ? (
          <>
            <p className={`text-3xl font-bold tabular-nums ${scoreColor}`}>{score}</p>
            <p className="text-sm text-muted-foreground">/ 10</p>
          </>
        ) : (
          <p className="text-sm text-muted-foreground">No score available</p>
        )}
      </div>

      {/* Time + submitted */}
      <div className="space-y-1 rounded-lg border bg-card p-3 text-xs text-muted-foreground">
        <p>
          Time taken:{' '}
          <span className="font-medium text-foreground">{timeTaken}</span>
        </p>
        <p>
          Submitted:{' '}
          <span className="font-medium text-foreground">{submittedDate}</span>
        </p>
      </div>

      {/* Counters */}
      <div className="grid grid-cols-3 gap-1 rounded-lg border bg-card p-3 text-center">
        <div className="flex flex-col items-center gap-0.5">
          <span className="text-lg font-bold text-success">{counts.correct}</span>
          <span className="text-xs text-muted-foreground">✓</span>
        </div>
        <div className="flex flex-col items-center gap-0.5">
          <span className="text-lg font-bold text-destructive">{counts.incorrect}</span>
          <span className="text-xs text-muted-foreground">✗</span>
        </div>
        <div className="flex flex-col items-center gap-0.5">
          <span className="text-lg font-bold text-muted-foreground">{counts.skipped}</span>
          <span className="text-xs text-muted-foreground">−</span>
        </div>
      </div>

      {/* Per-question table */}
      {rows.length > 0 && (
        <div>
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Questions
          </p>
          <div className="overflow-hidden rounded-lg border">
            <table className="w-full text-xs">
              <tbody>
                {rows.map((row, idx) => {
                  const status = rowStatus(row)
                  const chosen = rowChosen(row)
                  const pts = rowPts(row)
                  return (
                    <tr
                      key={row.q_id}
                      className="cursor-pointer border-t transition-colors first:border-t-0 hover:bg-muted"
                      onClick={() =>
                        questionRefs?.current?.[row.q_id]?.scrollIntoView({
                          behavior: 'smooth',
                          block: 'center',
                        })
                      }
                    >
                      <td className="px-2 py-2">
                        <StatusDot status={status} />
                      </td>
                      <td className="px-2 py-2 font-medium text-muted-foreground">{idx + 1}</td>
                      <td className="px-2 py-2 font-medium">{chosen}</td>
                      <td className="px-2 py-2 text-right text-muted-foreground">{pts}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
