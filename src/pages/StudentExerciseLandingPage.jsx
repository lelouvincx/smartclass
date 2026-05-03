import React, { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { CheckCircle, Clock } from 'lucide-react'
import { createSubmission, getExercise, getSubmission, listMySubmissions } from '@/lib/api'
import { useAuth } from '@/lib/auth-context'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'

export default function StudentExerciseLandingPage() {
  const { id } = useParams()
  const { token } = useAuth()
  const navigate = useNavigate()

  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState('')
  const [exercise, setExercise] = useState(null)
  const [questionCount, setQuestionCount] = useState(0)
  const [hasResumable, setHasResumable] = useState(false)
  const [submittedSubmissionId, setSubmittedSubmissionId] = useState(null)
  const [isStarting, setIsStarting] = useState(false)

  useEffect(() => {
    async function load() {
      setIsLoading(true)
      setError('')
      try {
        const res = await getExercise(id, token)
        const ex = res.data
        setExercise(ex)

        const uniqueQIds = new Set((ex.schema || []).map((r) => r.q_id))
        setQuestionCount(uniqueQIds.size)

        const savedSubId = sessionStorage.getItem(`submission_${id}`)
        let resumable = false
        if (savedSubId) {
          try {
            const subRes = await getSubmission(token, savedSubId)
            if (subRes.data && !subRes.data.submitted_at) {
              setHasResumable(true)
              resumable = true
            } else {
              sessionStorage.removeItem(`submission_${id}`)
            }
          } catch {
            sessionStorage.removeItem(`submission_${id}`)
          }
        }

        if (!resumable) {
          try {
            const subsRes = await listMySubmissions(token, { exerciseId: id, limit: 1 })
            const latest = subsRes.data?.submissions?.[0]
            if (latest?.submitted_at) {
              setSubmittedSubmissionId(latest.id)
            }
          } catch {
            // best effort — ignore if submissions check fails
          }
        }
      } catch (err) {
        setError(err.message)
      } finally {
        setIsLoading(false)
      }
    }
    load()
  }, [id, token])

  async function handleStart() {
    setIsStarting(true)
    try {
      const subRes = await createSubmission(token, { exercise_id: Number(id) })
      sessionStorage.setItem(`submission_${id}`, String(subRes.data.id))
      navigate(`/student/exercises/${id}/take`)
    } catch (err) {
      setError(err.message)
      setIsStarting(false)
    }
  }

  function handleResume() {
    navigate(`/student/exercises/${id}/take`)
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <p className="text-sm text-muted-foreground">Loading exercise...</p>
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

  return (
    <div className="max-w-2xl space-y-6">
      <Card>
        <CardContent className="space-y-6 pt-6">
          <h1 className="text-2xl font-semibold">{exercise.title}</h1>

          <div className="flex flex-wrap items-center gap-4 text-sm">
            {exercise.is_timed ? (
              <>
                <Badge>Timed</Badge>
                <span className="flex items-center gap-1 text-muted-foreground">
                  <Clock className="h-4 w-4" />
                  {exercise.duration_minutes} min
                </span>
              </>
            ) : (
              <Badge variant="secondary">Untimed</Badge>
            )}
            <span className="text-muted-foreground">
              {questionCount} question{questionCount !== 1 ? 's' : ''}
            </span>
          </div>

          {submittedSubmissionId ? (
            <div className="space-y-4">
              <div className="flex items-center gap-2 rounded-lg bg-success/10 px-4 py-3 text-sm text-success">
                <CheckCircle className="h-5 w-5 shrink-0" />
                You have already submitted this exercise.
              </div>
              <div className="flex gap-3">
                <Button asChild>
                  <Link to={`/student/submissions/${submittedSubmissionId}/summary`}>View result</Link>
                </Button>
                <Button variant="ghost" asChild>
                  <Link to="/student/exercises">Back</Link>
                </Button>
              </div>
            </div>
          ) : (
            <div className="flex gap-3">
              {hasResumable ? (
                <>
                  <Button onClick={handleResume}>Resume</Button>
                  <Button variant="outline" onClick={handleStart} disabled={isStarting}>
                    {isStarting ? 'Starting...' : 'Start new'}
                  </Button>
                </>
              ) : (
                <Button onClick={handleStart} disabled={isStarting}>
                  {isStarting ? 'Starting...' : 'Start'}
                </Button>
              )}
              <Button variant="ghost" asChild>
                <Link to="/student/exercises">Back</Link>
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
