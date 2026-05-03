import React, { useEffect, useRef, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { getFileUrl, getSubmission } from '@/lib/api'
import { useAuth } from '@/lib/auth-context'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { PdfSplitPane } from '@/components/pdf-split-pane'
import {
  BooleanResultGroup,
  McqNumericResultRow,
} from '@/components/answer-result'
import { SubmissionReviewSidebar } from '@/components/submission-review-sidebar'

// --- Schema grouping (mirrors StudentTakeExercisePage) ---

function groupAnswers(answers) {
  const groups = []
  const seen = new Map()

  for (const row of answers) {
    if (row.type === 'boolean') {
      if (!seen.has(row.q_id)) {
        const group = { q_id: row.q_id, type: 'boolean', subRows: [] }
        groups.push(group)
        seen.set(row.q_id, group)
      }
      seen.get(row.q_id).subRows.push(row)
    } else {
      if (!seen.has(row.q_id)) {
        groups.push({ q_id: row.q_id, type: row.type, sub_id: null, ...row })
        seen.set(row.q_id, true)
      }
    }
  }

  return groups
}

// --- Score badge (same thresholds as submissions history page) ---

function ScoreBadge({ score }) {
  if (score === null || score === undefined) return null

  const colorClass =
    score >= 7 ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400' :
    score >= 4 ? 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400' :
    'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400'

  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${colorClass}`}>
      {score} / 10
    </span>
  )
}

// --- Main page ---

export default function StudentReviewPage() {
  const { id } = useParams()
  const { token } = useAuth()
  const questionRefs = useRef({})

  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState('')
  const [submission, setSubmission] = useState(null)

  useEffect(() => {
    async function fetch() {
      setIsLoading(true)
      setError('')
      try {
        const res = await getSubmission(token, id)
        setSubmission(res.data)
      } catch (err) {
        setError(err.message || 'Failed to load submission')
      } finally {
        setIsLoading(false)
      }
    }
    fetch()
  }, [id, token])

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <p className="text-sm text-muted-foreground">Loading review...</p>
      </div>
    )
  }

  if (error) {
    return (
      <Card className="max-w-2xl border-destructive/50">
        <CardContent className="pt-6">
          <p className="text-sm text-destructive">{error}</p>
          <Button variant="outline" asChild className="mt-4">
            <Link to="/student/submissions">Back to History</Link>
          </Button>
        </CardContent>
      </Card>
    )
  }

  const { exercise_title, score, submitted_at, files = [], answers = [] } = submission

  const pdfFile = files.find((f) => f.file_type === 'exercise_pdf')
  const pdfUrl = pdfFile ? getFileUrl(pdfFile.id) : null

  const questionGroups = groupAnswers(answers)

  const correctCount = answers.filter((a) => a.is_correct === 1).length
  const totalAnswerRows = answers.length

  const submittedDate = submitted_at
    ? new Date(submitted_at + (submitted_at.endsWith('Z') ? '' : 'Z')).toLocaleString()
    : '—'

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">{exercise_title}</h1>
          <p className="mt-1 text-sm text-muted-foreground">Submitted {submittedDate}</p>
        </div>
        <div className="flex items-center gap-3">
          <ScoreBadge score={score} />
          <Button variant="outline" size="sm" asChild>
            <Link to="/student/submissions">Back to History</Link>
          </Button>
        </div>
      </div>

      {/* Two-column layout: review content + sidebar */}
      <div className="lg:grid lg:grid-cols-[1fr_320px] lg:items-start lg:gap-6">
        {/* Left: PDF + review table */}
        <PdfSplitPane fileUrl={pdfUrl}>
          <div className="space-y-4">
            <Card>
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <table className="min-w-full border-collapse text-sm">
                    <thead className="bg-muted text-left text-muted-foreground">
                      <tr>
                        <th className="px-4 py-2">Question</th>
                        <th className="px-4 py-2">Your Answer</th>
                        <th className="px-4 py-2">Correct Answer</th>
                        <th className="px-4 py-2 text-center">Result</th>
                      </tr>
                    </thead>
                    {questionGroups.map((group) => {
                      const ans = group.type !== 'boolean'
                        ? answers.find((a) => a.q_id === group.q_id && !a.sub_id)
                        : null
                      return (
                        <tbody
                          key={group.q_id}
                          ref={(el) => { questionRefs.current[group.q_id] = el }}
                        >
                          {group.type === 'boolean' ? (
                            <BooleanResultGroup
                              group={group}
                              submittedAnswers={answers}
                              schemaAnswers={answers}
                            />
                          ) : (
                            <McqNumericResultRow
                              question={{ ...group, is_correct: ans?.is_correct ?? null }}
                              answer={ans?.submitted_answer ?? null}
                              correctAnswer={ans?.correct_answer}
                            />
                          )}
                        </tbody>
                      )
                    })}
                  </table>
                </div>
              </CardContent>
            </Card>

            <p className="text-sm text-muted-foreground">
              {correctCount} / {totalAnswerRows} answer rows correct
            </p>
          </div>
        </PdfSplitPane>

        {/* Right: sticky review sidebar (desktop only) */}
        <div className="hidden lg:block">
          <div className="sticky top-4">
            <Card>
              <CardContent className="pt-5">
                <SubmissionReviewSidebar submission={submission} questionRefs={questionRefs} />
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  )
}
