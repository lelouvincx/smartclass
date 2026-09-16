import React, { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { ClipboardList, Clock, RefreshCw } from '@/components/material-symbol'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Spinner } from '@/components/ui/spinner'
import { EmptyState } from '@/design-system/empty-state'
import { PageHeader } from '@/design-system/page-header'
import { formatDuration, formatTime } from '@/lib/format'
import { useAuth } from '@/lib/auth-context'
import {
  getPublicExercise,
  getPublicExercisePdf,
  getPublicQuestionAssetBlob,
  listPublicExercises,
} from '@/lib/api'
import {
  clearAllGuestExerciseData,
  countResultAnswers,
  createGuestAttempt,
  findGuestExerciseState,
  loadGuestAnswers,
  loadGuestAttempt,
  loadGuestResult,
  loadGuestSchema,
  saveGuestAnswer,
  submitGuestAttempt,
} from '@/lib/guest-exercise-db'

function usePublicAuthGuard() {
  const auth = useAuth()
  return auth.authError && !auth.user ? auth.authError : null
}

function uniqueQuestions(schema = []) {
  const map = new Map()
  for (const row of schema) {
    if (!map.has(row.q_id)) map.set(row.q_id, [])
    map.get(row.q_id).push(row)
  }
  return [...map.entries()].map(([qId, rows]) => ({ qId, rows }))
}

function answerValue(answers, row) {
  return row.type === 'boolean' ? answers[row.q_id]?.[row.sub_id] ?? '' : answers[row.q_id] ?? ''
}

function resultValue(result, row) {
  return result?.answers?.find(answer => answer.q_id === row.q_id && (answer.sub_id ?? null) === (row.sub_id ?? null))?.submitted_answer ?? ''
}

function correctLabel(row, t) {
  if (row.type === 'boolean') return row.correct_answer === '1' ? t('student.results.true') : t('student.results.false')
  return row.correct_answer
}

function secondsRemaining(attempt) {
  if (!attempt || attempt.mode !== 'timed' || !attempt.durationMinutes) return null
  const elapsedSeconds = Math.floor((Date.now() - new Date(attempt.startedAt).getTime()) / 1000)
  return (attempt.durationMinutes * 60) - elapsedSeconds
}

function formatCountdown(seconds) {
  const absolute = Math.abs(seconds)
  const minutes = Math.floor(absolute / 60)
  const remainingSeconds = absolute % 60
  return `${minutes}:${String(remainingSeconds).padStart(2, '0')}`
}

function PublicAuthError({ error }) {
  const { t } = useTranslation()
  return (
    <Card className="max-w-2xl border-destructive/50">
      <CardContent className="space-y-3 pt-6">
        <h1 className="text-xl font-semibold">{t('student.guest.authErrorTitle')}</h1>
        <p className="text-sm text-destructive">{error.message}</p>
        <p className="text-sm text-muted-foreground">{t('student.guest.authErrorDescription')}</p>
        <Button asChild><Link to="/">{t('common.signIn')}</Link></Button>
      </CardContent>
    </Card>
  )
}

export function PublicExercisesPage() {
  const { t, i18n } = useTranslation()
  const { token } = useAuth()
  const authError = usePublicAuthGuard()
  const [items, setItems] = useState([])
  const [states, setStates] = useState({})
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState('')
  const [lastRefreshed, setLastRefreshed] = useState(null)

  async function load() {
    if (authError) return
    setIsLoading(true)
    setError('')
    try {
      const response = await listPublicExercises(token)
      const exercises = response.data || []
      const nextStates = {}
      await Promise.all(exercises.map(async (exercise) => {
        try {
          const state = await findGuestExerciseState(exercise.id, exercise.question_asset_set_id)
          if (state) nextStates[exercise.id] = state
        } catch {
          // The list remains useful when local storage is unavailable.
        }
      }))
      setItems(exercises)
      setStates(nextStates)
      setLastRefreshed(new Date())
    } catch (loadError) {
      setError(loadError.message)
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => { load() }, [token, authError?.message])

  async function clearLocalData() {
    try {
      await clearAllGuestExerciseData()
      await load()
    } catch (clearError) {
      setError(clearError.message)
    }
  }

  if (authError) return <PublicAuthError error={authError} />

  return (
    <div className="space-y-6">
      <PageHeader
        title={t('student.guest.exercisesTitle')}
        description={t('student.guest.exercisesDescription')}
        actions={<>
          {lastRefreshed && !isLoading && <span className="self-center text-xs text-muted-foreground">{t('student.exercises.updated', { time: formatTime(lastRefreshed, i18n.resolvedLanguage) })}</span>}
          <Button variant="outline" onClick={clearLocalData}>{t('student.guest.clearData')}</Button>
          <Button variant="outline" size="icon" className="size-[48px]" onClick={load} disabled={isLoading} aria-label={t('student.exercises.refresh')}>
            {isLoading ? <Spinner className="size-4" aria-label={t('student.exercises.loading')} /> : <RefreshCw className="size-4" />}
          </Button>
        </>}
      />
      <Card className="py-0">
        {isLoading && <p className="p-5 text-sm text-muted-foreground">{t('student.exercises.loading')}</p>}
        {!isLoading && error && <p role="alert" className="p-5 text-sm text-destructive">{error}</p>}
        {!isLoading && !error && items.length === 0 && (
          <EmptyState icon={ClipboardList} title={t('student.guest.empty')} description={t('student.guest.emptyDescription')} />
        )}
        {!isLoading && !error && items.length > 0 && (
          <ul className="divide-y" aria-label={t('student.exercises.available')}>
            {items.map((item) => {
              const state = states[item.id]
              const href = state?.type === 'resume'
                ? `/exercises/${item.id}/take?attempt=${state.localAttemptId}`
                : state?.type === 'result'
                  ? `/exercises/${item.id}/results/${state.localAttemptId}`
                  : `/exercises/${item.id}`
              const label = state?.type === 'resume' ? t('student.exercises.resume') : state?.type === 'result' ? t('student.exercises.viewResult') : t('student.exercises.start')
              return (
                <li key={item.id} className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0 space-y-1">
                    <p className="font-medium">{item.title}</p>
                    <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
                      {item.is_timed ? <><Badge>{t('student.exercises.timed')}</Badge><span>{formatDuration(item.duration_minutes, i18n.resolvedLanguage)}</span></> : <Badge variant="secondary">{t('student.exercises.untimed')}</Badge>}
                      <span>{t('student.exercises.questionCount', { count: item.question_count })}</span>
                      <span>{t('student.guest.localOnly')}</span>
                    </div>
                  </div>
                  <Button asChild className="min-h-[48px]"><Link to={href}>{label}</Link></Button>
                </li>
              )
            })}
          </ul>
        )}
      </Card>
    </div>
  )
}

export function PublicExerciseLandingPage() {
  const { id } = useParams()
  const { token } = useAuth()
  const authError = usePublicAuthGuard()
  const { t, i18n } = useTranslation()
  const navigate = useNavigate()
  const [exercise, setExercise] = useState(null)
  const [state, setState] = useState(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState('')
  const questionCount = useMemo(() => new Set((exercise?.schema || []).map(row => row.q_id)).size, [exercise])

  useEffect(() => {
    async function load() {
      if (authError) return
      setIsLoading(true)
      setError('')
      try {
        const response = await getPublicExercise(id, token)
        setExercise(response.data)
        const localState = await findGuestExerciseState(id).catch(() => null)
        setState(localState?.attempt?.questionAssetSetId === response.data.question_asset_set_id
          ? localState
          : localState
            ? { ...localState, stale: true }
            : null)
      } catch (loadError) {
        setError(loadError.message)
      } finally {
        setIsLoading(false)
      }
    }
    load()
  }, [id, token, authError?.message])

  async function start() {
    try {
      const attempt = await createGuestAttempt(exercise)
      navigate(`/exercises/${id}/take?attempt=${attempt.localAttemptId}`)
    } catch (startError) {
      setError(`${t('student.guest.notSaved')} ${startError.message}`)
    }
  }

  if (authError) return <PublicAuthError error={authError} />
  if (isLoading) return <p className="p-6 text-sm text-muted-foreground">{t('student.landing.loading')}</p>
  if (error) return <Card className="max-w-2xl border-destructive/50"><CardContent className="pt-6"><p className="text-sm text-destructive">{error}</p><Button asChild variant="outline" className="mt-4"><Link to="/exercises">{t('student.landing.backToExercises')}</Link></Button></CardContent></Card>

  return (
    <div className="max-w-2xl space-y-6">
      <Card className="border-primary/15 bg-sc-primary-container/45">
        <CardContent className="space-y-6 pt-6">
          <div className="space-y-2">
            <h1 className="text-[length:var(--sc-type-headline-size)] leading-[var(--sc-type-headline-line-height)] font-[var(--sc-type-headline-weight)] tracking-[-0.03em] text-balance">{exercise.title}</h1>
            <p className="text-sm text-sc-on-primary-container/75">{t('student.guest.landingDescription')}</p>
          </div>
          <div className="flex flex-wrap items-center gap-4 text-sm">
            {exercise.is_timed ? <><Badge>{t('student.exercises.timed')}</Badge><span className="flex items-center gap-1 text-muted-foreground"><Clock className="size-4" />{formatDuration(exercise.duration_minutes, i18n.resolvedLanguage)}</span></> : <Badge variant="secondary">{t('student.exercises.untimed')}</Badge>}
            <span className="text-muted-foreground">{t('student.exercises.questionCount', { count: questionCount })}</span>
          </div>
          <p className="rounded-lg border border-warning/30 bg-warning-muted px-4 py-3 text-sm text-warning">{t('student.guest.answerPublic')}</p>
          <div className="flex flex-col gap-3 sm:flex-row">
            {state?.stale && <p className="basis-full rounded-lg border border-warning/30 bg-warning-muted px-4 py-3 text-sm text-warning">{t('student.guest.staleAttempt')}</p>}
            {state?.type === 'resume' && !state.stale && <Button asChild><Link to={`/exercises/${id}/take?attempt=${state.localAttemptId}`}>{t('student.exercises.resume')}</Link></Button>}
            {state?.type === 'result' && !state.stale && <Button asChild><Link to={`/exercises/${id}/results/${state.localAttemptId}`}>{t('student.exercises.viewResult')}</Link></Button>}
            <Button onClick={start}>{state ? t('student.landing.tryAgain') : t('student.exercises.start')}</Button>
            <Button variant="ghost" asChild><Link to="/exercises">{t('student.landing.back')}</Link></Button>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

function QuestionImage({ token, asset, title }) {
  const { t } = useTranslation()
  const [url, setUrl] = useState('')
  const [error, setError] = useState('')
  useEffect(() => {
    let objectUrl = ''
    let cancelled = false
    async function load() {
      try {
        const blob = await getPublicQuestionAssetBlob(token, asset.file_url)
        if (cancelled) return
        objectUrl = URL.createObjectURL(blob)
        setUrl(objectUrl)
      } catch {
        if (!cancelled) setError(t('student.questionView.unavailable'))
      }
    }
    if (asset?.file_url) load()
    return () => {
      cancelled = true
      if (objectUrl) URL.revokeObjectURL(objectUrl)
    }
  }, [asset?.file_url, token, t])
  if (error) return <p className="rounded-lg border bg-muted p-4 text-sm text-muted-foreground">{error}</p>
  if (!url) return <p className="text-sm text-muted-foreground">{t('student.questionView.loading')}</p>
  return <img src={url} alt={title} className="max-h-[70vh] w-full rounded-xl border object-contain" />
}

function AnswerControls({ row, value, onChange }) {
  const { t } = useTranslation()
  if (row.type === 'numeric') {
    return <input className="min-h-[48px] rounded-lg border px-3" value={value} onChange={event => onChange(event.target.value)} aria-label={t('student.take.numericAnswer', { id: row.q_id })} />
  }
  if (row.type === 'boolean') {
    return <div className="flex gap-2"><Button type="button" variant={value === '1' ? 'default' : 'outline'} onClick={() => onChange('1')}>{t('student.take.true')}</Button><Button type="button" variant={value === '0' ? 'default' : 'outline'} onClick={() => onChange('0')}>{t('student.take.false')}</Button></div>
  }
  return <div className="flex flex-wrap gap-2">{['A', 'B', 'C', 'D'].map(option => <Button key={option} type="button" variant={value === option ? 'default' : 'outline'} onClick={() => onChange(option)}>{option}</Button>)}</div>
}

export function PublicTakeExercisePage() {
  const { id } = useParams()
  const [searchParams] = useSearchParams()
  const attemptId = searchParams.get('attempt')
  const { token } = useAuth()
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [attempt, setAttempt] = useState(null)
  const [schema, setSchema] = useState(null)
  const [answers, setAnswers] = useState({})
  const [currentIndex, setCurrentIndex] = useState(0)
  const [error, setError] = useState('')
  const [notSaved, setNotSaved] = useState(false)
  const [secondsLeft, setSecondsLeft] = useState(null)
  const pendingSaveRef = useRef(Promise.resolve())

  useEffect(() => {
    async function load() {
      try {
        const [loadedAttempt, loadedSchema, loadedAnswers, currentExercise] = await Promise.all([
          loadGuestAttempt(attemptId),
          loadGuestSchema(attemptId),
          loadGuestAnswers(attemptId),
          getPublicExercise(id, token),
        ])
        if (!loadedAttempt || String(loadedAttempt.exerciseId) !== String(id) || !loadedSchema) throw new Error(t('student.guest.attemptMissing'))
        if (loadedAttempt.questionAssetSetId !== currentExercise.data.question_asset_set_id) throw new Error(t('student.guest.staleAttempt'))
        setAttempt(loadedAttempt)
        setSecondsLeft(secondsRemaining(loadedAttempt))
        setSchema(loadedSchema)
        setAnswers(loadedAnswers)
      } catch (loadError) {
        setError(loadError.message)
      }
    }
    load()
  }, [attemptId, id, t])

  const questions = useMemo(() => uniqueQuestions(schema?.rows), [schema])
  const current = questions[currentIndex]
  const currentAssets = schema?.questionAssets?.filter(asset => asset.q_id === current?.qId) || []
  const isTimed = attempt?.mode === 'timed' && secondsLeft != null
  const isOvertime = isTimed && secondsLeft <= 0

  useEffect(() => {
    if (attempt?.mode !== 'timed') return undefined
    const tick = () => setSecondsLeft(secondsRemaining(attempt))
    tick()
    const intervalId = setInterval(tick, 1000)
    return () => clearInterval(intervalId)
  }, [attempt])

  async function setAnswer(row, value) {
    setAnswers(currentAnswers => row.type === 'boolean'
      ? { ...currentAnswers, [row.q_id]: { ...(currentAnswers[row.q_id] || {}), [row.sub_id]: value } }
      : { ...currentAnswers, [row.q_id]: value })
    try {
      const savePromise = saveGuestAnswer(attemptId, row, value)
      pendingSaveRef.current = savePromise.catch(() => {})
      await savePromise
      setNotSaved(false)
    } catch {
      setNotSaved(true)
    }
  }

  async function submit() {
    try {
      await pendingSaveRef.current
      if (notSaved) throw new Error(t('student.guest.notSaved'))
      const result = await submitGuestAttempt(attemptId)
      navigate(`/exercises/${id}/results/${result.localAttemptId}`)
    } catch (submitError) {
      setError(submitError.message)
    }
  }

  async function downloadPdf() {
    let url = ''
    try {
      const blob = await getPublicExercisePdf(id, token)
      url = URL.createObjectURL(blob)
      window.open(url, '_blank', 'noopener,noreferrer')
    } catch (downloadError) {
      setError(downloadError.message)
    } finally {
      if (url) setTimeout(() => URL.revokeObjectURL(url), 1000)
    }
  }

  if (error) return <Card className="max-w-2xl border-destructive/50"><CardContent className="pt-6"><p className="text-sm text-destructive">{error}</p><Button asChild variant="outline" className="mt-4"><Link to={`/exercises/${id}`}>{t('student.landing.back')}</Link></Button></CardContent></Card>
  if (!attempt || !schema || !current) return <p className="p-6 text-sm text-muted-foreground">{t('student.take.loading')}</p>

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div><h1 className="text-xl font-semibold">{attempt.exerciseTitle}</h1><p className="text-sm text-muted-foreground">{t('student.take.questionProgress', { current: currentIndex + 1, total: questions.length })}</p></div>
        <div className="flex flex-wrap items-center gap-2">
          {isTimed && (
            <Badge variant={isOvertime ? 'destructive' : 'secondary'} className="flex min-h-[40px] items-center gap-1.5 tabular-nums" aria-label={t('student.take.timer')}>
              <Clock className="size-4" />
              {isOvertime ? t('student.take.timeExpired') : formatCountdown(secondsLeft)}
            </Badge>
          )}
          <Button variant="outline" onClick={downloadPdf}>{t('student.take.downloadPdf')}</Button><Button onClick={submit}>{t('student.take.submit')}</Button>
        </div>
      </div>
      {notSaved && <p role="alert" className="rounded-lg border border-warning/30 bg-warning-muted px-4 py-3 text-sm text-warning">{t('student.guest.notSaved')}</p>}
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <Card><CardContent className="space-y-4 pt-6">{currentAssets.length ? currentAssets.map(asset => <QuestionImage key={asset.id} token={token} asset={asset} title={t('student.questionView.viewerTitle', { id: current.qId })} />) : <p className="text-sm text-muted-foreground">{t('student.questionView.unavailable')}</p>}</CardContent></Card>
        <Card><CardContent className="space-y-4 pt-6"><h2 className="font-semibold">{t('student.results.questionHeading', { id: current.qId })}</h2>{current.rows.map(row => <div key={`${row.q_id}:${row.sub_id ?? ''}`} className="space-y-2"><p className="text-sm text-muted-foreground">{row.sub_id ? t('student.take.subQuestion', { id: row.q_id, sub: row.sub_id }) : t('student.results.questionLabel', { id: row.q_id })}</p><AnswerControls row={row} value={answerValue(answers, row)} onChange={value => setAnswer(row, value)} /></div>)}<div className="flex gap-2 pt-2"><Button variant="outline" disabled={currentIndex === 0} onClick={() => setCurrentIndex(index => index - 1)}>{t('student.take.previous')}</Button><Button variant="outline" disabled={currentIndex === questions.length - 1} onClick={() => setCurrentIndex(index => index + 1)}>{t('student.take.next')}</Button></div></CardContent></Card>
      </div>
    </div>
  )
}

async function loadResultBundle(localAttemptId) {
  const [attempt, schema, result] = await Promise.all([
    loadGuestAttempt(localAttemptId),
    loadGuestSchema(localAttemptId),
    loadGuestResult(localAttemptId),
  ])
  if (!attempt || !schema || !result) throw new Error('Guest result not found')
  return { attempt, schema, result }
}

export function PublicSummaryPage() {
  const { id, localAttemptId } = useParams()
  const { t } = useTranslation()
  const [bundle, setBundle] = useState(null)
  const [error, setError] = useState('')
  useEffect(() => { loadResultBundle(localAttemptId).then(setBundle).catch(error => setError(error.message)) }, [localAttemptId])
  if (error) return <p className="p-6 text-sm text-destructive">{error}</p>
  if (!bundle) return <p className="p-6 text-sm text-muted-foreground">{t('student.results.loadingSummary')}</p>
  const counts = countResultAnswers(bundle.result, bundle.schema.rows)
  return <Card className="max-w-2xl"><CardContent className="space-y-4 pt-6"><h1 className="text-xl font-semibold">{bundle.attempt.exerciseTitle}</h1><p className="text-3xl font-semibold">{bundle.result.score} / 10</p><p className="text-sm text-muted-foreground">{t('student.results.answerRowsCorrect', { correct: counts.correct, total: counts.total })}</p><div className="flex gap-2"><Button asChild><Link to={`/exercises/${id}/results/${localAttemptId}/review`}>{t('student.results.detailed')}</Link></Button><Button variant="outline" asChild><Link to="/exercises">{t('student.results.backToExercises')}</Link></Button></div></CardContent></Card>
}

export function PublicReviewPage() {
  const { localAttemptId } = useParams()
  const { t } = useTranslation()
  const [bundle, setBundle] = useState(null)
  const [error, setError] = useState('')
  useEffect(() => { loadResultBundle(localAttemptId).then(setBundle).catch(error => setError(error.message)) }, [localAttemptId])
  if (error) return <p className="p-6 text-sm text-destructive">{error}</p>
  if (!bundle) return <p className="p-6 text-sm text-muted-foreground">{t('student.results.loadingReview')}</p>
  return <div className="space-y-4"><h1 className="text-xl font-semibold">{bundle.attempt.exerciseTitle}</h1><p className="rounded-lg border bg-muted p-3 text-sm text-muted-foreground">{t('student.guest.reviewImageLimit')}</p>{bundle.schema.rows.map(row => { const answer = bundle.result.answers.find(item => item.q_id === row.q_id && (item.sub_id ?? null) === (row.sub_id ?? null)); return <Card key={`${row.q_id}:${row.sub_id ?? ''}`}><CardContent className="grid gap-3 pt-6 sm:grid-cols-3"><h2 className="font-medium">{row.sub_id ? t('student.take.subQuestion', { id: row.q_id, sub: row.sub_id }) : t('student.results.questionHeading', { id: row.q_id })}</h2><p className="text-sm">{t('student.results.yourAnswer')}: {resultValue(bundle.result, row) || t('student.results.skipped')}</p><p className="text-sm">{t('student.results.correctAnswer')}: {correctLabel(row, t)}</p><Badge variant={answer?.is_correct ? 'success' : 'destructive'}>{answer?.is_correct ? t('student.results.correct') : t('student.results.incorrect')}</Badge></CardContent></Card> })}</div>
}
