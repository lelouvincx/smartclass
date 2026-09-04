import React, { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useParams } from 'react-router-dom'
import { ArrowLeft, ArrowRight } from 'lucide-react'
import { getSubmission } from '@/lib/api'
import { useAuth } from '@/lib/auth-context'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import {
  BooleanResultGroup,
  McqNumericResultRow,
} from '@/components/answer-result'
import { QuestionImagePanel } from '@/components/question-image-panel'
import { SubmissionReviewSidebar } from '@/components/submission-review-sidebar'
import { formatDateTime } from '@/lib/format'

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
  const { t, i18n } = useTranslation()
  const { id } = useParams()
  const { token } = useAuth()
  const workspaceRef = useRef(null)
  const questionHeadingRef = useRef(null)

  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState('')
  const [submission, setSubmission] = useState(null)
  const [currentQId, setCurrentQId] = useState(null)

  useEffect(() => {
    async function fetch() {
      setIsLoading(true)
      setError('')
      try {
        const res = await getSubmission(token, id)
        setSubmission(res.data)
        setCurrentQId(groupAnswers(res.data.answers || [])[0]?.q_id ?? null)
      } catch (err) {
        setError(err.message || i18n.t('student.results.failedReview'))
      } finally {
        setIsLoading(false)
      }
    }
    fetch()
  }, [id, token])

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <p className="text-sm text-muted-foreground">{t('student.results.loadingReview')}</p>
      </div>
    )
  }

  if (error) {
    return (
      <Card className="max-w-2xl border-destructive/50">
        <CardContent className="pt-6">
          <p className="text-sm text-destructive">{error}</p>
          <Button variant="outline" asChild className="mt-4">
            <Link to="/student/submissions">{t('student.results.backToHistory')}</Link>
          </Button>
        </CardContent>
      </Card>
    )
  }

  const { exercise_title, score, submitted_at, answers = [], question_assets: questionAssets = [] } = submission

  const questionGroups = groupAnswers(answers)
  const currentIndex = questionGroups.findIndex((group) => group.q_id === currentQId)
  const currentGroup = currentIndex >= 0 ? questionGroups[currentIndex] : null
  const adjacentQIds = currentGroup
    ? [questionGroups[currentIndex - 1]?.q_id, questionGroups[currentIndex + 1]?.q_id]
        .filter((qId) => qId !== undefined)
    : []

  const correctCount = answers.filter((a) => a.is_correct === 1).length
  const totalAnswerRows = answers.length

  const submittedDate = submitted_at
    ? formatDateTime(submitted_at + (submitted_at.endsWith('Z') ? '' : 'Z'), i18n.resolvedLanguage)
    : '—'

  function handleJump(qId) {
    setCurrentQId(qId)
    workspaceRef.current?.scrollIntoView?.({ block: 'start' })
    questionHeadingRef.current?.focus({ preventScroll: true })
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">{exercise_title}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{t('student.results.submitted', { date: submittedDate })}</p>
        </div>
        <div className="flex items-center gap-3">
          <ScoreBadge score={score} />
          <Button variant="outline" size="sm" asChild>
            <Link to="/student/submissions">{t('student.results.backToHistory')}</Link>
          </Button>
        </div>
      </div>

      {currentGroup && (
        <div
          ref={workspaceRef}
          className="grid scroll-mt-20 gap-4 lg:grid-cols-[minmax(0,3fr)_minmax(20rem,2fr)] lg:items-start"
        >
          <Card className="lg:sticky lg:top-20">
            <CardContent className="space-y-4 pt-5">
              <div className="flex items-baseline justify-between gap-3">
                <h2
                  ref={questionHeadingRef}
                  tabIndex={-1}
                  className="text-lg font-semibold outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  aria-live="polite"
                >
                  {t('student.results.questionHeading', { id: currentGroup.q_id })}
                </h2>
                <span className="shrink-0 text-xs text-muted-foreground">
                  {t('student.take.questionProgress', { current: currentIndex + 1, total: questionGroups.length })}
                </span>
              </div>
              <QuestionImagePanel
                token={token}
                assets={questionAssets}
                currentQId={currentGroup.q_id}
                adjacentQIds={adjacentQIds}
              />
            </CardContent>
          </Card>

          <div className="space-y-4">
            <Card>
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <table className="min-w-full border-collapse text-sm">
                    <thead className="bg-muted text-left text-muted-foreground">
                      <tr>
                        <th className="px-4 py-2">{t('student.exercises.questions')}</th>
                        <th className="px-4 py-2">{t('student.results.yourAnswer')}</th>
                        <th className="px-4 py-2">{t('student.results.correctAnswer')}</th>
                        <th className="px-4 py-2 text-center">{t('student.results.result')}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {currentGroup.type === 'boolean' ? (
                        <BooleanResultGroup
                          group={currentGroup}
                          submittedAnswers={answers}
                          schemaAnswers={answers}
                        />
                      ) : (
                        <McqNumericResultRow
                          question={{ ...currentGroup, is_correct: currentGroup.is_correct ?? null }}
                          answer={currentGroup.submitted_answer ?? null}
                          correctAnswer={currentGroup.correct_answer}
                        />
                      )}
                    </tbody>
                  </table>
                </div>
                <div className="flex items-center justify-between border-t p-4">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => handleJump(questionGroups[currentIndex - 1].q_id)}
                    disabled={currentIndex === 0}
                  >
                    <ArrowLeft aria-hidden="true" />
                    {t('student.take.previous')}
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => handleJump(questionGroups[currentIndex + 1].q_id)}
                    disabled={currentIndex === questionGroups.length - 1}
                  >
                    {t('student.take.next')}
                    <ArrowRight aria-hidden="true" />
                  </Button>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="pt-5">
                <SubmissionReviewSidebar
                  submission={submission}
                  currentQId={currentQId}
                  onJump={handleJump}
                />
              </CardContent>
            </Card>
          </div>
        </div>
      )}

      <p className="text-sm text-muted-foreground">
        {t('student.results.answerRowsCorrect', { correct: correctCount, total: totalAnswerRows })}
      </p>
    </div>
  )
}
