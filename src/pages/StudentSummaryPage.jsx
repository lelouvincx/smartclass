import React, { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { getSubmission } from '@/lib/api'
import { useAuth } from '@/lib/auth-context'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'

function formatTimeTaken(started_at, submitted_at) {
  if (!started_at || !submitted_at) return '—'
  const start = new Date(started_at.endsWith('Z') ? started_at : started_at + 'Z')
  const end = new Date(submitted_at.endsWith('Z') ? submitted_at : submitted_at + 'Z')
  const secs = Math.round((end - start) / 1000)
  const m = Math.floor(secs / 60)
  const s = secs % 60
  return `${m}:${String(s).padStart(2, '0')}`
}

export default function StudentSummaryPage() {
  const { id } = useParams()
  const { token } = useAuth()

  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState('')
  const [submission, setSubmission] = useState(null)

  useEffect(() => {
    async function load() {
      setIsLoading(true)
      setError('')
      try {
        const res = await getSubmission(token, id)
        setSubmission(res.data)
      } catch (err) {
        setError(err.message || 'Failed to load summary')
      } finally {
        setIsLoading(false)
      }
    }
    load()
  }, [id, token])

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <p className="text-sm text-muted-foreground">Loading summary...</p>
      </div>
    )
  }

  if (error) {
    return (
      <Card className="max-w-2xl border-destructive/50">
        <CardContent className="pt-6">
          <p className="text-sm text-destructive">{error}</p>
          <Button variant="outline" asChild className="mt-4">
            <Link to="/student/exercises">Back to Exercises</Link>
          </Button>
        </CardContent>
      </Card>
    )
  }

  const { exercise_title, score, submitted_at, started_at, answers = [] } = submission

  const counts = answers.reduce(
    (acc, a) => {
      if (a.submitted_answer == null) acc.skipped++
      else if (a.is_correct === 1) acc.correct++
      else acc.incorrect++
      return acc
    },
    { correct: 0, incorrect: 0, skipped: 0 },
  )

  const timeTaken = formatTimeTaken(started_at, submitted_at)

  const submittedDate = submitted_at
    ? new Date(submitted_at + (submitted_at.endsWith('Z') ? '' : 'Z')).toLocaleString()
    : '—'

  const scoreColor =
    score === null || score === undefined
      ? 'text-foreground'
      : score >= 7
      ? 'text-green-600 dark:text-green-400'
      : score >= 4
      ? 'text-yellow-600 dark:text-yellow-400'
      : 'text-destructive'

  return (
    <div className="max-w-2xl space-y-6">
      <Card>
        <CardContent className="space-y-6 pt-6">
          <div>
            <h1 className="text-2xl font-semibold">{exercise_title}</h1>
            <p className="mt-1 text-sm text-muted-foreground">Submitted {submittedDate}</p>
          </div>

          {score !== null && score !== undefined && (
            <div className="py-4 text-center">
              <p className={`text-6xl font-bold tabular-nums ${scoreColor}`}>{score}</p>
              <p className="mt-1 text-sm text-muted-foreground">/ 10</p>
            </div>
          )}

          <div className="flex justify-around rounded-lg border p-4">
            <div className="flex flex-col items-center gap-1">
              <span aria-label="correct count" className="text-2xl font-bold text-success">
                {counts.correct}
              </span>
              <span className="text-xs text-muted-foreground">Correct</span>
            </div>
            <div className="flex flex-col items-center gap-1">
              <span aria-label="incorrect count" className="text-2xl font-bold text-destructive">
                {counts.incorrect}
              </span>
              <span className="text-xs text-muted-foreground">Incorrect</span>
            </div>
            <div className="flex flex-col items-center gap-1">
              <span aria-label="skipped count" className="text-2xl font-bold text-muted-foreground">
                {counts.skipped}
              </span>
              <span className="text-xs text-muted-foreground">Skipped</span>
            </div>
          </div>

          <p className="text-sm text-muted-foreground">
            Time taken:{' '}
            <span className="font-medium text-foreground">{timeTaken}</span>
          </p>

          <div className="flex gap-3">
            <Button asChild>
              <Link to={`/student/submissions/${id}/review`}>View detailed results</Link>
            </Button>
            <Button variant="outline" asChild>
              <Link to="/student/exercises">Back to Exercises</Link>
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
