import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  AlertTriangle,
  CheckCircle2,
  Eye,
  ImageUp,
  RefreshCw,
  ShieldCheck,
} from 'lucide-react'
import {
  createQuestionAssetSet,
  deleteQuestionAssetSet,
  getExerciseFileBlob,
  getQuestionAssetBlob,
  getQuestionAssetSet,
  parseExerciseSchema,
  rejectQuestionAsset,
  replaceQuestionAssetsWithGenerated,
  replaceQuestionAssetWithScreenshot,
  updateExercise,
  uploadAnswerCandidates,
  uploadGeneratedQuestionAsset,
} from '@/lib/api'
import { mergeAnswerCandidates } from '@/lib/answer-candidates'
import { extractTextFromPdf } from '@/lib/pdf'
import { generateQuestionAssets } from '@/lib/question-generation'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import FileDropzone from '@/components/file-dropzone'

const MIN_CONFIDENCE = 0.75

function uniqueQuestionIds(schema) {
  return [...new Set((schema || []).map(row => Number(row.q_id)))]
}

function latestExercisePdf(files) {
  return (files || []).find(file => file.file_type === 'exercise_pdf') || null
}

function latestAnswerPdf(files) {
  return (files || []).find(file => file.file_type === 'solution_pdf') || null
}

function candidateKey(row) {
  return `${Number(row.q_id)}:${row.sub_id ?? ''}`
}

function answerPdfCandidates(rows, sourceFileId, modelId) {
  return (rows || []).flatMap((row) => {
    const answer = String(row.correct_answer ?? '').trim()
    if (!answer || !Number.isFinite(row.confidence) || row.confidence < MIN_CONFIDENCE) return []

    return [{
      q_id: Number(row.q_id),
      sub_id: row.sub_id ?? null,
      type: row.type,
      proposed_answer: answer,
      source_kind: 'answer_pdf_text',
      source_file_id: sourceFileId,
      extractor_version: 'schema-parser-v1',
      model_id: modelId || null,
      confidence: row.confidence,
    }]
  })
}

function greenHighlightCandidates(rows, sourceFileId) {
  return (rows || []).map(row => ({
    q_id: row.qId,
    sub_id: row.subId ?? null,
    type: row.type,
    proposed_answer: row.proposedAnswer,
    source_kind: 'exercise_green_highlight',
    source_file_id: sourceFileId,
    source_page: row.sourcePage,
    source_x: row.sourceX,
    source_y: row.sourceY,
    source_width: row.sourceWidth,
    source_height: row.sourceHeight,
    extractor_version: 'green-highlight-v1',
    confidence: row.confidence,
  }))
}

function hasValidFinalAnswer(row) {
  const answer = String(row.correct_answer ?? '').trim()
  if (row.type === 'mcq') return ['A', 'B', 'C', 'D'].includes(answer.toUpperCase())
  if (row.type === 'boolean') return ['0', '1'].includes(answer)
  return row.type === 'numeric' && answer !== '' && Number.isFinite(Number(answer))
}

function validAnswerSchema(schema) {
  return schema.length > 0 && schema.every(hasValidFinalAnswer)
}

function groupAssets(questionIds, assets) {
  return questionIds.map(qId => ({
    qId,
    assets: (assets || []).filter(asset => asset.q_id === qId),
  }))
}

function AuthenticatedQuestionImage({ asset, token }) {
  const { t } = useTranslation()
  const [source, setSource] = useState('')
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    let objectUrl = ''
    let cancelled = false
    setSource('')
    setFailed(false)

    getQuestionAssetBlob(token, asset.file_url)
      .then((blob) => {
        if (cancelled) return
        objectUrl = URL.createObjectURL(blob)
        setSource(objectUrl)
      })
      .catch(() => {
        if (!cancelled) setFailed(true)
      })

    return () => {
      cancelled = true
      if (objectUrl) URL.revokeObjectURL(objectUrl)
    }
  }, [asset.file_url, token])

  if (failed) {
    return (
      <div className="flex min-h-32 items-center justify-center rounded-lg border bg-muted/30 p-4 text-sm text-destructive">
        {t('teacher.questionViews.imageFailed')}
      </div>
    )
  }

  if (!source) {
    return (
      <div className="min-h-32 animate-pulse rounded-lg border bg-muted" aria-label={t('teacher.questionViews.imageLoading')} />
    )
  }

  return (
    <img
      src={source}
      alt=""
      className="h-auto w-full rounded-lg border bg-white object-contain"
    />
  )
}

function ReplacementForm({ exerciseId, setId, qId, token, onReplaced }) {
  const { t } = useTranslation()
  const [file, setFile] = useState(null)
  const [progress, setProgress] = useState(0)
  const [isUploading, setIsUploading] = useState(false)
  const [error, setError] = useState('')

  async function handleUpload() {
    if (!file) return

    setIsUploading(true)
    setError('')
    try {
      await replaceQuestionAssetWithScreenshot(
        token,
        exerciseId,
        setId,
        qId,
        file,
        { onProgress: setProgress },
      )
      await onReplaced()
    } catch (uploadError) {
      setError(uploadError.message)
    } finally {
      setIsUploading(false)
    }
  }

  return (
    <div className="space-y-3 border-t pt-4">
      <div>
        <h4 className="text-sm font-semibold">{t('teacher.questionViews.uploadScreenshot')}</h4>
        <p className="mt-1 text-xs text-muted-foreground">
          {t('teacher.questionViews.screenshotHelp')}
        </p>
      </div>
      <FileDropzone
        accept="image/png,image/jpeg,image/webp"
        file={file}
        onChange={setFile}
        disabled={isUploading}
        icon={ImageUp}
        title={t('teacher.questionViews.chooseScreenshot')}
        hint={t('teacher.questionViews.imageTypes')}
        inputAriaLabel={t('teacher.questionViews.screenshotAria', { number: qId })}
      />
      {isUploading && (
        <progress className="h-2 w-full accent-primary" value={progress} max="1">
          {Math.round(progress * 100)}%
        </progress>
      )}
      {error && <p className="text-sm text-destructive" role="alert">{error}</p>}
      <Button type="button" onClick={handleUpload} disabled={isUploading || !file}>
        {isUploading ? t('teacher.questionViews.uploadingScreenshot') : t('teacher.questionViews.useScreenshot')}
      </Button>
    </div>
  )
}

function QuestionAnswerReview({
  rows,
  resolvedKeys,
  onAnswerChange,
  onResolve,
}) {
  const { t } = useTranslation()

  function questionLabel(row) {
    return row.sub_id
      ? t('teacher.questionViews.answerPart', { number: row.q_id, part: row.sub_id })
      : t('teacher.questionViews.question', { number: row.q_id })
  }

  function answerControl(row, errorId) {
    const label = t('teacher.schema.correctAnswerAria', {
      number: row.sub_id ? `${row.q_id}${row.sub_id}` : row.q_id,
    })
    const isValid = hasValidFinalAnswer(row)
    if (row.type === 'mcq') {
      return (
        <Select
          value={String(row.correct_answer)}
          onValueChange={value => onAnswerChange(row, value)}
        >
          <SelectTrigger
            className="w-32 px-3 [&_svg]:!size-5"
            aria-label={label}
            aria-invalid={!isValid}
            aria-describedby={isValid ? undefined : errorId}
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {['A', 'B', 'C', 'D'].map(value => (
              <SelectItem key={value} value={value}>{value}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      )
    }
    if (row.type === 'boolean') {
      return (
        <Select
          value={String(row.correct_answer)}
          onValueChange={value => onAnswerChange(row, value)}
        >
          <SelectTrigger
            className="w-32 px-3 [&_svg]:!size-5"
            aria-label={label}
            aria-invalid={!isValid}
            aria-describedby={isValid ? undefined : errorId}
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="1">{t('teacher.schema.true')}</SelectItem>
            <SelectItem value="0">{t('teacher.schema.false')}</SelectItem>
          </SelectContent>
        </Select>
      )
    }
    return (
      <Input
        className="min-h-12 w-32"
        value={row.correct_answer}
        inputMode="decimal"
        onChange={event => onAnswerChange(row, event.target.value)}
        aria-label={label}
        aria-invalid={!isValid}
        aria-describedby={isValid ? undefined : errorId}
      />
    )
  }

  return (
    <div className="space-y-4">
      <h4 className="text-sm font-semibold">{t('teacher.questionViews.answerReviewTitle')}</h4>
      <div className="divide-y">
        {rows.map(row => {
          const isResolved = resolvedKeys.has(row.key)
          const isValid = hasValidFinalAnswer(row)
          const errorId = `answer-error-${row.q_id}-${row.sub_id ?? 'main'}`
          const stateLabel = isResolved
            ? t('teacher.questionViews.answerResolved')
            : row.hasConflict
              ? t('teacher.questionViews.answerStatus.conflict')
              : null

          return (
            <div key={row.key} className="space-y-4 py-4 first:pt-0 last:pb-0">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="font-medium">{questionLabel(row)}</p>
                {stateLabel && (
                  <Badge variant={row.hasConflict && !isResolved ? 'destructive' : 'outline'}>
                    {stateLabel}
                  </Badge>
                )}
              </div>
              <div className="space-y-4">
                <div className="space-y-1">
                  <p className="text-xs font-medium text-muted-foreground">
                    {t('teacher.questionViews.answerSources')}
                  </p>
                  {row.candidates.length === 0 ? (
                    <p className="text-sm text-muted-foreground">{t('teacher.questionViews.noAutomaticAnswer')}</p>
                  ) : (
                    <ul className="space-y-1 text-sm">
                      {row.candidates.map(candidate => (
                        <li key={candidate.source_kind}>
                          {candidate.source_kind === 'answer_pdf_text'
                            ? t('teacher.questionViews.answerPdfEvidence', {
                              answer: candidate.proposed_answer,
                            })
                            : t('teacher.questionViews.greenEvidence', {
                              answer: candidate.proposed_answer,
                            })}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
                <div className="space-y-1">
                  <p className="text-xs font-medium text-muted-foreground">
                    {t('teacher.questionViews.currentAnswer')}
                  </p>
                  {answerControl(row, errorId)}
                  {!isValid && (
                    <p id={errorId} className="text-xs text-destructive">
                      {t('teacher.questionViews.invalidAnswer')}
                    </p>
                  )}
                </div>
              </div>
              {row.hasConflict && !isResolved && (
                <Button
                  type="button"
                  variant="outline"
                  className="h-auto w-full whitespace-normal py-2.5 text-center"
                  onClick={() => onResolve(row)}
                >
                  {t('teacher.questionViews.keepCurrentAnswer', {
                    number: row.q_id,
                    part: row.sub_id,
                  })}
                </Button>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

function UnexpectedAnswerCandidates({ candidates, resolvedKeys, onResolve }) {
  const { t } = useTranslation()

  if (candidates.length === 0) return null

  return (
    <Alert variant="destructive">
      <AlertTriangle />
      <AlertTitle>{t('teacher.questionViews.unexpectedAnswer')}</AlertTitle>
      <AlertDescription>
        <ul className="space-y-3">
          {candidates.map(candidate => (
            <li key={`${candidate.key}:${candidate.source_kind}`} className="flex flex-wrap items-center justify-between gap-3">
              <span>{t('teacher.questionViews.unexpectedEvidence', { answer: candidate.proposed_answer })}</span>
              {resolvedKeys.has(candidate.key) ? (
                <Badge variant="outline">{t('teacher.questionViews.answerResolved')}</Badge>
              ) : (
                <Button type="button" variant="outline" onClick={() => onResolve(candidate)}>
                  {t('teacher.questionViews.dismissUnexpected', { number: candidate.q_id })}
                </Button>
              )}
            </li>
          ))}
        </ul>
      </AlertDescription>
    </Alert>
  )
}

export default function QuestionAssetWorkflow({
  exercise,
  token,
  onActivated,
  onReplacePdf,
  autoStartKey,
}) {
  const { t } = useTranslation()
  const [draft, setDraft] = useState(null)
  const [phase, setPhase] = useState('idle')
  const [progress, setProgress] = useState({ stage: '', current: 0, total: 1 })
  const [error, setError] = useState('')
  const [busyQuestionId, setBusyQuestionId] = useState(null)
  const [answerSchema, setAnswerSchema] = useState(() => exercise.schema || [])
  const [resolvedAnswerKeys, setResolvedAnswerKeys] = useState(() => new Set())
  const [showActivationConfirm, setShowActivationConfirm] = useState(false)
  const autoStartedFor = useRef(null)

  const questionIds = useMemo(() => uniqueQuestionIds(exercise.schema), [exercise.schema])
  const sourceFile = useMemo(() => latestExercisePdf(exercise.files), [exercise.files])
  const answerSourceFile = useMemo(() => latestAnswerPdf(exercise.files), [exercise.files])
  const groups = useMemo(
    () => groupAssets(questionIds, draft?.assets),
    [draft?.assets, questionIds],
  )
  const answerReview = useMemo(
    () => mergeAnswerCandidates(answerSchema, draft?.answer_candidates || []),
    [answerSchema, draft?.answer_candidates],
  )

  const loadDraft = useCallback(async (setId) => {
    setPhase('loading')
    setError('')
    try {
      const response = await getQuestionAssetSet(token, exercise.id, setId)
      setDraft(response.data)
      setPhase('review')
    } catch (loadError) {
      setError(loadError.message)
      setPhase('error')
    }
  }, [exercise.id, token])

  useEffect(() => {
    if (exercise.pending_question_asset_set_id && !autoStartKey) {
      loadDraft(exercise.pending_question_asset_set_id)
    }
  }, [autoStartKey, exercise.pending_question_asset_set_id, loadDraft])

  const startGeneration = useCallback(async () => {
    if (!sourceFile || questionIds.length === 0 || phase === 'generating') return

    setPhase('generating')
    setError('')
    setResolvedAnswerKeys(new Set())
    let createdSetId = null
    let readyForReview = false
    try {
      let parsedRows = []
      let parserStatus = 'not_provided'
      let parserModelId = null
      if (answerSourceFile) {
        setProgress({ stage: 'answers', current: 0, total: 1 })
        try {
          const answerPdf = await getExerciseFileBlob(answerSourceFile.id, token)
          const sourceText = await extractTextFromPdf(answerPdf)
          const parsed = await parseExerciseSchema(token, {
            source_text: sourceText,
            expected_question_count: questionIds.length,
          })
          parsedRows = parsed.data.schema || []
          parserModelId = parsed.data.model_id || null
          parserStatus = 'parsed'
        } catch {
          parserStatus = 'failed'
        }
      }

      setAnswerSchema(exercise.schema || [])
      const source = await getExerciseFileBlob(sourceFile.id, token)
      const generated = await generateQuestionAssets(source, questionIds, {
        onProgress: setProgress,
        schemaRows: exercise.schema,
      })

      const setPayload = {
        source_file_id: sourceFile.id,
        detector_version: generated.detectorVersion,
        detection_method: generated.detectionMethod,
      }
      if (answerSourceFile) {
        setPayload.answer_source_file_id = answerSourceFile.id
        setPayload.answer_parser_status = parserStatus
      }
      const created = await createQuestionAssetSet(token, exercise.id, {
        ...setPayload,
      })
      const setId = created.data.id
      createdSetId = setId
      setProgress({ stage: 'uploading', current: 0, total: generated.assets.length })

      for (let index = 0; index < generated.assets.length; index += 1) {
        await uploadGeneratedQuestionAsset(
          token,
          exercise.id,
          setId,
          generated.assets[index],
          {
            onProgress: fraction => setProgress({
              stage: 'uploading',
              current: index + fraction,
              total: generated.assets.length,
            }),
          },
        )
      }

      const candidates = [
        ...answerPdfCandidates(parsedRows, answerSourceFile?.id, parserModelId),
        ...greenHighlightCandidates(generated.answerCandidates, sourceFile.id),
      ]
      if (candidates.length > 0) {
        await uploadAnswerCandidates(token, exercise.id, setId, candidates)
      }

      const replacedSetId = draft?.asset_set?.confirmed_at == null
        ? (draft?.asset_set?.id || exercise.pending_question_asset_set_id)
        : exercise.pending_question_asset_set_id
      if (replacedSetId && replacedSetId !== setId) {
        await deleteQuestionAssetSet(token, exercise.id, replacedSetId)
      }
      readyForReview = true
      await loadDraft(setId)
    } catch (generationError) {
      if (createdSetId && !readyForReview) {
        await deleteQuestionAssetSet(token, exercise.id, createdSetId).catch(() => {})
      }
      setError(generationError.code === 'SCANNED_OR_IMAGE_ONLY_PAGE'
        ? t('teacher.questionViews.scannedUnsupported')
        : generationError.message)
      setPhase('error')
    }
  }, [
    answerSourceFile,
    draft,
    exercise.id,
    exercise.pending_question_asset_set_id,
    exercise.schema,
    loadDraft,
    phase,
    questionIds,
    sourceFile,
    t,
    token,
  ])

  useEffect(() => {
    if (!autoStartKey || autoStartedFor.current === autoStartKey || !sourceFile) return
    autoStartedFor.current = autoStartKey
    startGeneration()
  }, [autoStartKey, sourceFile, startGeneration])

  async function handleReject(qId) {
    setBusyQuestionId(qId)
    setError('')
    try {
      await rejectQuestionAsset(token, exercise.id, draft.asset_set.id, qId)
      await loadDraft(draft.asset_set.id)
    } catch (rejectError) {
      setError(rejectError.message)
    } finally {
      setBusyQuestionId(null)
    }
  }

  async function handleRetry(qId) {
    setBusyQuestionId(qId)
    setError('')
    setProgress({ stage: 'reading', current: 0, total: 1 })
    try {
      const source = await getExerciseFileBlob(sourceFile.id, token)
      const generated = await generateQuestionAssets(source, questionIds, {
        questionIdsToRender: [qId],
        onProgress: setProgress,
        schemaRows: exercise.schema,
      })
      setProgress({ stage: 'uploading', current: 0, total: 1 })
      await replaceQuestionAssetsWithGenerated(
        token,
        exercise.id,
        draft.asset_set.id,
        qId,
        generated.assets,
        {
          onProgress: fraction => setProgress({
            stage: 'uploading',
            current: fraction,
            total: 1,
          }),
        },
      )
      const candidates = greenHighlightCandidates(generated.answerCandidates, sourceFile.id)
      if (candidates.length > 0) {
        await uploadAnswerCandidates(token, exercise.id, draft.asset_set.id, candidates)
      }
      await loadDraft(draft.asset_set.id)
    } catch (retryError) {
      setError(retryError.code === 'SCANNED_OR_IMAGE_ONLY_PAGE'
        ? t('teacher.questionViews.scannedUnsupported')
        : retryError.message)
    } finally {
      setBusyQuestionId(null)
    }
  }

  async function handleActivate() {
    setShowActivationConfirm(false)
    setPhase('activating')
    setError('')
    try {
      const resolvedRows = [
        ...answerReview.rows,
        ...answerReview.unexpected,
      ].filter(row => resolvedAnswerKeys.has(row.key))
      const payload = {
        schema: answerSchema,
        question_asset_set_id: draft.asset_set.id,
      }
      if (resolvedRows.length > 0) {
        payload.resolved_answer_candidate_keys = resolvedRows.map(row => ({
          q_id: row.q_id,
          sub_id: row.sub_id ?? null,
        }))
      }
      const response = await updateExercise(token, exercise.id, payload)
      setDraft(null)
      setPhase('idle')
      onActivated(response.data)
    } catch (activationError) {
      setError(activationError.message)
      setPhase('review')
    }
  }

  function handleAnswerChange(row, value) {
    setAnswerSchema(current => current.map(item => (
      candidateKey(item) === row.key
        ? { ...item, correct_answer: value }
        : item
    )))
    setResolvedAnswerKeys((current) => {
      const next = new Set(current)
      next.delete(row.key)
      return next
    })
  }

  function handleResolveAnswer(row) {
    setResolvedAnswerKeys(current => new Set(current).add(row.key))
  }

  const questionReviews = groups.map(({ qId, assets }) => {
    const answerRows = answerReview.rows.filter(row => Number(row.q_id) === qId)
    const isRejected = assets.some(asset => asset.rejected_at)
    const isLowConfidence = assets.some(asset => (
      asset.source_kind === 'pdf_crop' && asset.confidence < MIN_CONFIDENCE
    ))
    const isMissing = assets.length === 0
    const hasUnresolvedAnswer = answerRows.some(row => (
      row.hasConflict && !resolvedAnswerKeys.has(row.key)
    ))
    const hasInvalidAnswer = answerRows.some(row => !hasValidFinalAnswer(row))

    return {
      qId,
      assets,
      answerRows,
      isRejected,
      isLowConfidence,
      isMissing,
      hasUnresolvedAnswer,
      hasInvalidAnswer,
      needsAttention: isRejected || isLowConfidence || isMissing || hasUnresolvedAnswer || hasInvalidAnswer,
    }
  })
  const attentionQuestionIds = questionReviews
    .filter(review => review.needsAttention)
    .map(review => review.qId)
  const sourceIsCurrent = Boolean(sourceFile && draft?.asset_set?.source_file_id === sourceFile.id)
  const answerSourceIsCurrent = Boolean(
    draft
    && (draft.asset_set.answer_source_file_id ?? null) === (answerSourceFile?.id ?? null),
  )
  const hasBlockingQuestion = questionReviews.some(review => (
    review.isMissing || review.isRejected || review.isLowConfidence || review.hasInvalidAnswer
  ))
  const hasUnresolvedAnswer = questionReviews.some(review => review.hasUnresolvedAnswer)
    || answerReview.unexpected.some(row => !resolvedAnswerKeys.has(row.key))
  const canActivate = phase === 'review'
    && sourceIsCurrent
    && answerSourceIsCurrent
    && !hasBlockingQuestion
    && !hasUnresolvedAnswer
    && validAnswerSchema(answerSchema)
  const progressValue = progress.total ? progress.current / progress.total : 0
  const activeWithoutDraft = !draft && exercise.question_asset_set_id

  if (activeWithoutDraft) {
    return (
      <Card>
        <CardContent className="flex flex-wrap items-center justify-between gap-4 pt-5">
          <div className="flex items-start gap-3">
            <span className="flex size-10 shrink-0 items-center justify-center rounded-[var(--sc-component-control-shape)] bg-success-muted text-success">
              <CheckCircle2 className="size-5" />
            </span>
            <div>
              <h2 className="font-semibold">{t('teacher.questionViews.activeTitle')}</h2>
              <p className="mt-1 text-sm text-muted-foreground">{t('teacher.questionViews.activeDescription')}</p>
            </div>
          </div>
          <Button type="button" variant="outline" onClick={startGeneration}>
            <RefreshCw />
            {t('teacher.questionViews.generateReplacement')}
          </Button>
        </CardContent>
      </Card>
    )
  }

  if (!draft || phase === 'generating' || phase === 'loading' || phase === 'error') {
    return (
      <Card>
        <CardHeader className="border-b px-5 py-4">
          <div className="flex items-center gap-3">
            <span className="flex size-10 shrink-0 items-center justify-center rounded-[var(--sc-component-control-shape)] bg-selection text-primary">
              <Eye className="size-5" />
            </span>
            <div>
              <h2 className="font-semibold">{t('teacher.questionViews.title')}</h2>
              <p className="mt-0.5 text-sm text-muted-foreground">{t('teacher.questionViews.description')}</p>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4 pt-5">
          {!sourceFile && (
            <p className="text-sm text-muted-foreground">{t('teacher.questionViews.pdfRequired')}</p>
          )}
          {(phase === 'generating' || phase === 'loading') && (
            <div className="space-y-2" aria-live="polite">
              <div className="flex items-center justify-between gap-3 text-sm">
                <span className="font-medium">
                  {phase === 'loading'
                    ? t('teacher.questionViews.loadingPreview')
                    : t(`teacher.questionViews.progress.${progress.stage || 'reading'}`)}
                </span>
                {phase === 'generating' && (
                  <span className="tabular-nums text-muted-foreground">{Math.round(progressValue * 100)}%</span>
                )}
              </div>
              <progress
                className="h-2 w-full accent-primary"
                value={phase === 'loading' ? undefined : progressValue}
                max="1"
              />
            </div>
          )}
          {error && (
            <Alert variant="destructive">
              <AlertTriangle />
              <AlertTitle>{t('teacher.questionViews.generationFailed')}</AlertTitle>
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              onClick={startGeneration}
              disabled={!sourceFile || questionIds.length === 0 || phase === 'generating' || phase === 'loading'}
            >
              <RefreshCw />
              {phase === 'error' ? t('teacher.questionViews.tryAgain') : t('teacher.questionViews.prepare')}
            </Button>
            {phase === 'error' && (
              <Button type="button" variant="outline" onClick={onReplacePdf}>
                {t('teacher.questionViews.replacePdf')}
              </Button>
            )}
          </div>
          <p className="text-xs text-muted-foreground">{t('teacher.questionViews.visionDisabled')}</p>
        </CardContent>
      </Card>
    )
  }

  return (
    <section className="space-y-4" aria-labelledby="question-view-review-title">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="max-w-2xl">
          <h2 id="question-view-review-title" className="text-xl font-semibold">
            {t('teacher.questionViews.reviewTitle')}
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {t('teacher.questionViews.reviewDescription')}
          </p>
        </div>
        <Badge variant="secondary">
          {t('teacher.questionViews.questionCount', { count: groups.length })}
        </Badge>
      </div>

      {(!sourceIsCurrent || !answerSourceIsCurrent) && (
        <Alert variant="destructive">
          <AlertTriangle />
          <AlertTitle>{t('teacher.questionViews.outdatedTitle')}</AlertTitle>
          <AlertDescription className="space-y-3">
            <p>{t('teacher.questionViews.outdatedSourceDescription')}</p>
            <Button type="button" variant="outline" onClick={startGeneration}>
              <RefreshCw />
              {t('teacher.questionViews.generateNewPreview')}
            </Button>
          </AlertDescription>
        </Alert>
      )}

      {draft.asset_set.answer_parser_status === 'failed' && (
        <Alert>
          <AlertTriangle />
          <AlertTitle>{t('teacher.questionViews.answerParseFailedTitle')}</AlertTitle>
          <AlertDescription>{t('teacher.questionViews.answerParseFailedDescription')}</AlertDescription>
        </Alert>
      )}

      <UnexpectedAnswerCandidates
        candidates={answerReview.unexpected}
        resolvedKeys={resolvedAnswerKeys}
        onResolve={handleResolveAnswer}
      />

      {attentionQuestionIds.length > 0 && (
        <nav
          className="rounded-lg border border-warning/40 bg-warning-muted/40 p-4"
          aria-labelledby="attention-question-outline-title"
        >
          <div className="flex items-start gap-3">
            <AlertTriangle className="mt-0.5 size-5 shrink-0 text-warning" />
            <div className="min-w-0 space-y-3">
              <div>
                <h3 id="attention-question-outline-title" className="text-sm font-semibold">
                  {t('teacher.questionViews.attentionOutlineTitle')}
                </h3>
                <p className="mt-1 text-sm text-muted-foreground">
                  {t('teacher.questionViews.attentionOutlineDescription', {
                    count: attentionQuestionIds.length,
                  })}
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                {attentionQuestionIds.map(qId => (
                  <Button key={qId} type="button" variant="outline" size="sm" asChild>
                    <a href={`#question-review-${qId}`}>
                      {t('teacher.questionViews.question', { number: qId })}
                    </a>
                  </Button>
                ))}
              </div>
            </div>
          </div>
        </nav>
      )}

      <div className="space-y-4">
        {questionReviews.map(({
          qId,
          assets,
          answerRows,
          isRejected,
          isLowConfidence,
          isMissing,
          hasUnresolvedAnswer,
          hasInvalidAnswer,
          needsAttention,
        }) => {
          return (
            <Card
              key={qId}
              id={`question-review-${qId}`}
              className={needsAttention ? 'scroll-mt-24 border-warning/60' : 'scroll-mt-24'}
            >
              <CardHeader className="border-b px-5 py-3">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <h3 className="font-semibold">{t('teacher.questionViews.question', { number: qId })}</h3>
                  {isRejected ? (
                    <Badge variant="destructive">{t('teacher.questionViews.replacementRequired')}</Badge>
                  ) : isLowConfidence || isMissing || hasUnresolvedAnswer || hasInvalidAnswer ? (
                    <Badge variant="outline" className="border-warning text-warning">
                      {t('teacher.questionViews.needsAttention')}
                    </Badge>
                  ) : (
                    <Badge variant="outline" className="border-success/40 text-success">
                      {t('teacher.questionViews.ready')}
                    </Badge>
                  )}
                </div>
              </CardHeader>
              <CardContent className="p-0">
                <div className="grid lg:grid-cols-[minmax(0,3fr)_minmax(18rem,2fr)]">
                  <div className="min-w-0 space-y-4 p-5">
                    {assets.map((asset, index) => (
                      <figure key={asset.id} className="space-y-3">
                        {assets.length > 1 && (
                          <figcaption className="text-xs font-medium text-muted-foreground">
                            {t('teacher.questionViews.segment', { current: index + 1, total: assets.length })}
                          </figcaption>
                        )}
                        <AuthenticatedQuestionImage asset={asset} token={token} />
                      </figure>
                    ))}

                    {!isRejected && !isMissing && (
                      <Button
                        type="button"
                        variant="destructive"
                        onClick={() => handleReject(qId)}
                        disabled={busyQuestionId === qId}
                      >
                        {busyQuestionId === qId
                          ? t('teacher.questionViews.rejecting')
                          : t('teacher.questionViews.rejectQuestion')}
                      </Button>
                    )}

                    {isRejected && (
                      <div className="space-y-4 rounded-lg bg-warning-muted p-4">
                        <div className="flex flex-wrap gap-2">
                          <Button
                            type="button"
                            variant="outline"
                            onClick={() => handleRetry(qId)}
                            disabled={busyQuestionId !== null}
                          >
                            <RefreshCw className={busyQuestionId === qId ? 'animate-spin' : ''} />
                            {t('teacher.questionViews.retryDetection')}
                          </Button>
                          <Button
                            type="button"
                            variant="outline"
                            onClick={onReplacePdf}
                            disabled={busyQuestionId !== null}
                          >
                            {t('teacher.questionViews.replacePdf')}
                          </Button>
                        </div>
                        {busyQuestionId === qId && (
                          <div className="space-y-2" aria-live="polite">
                            <div className="flex items-center justify-between gap-3 text-xs font-medium">
                              <span>{t(`teacher.questionViews.progress.${progress.stage || 'reading'}`)}</span>
                              <span className="tabular-nums text-muted-foreground">
                                {Math.round(progressValue * 100)}%
                              </span>
                            </div>
                            <progress className="h-2 w-full accent-primary" value={progressValue} max="1" />
                          </div>
                        )}
                        <p className="text-xs text-muted-foreground">
                          {t('teacher.questionViews.retryHelp')}
                        </p>
                        <ReplacementForm
                          exerciseId={exercise.id}
                          setId={draft.asset_set.id}
                          qId={qId}
                          token={token}
                          onReplaced={() => loadDraft(draft.asset_set.id)}
                        />
                      </div>
                    )}
                  </div>
                  <div className="min-w-0 border-t p-5 lg:border-l lg:border-t-0">
                    <QuestionAnswerReview
                      rows={answerRows}
                      resolvedKeys={resolvedAnswerKeys}
                      onAnswerChange={handleAnswerChange}
                      onResolve={handleResolveAnswer}
                    />
                  </div>
                </div>
              </CardContent>
            </Card>
          )
        })}
      </div>

      {error && <p className="text-sm text-destructive" role="alert">{error}</p>}

      <Card className="border-primary/30 shadow-[var(--shadow-raised)]">
        <CardContent className="flex flex-col gap-4 pt-5 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-3">
            <ShieldCheck className="mt-0.5 size-5 shrink-0 text-primary" />
            <div>
              <p className="text-sm font-semibold">{t('teacher.questionViews.confirmTitle')}</p>
              <p className="mt-1 max-w-2xl text-xs text-muted-foreground">
                {t('teacher.questionViews.confirmAnswersDescription')}
              </p>
            </div>
          </div>
          <Button type="button" onClick={() => setShowActivationConfirm(true)} disabled={!canActivate}>
            {phase === 'activating'
              ? t('teacher.questionViews.activating')
              : t('teacher.questionViews.confirmAnswers')}
          </Button>
        </CardContent>
      </Card>

      <Dialog open={showActivationConfirm} onOpenChange={setShowActivationConfirm}>
        <DialogContent closeLabel={t('common.close')}>
          <DialogHeader>
            <DialogTitle>{t('teacher.questionViews.confirmTitle')}</DialogTitle>
            <DialogDescription>{t('teacher.questionViews.confirmDescription')}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setShowActivationConfirm(false)}>
              {t('teacher.view.cancel')}
            </Button>
            <Button type="button" onClick={handleActivate}>
              {t('teacher.questionViews.confirm')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  )
}
