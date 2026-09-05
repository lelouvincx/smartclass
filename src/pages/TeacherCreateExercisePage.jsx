import React, { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useNavigate } from 'react-router-dom'
import {
  createExercise,
  createExerciseFileUpload,
  parseExerciseSchema,
  uploadExerciseFile,
} from '@/lib/api'
import { useAuth } from '@/lib/auth-context'
import { extractTextFromPdf } from '@/lib/pdf'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { Switch } from '@/components/ui/switch'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'
import { cn } from '@/lib/utils'
import { FileCheck2, FileText } from 'lucide-react'
import { Spinner } from '@/components/ui/spinner'
import { SchemaTable } from '@/components/schema-table'
import { GradeDropdown } from '@/components/grade-checkbox-group'
import FileDropzone from '@/components/file-dropzone'
import { formatDuration } from '@/lib/format'

const LOW_CONFIDENCE_THRESHOLD = 0.75
const BOOLEAN_SUB_IDS = ['a', 'b', 'c', 'd']

// --- Normalization helpers ---

function normalizeAnswer(type, value) {
  const trimmed = String(value ?? '').trim()
  if (type === 'mcq') {
    return trimmed.toUpperCase()
  }
  return trimmed
}

// --- Validation ---

function validateRows(rows, t) {
  const qidCounts = new Map()
  rows.forEach((row) => {
    const key = String(row.q_id)
    if (!key) return
    qidCounts.set(key, (qidCounts.get(key) || 0) + 1)
  })

  const booleanSubIds = new Map()
  const sourceQuestions = new Map()
  rows.forEach((row) => {
    if (row.type === 'boolean' && row.sub_id) {
      if (!booleanSubIds.has(String(row.q_id))) {
        booleanSubIds.set(String(row.q_id), new Set())
      }
      booleanSubIds.get(String(row.q_id)).add(row.sub_id)
    }
  })
  for (const row of rows) {
    const key = `${row.section_key ?? 'main'}:${row.local_number ?? row.q_id}`
    const existing = sourceQuestions.get(key)
    if (existing !== undefined && String(existing) !== String(row.q_id)) {
      sourceQuestions.set(key, null)
    } else if (existing === undefined) {
      sourceQuestions.set(key, row.q_id)
    }
  }

  return rows.map((row) => {
    const errors = []
    const warnings = []
    const qid = Number.parseInt(String(row.q_id), 10)

    if (!row.q_id || Number.isNaN(qid) || qid <= 0) {
      errors.push(t('teacher.schema.positiveInteger'))
    }
    const localNumber = Number.parseInt(String(row.local_number ?? ''), 10)
    if (Number.isNaN(localNumber) || localNumber <= 0) {
      errors.push(t('teacher.schema.positiveLocalNumber'))
    }
    if (sourceQuestions.get(`${row.section_key ?? 'main'}:${row.local_number ?? row.q_id}`) === null) {
      errors.push(t('teacher.schema.uniqueLocalNumber'))
    }

    if (row.type === 'boolean') {
      if (!row.sub_id || !BOOLEAN_SUB_IDS.includes(row.sub_id)) {
        errors.push(t('teacher.schema.booleanParts'))
      } else if (!['0', '1'].includes(row.correct_answer)) {
        errors.push(t('teacher.schema.selectBoolean'))
      }
    } else {
      if (qidCounts.get(String(row.q_id)) > 1) {
        errors.push(t('teacher.schema.uniqueQuestion'))
      }

      const answer = normalizeAnswer(row.type, row.correct_answer)
      if (!answer) {
        errors.push(t('teacher.schema.answerRequired'))
      } else if (row.type === 'mcq' && !['A', 'B', 'C', 'D'].includes(answer)) {
        errors.push(t('teacher.schema.mcqAnswer'))
      } else if (row.type === 'numeric' && Number.isNaN(Number(answer))) {
        errors.push(t('teacher.schema.numericAnswer'))
      }
    }

    if ((row.confidence ?? 1) < LOW_CONFIDENCE_THRESHOLD) {
      warnings.push(t('teacher.schema.lowConfidence'))
    }

    return {
      ...row,
      correct_answer: row.type === 'boolean' ? (row.correct_answer ?? '') : normalizeAnswer(row.type, row.correct_answer),
      errors,
      warnings,
    }
  })
}

// --- Schema payload builder ---

function toSchemaPayload(rows) {
  return rows.map((row) => {
    const identity = {
      section_key: row.section_key ?? 'main',
      section_title: row.section_title?.trim() || null,
      local_number: Number.parseInt(String(row.local_number ?? row.q_id), 10),
    }
    if (row.type === 'boolean') {
      return {
        q_id: Number.parseInt(String(row.q_id), 10),
        ...identity,
        type: 'boolean',
        sub_id: row.sub_id,
        correct_answer: row.correct_answer,
      }
    }
    return {
      q_id: Number.parseInt(String(row.q_id), 10),
      ...identity,
      type: row.type,
      correct_answer: normalizeAnswer(row.type, row.correct_answer),
    }
  })
}

// --- Row factory ---

function newRows(type, nextQid = '', descriptor = {}) {
  const makeId = () =>
    typeof crypto !== 'undefined' && crypto.randomUUID
      ? crypto.randomUUID()
      : Math.random().toString(36).slice(2)

  if (type === 'boolean') {
    return BOOLEAN_SUB_IDS.map((sub_id) => ({
      id: makeId(),
      q_id: nextQid,
      section_key: descriptor.section_key ?? 'main',
      section_title: descriptor.section_title ?? null,
      local_number: descriptor.local_number ?? nextQid,
      sub_id,
      type: 'boolean',
      correct_answer: '',
      confidence: 1,
    }))
  }

  return [{
    id: makeId(),
    q_id: nextQid,
    section_key: descriptor.section_key ?? 'main',
    section_title: descriptor.section_title ?? null,
    local_number: descriptor.local_number ?? nextQid,
    sub_id: null,
    type,
    correct_answer: '',
    confidence: 1,
  }]
}

// --- Main page ---

export default function TeacherCreateExercisePage() {
  const { t, i18n } = useTranslation()
  const navigate = useNavigate()
  const { token } = useAuth()

  const [title, setTitle] = useState('')
  const [grades, setGrades] = useState([12])
  const [isTimed, setIsTimed] = useState(true)
  const [durationMinutes, setDurationMinutes] = useState(60)
  const [exerciseFile, setExerciseFile] = useState(null)
  const [answerFile, setAnswerFile] = useState(null)
  const [rows, setRows] = useState(newRows('mcq', '1'))
  const [filter, setFilter] = useState('all')
  const [error, setError] = useState('')
  const [isParsing, setIsParsing] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [showWarningConfirm, setShowWarningConfirm] = useState(false)
  const [createdExerciseId, setCreatedExerciseId] = useState(null)
  const [failedUploadName, setFailedUploadName] = useState('')

  const validatedRows = useMemo(() => validateRows(rows, t), [rows, t])
  const stats = useMemo(() => {
    const total = new Set(validatedRows.map((row) => String(row.q_id))).size
    const errorsCount = validatedRows.filter((row) => row.errors.length > 0).length
    const warningsCount = validatedRows.filter((row) => row.warnings.length > 0).length
    return { total, errorsCount, warningsCount }
  }, [validatedRows])

  const visibleRows = useMemo(() => {
    if (filter === 'errors') return validatedRows.filter((row) => row.errors.length > 0)
    if (filter === 'warnings') return validatedRows.filter((row) => row.warnings.length > 0)
    return validatedRows
  }, [filter, validatedRows])

  function handleUpdateRow(id, field, value) {
    setRows((prev) => {
      const targetRow = prev.find((r) => r.id === id)
      if (field === 'type') {
        if (!targetRow) return prev
        const qid = targetRow.q_id
        const otherRows = prev.filter((r) => r.q_id !== qid)
        const insertIndex = prev.findIndex((r) => r.q_id === qid)
        const replacement = newRows(value, qid, targetRow)
        const result = [...otherRows]
        result.splice(insertIndex, 0, ...replacement)
        return result
      }
      return prev.map((row) => {
        const updateWholeQuestion = targetRow?.type === 'boolean'
          && ['section_title', 'local_number'].includes(field)
          && row.q_id === targetRow.q_id
        if (row.id !== id && !updateWholeQuestion) return row
        if (field === 'correct_answer') return { ...row, correct_answer: value }
        return { ...row, [field]: value }
      })
    })
  }

  function handleAddRow() {
    const maxQid = rows.reduce((acc, row) => {
      const parsed = Number.parseInt(String(row.q_id), 10)
      return Number.isNaN(parsed) ? acc : Math.max(acc, parsed)
    }, 0)
    setRows((prev) => [...prev, ...newRows('mcq', String(maxQid + 1))])
  }

  function handleReorder(newRows) {
    setRows(newRows)
  }

  function handleDeleteRow(id) {
    const targetRow = rows.find((r) => r.id === id)
    if (!targetRow) return
    if (targetRow.type === 'boolean') {
      setRows((prev) => prev.filter((r) => !(r.type === 'boolean' && r.q_id === targetRow.q_id)))
    } else {
      setRows((prev) => prev.filter((row) => row.id !== id))
    }
  }

  async function handleParseSchema() {
    if (!answerFile) return
    setIsParsing(true)
    setError('')
    try {
      const sourceText = await extractTextFromPdf(answerFile)
      if (!sourceText || sourceText.length < 10) {
        throw new Error(t('teacher.create.unreadablePdf'))
      }
      const response = await parseExerciseSchema(token, { source_text: sourceText })
      const makeId = () =>
        typeof crypto !== 'undefined' && crypto.randomUUID
          ? crypto.randomUUID()
          : Math.random().toString(36).slice(2)
      const parsedRows = response.data.schema.map((row) => {
        const confidence = Number.isFinite(row.confidence) ? row.confidence : 0
        return {
          id: makeId(),
          q_id: String(row.q_id),
          section_key: row.section_key ?? 'main',
          section_title: row.section_title ?? null,
          local_number: String(row.local_number ?? row.q_id),
          sub_id: row.sub_id ?? null,
          type: row.type,
          correct_answer: confidence >= LOW_CONFIDENCE_THRESHOLD
            ? (row.type === 'boolean' ? row.correct_answer : normalizeAnswer(row.type, row.correct_answer))
            : '',
          confidence,
        }
      })
      setRows(parsedRows.length > 0 ? parsedRows : newRows('mcq', '1'))
    } catch (parseError) {
      setError(parseError.message)
    } finally {
      setIsParsing(false)
    }
  }

  async function uploadFiles(exerciseId) {
    const files = [
      { file: exerciseFile, file_type: 'exercise_pdf' },
      { file: answerFile, file_type: 'solution_pdf' },
    ].filter((entry) => Boolean(entry.file))
    for (const entry of files) {
      try {
        const createResponse = await createExerciseFileUpload(token, exerciseId, {
          file_type: entry.file_type,
          file_name: entry.file.name,
        })
        await uploadExerciseFile(token, exerciseId, createResponse.data, entry.file)
      } catch (uploadError) {
        const failure = new Error(uploadError?.message || t('teacher.create.uploadFailed'), { cause: uploadError })
        failure.failedFileName = entry.file.name
        throw failure
      }
    }
  }

  async function saveExercise() {
    setIsSaving(true)
    setError('')
    try {
      const payload = {
        title: title.trim(),
        grades,
        is_timed: isTimed,
        duration_minutes: isTimed ? Number(durationMinutes) : 0,
        schema: toSchemaPayload(validatedRows),
        extract_model: null,
      }
      const createResponse = await createExercise(token, payload)
      const exerciseId = createResponse.data.id
      try {
        await uploadFiles(exerciseId)
      } catch (uploadError) {
        setCreatedExerciseId(exerciseId)
        setFailedUploadName(uploadError.failedFileName || '')
        setIsSaving(false)
        return
      }
      navigate(
        exerciseFile ? `/teacher/exercises/${exerciseId}` : '/teacher/exercises',
        {
          replace: true,
          state: exerciseFile ? { generateQuestionViews: true } : undefined,
        },
      )
    } catch (saveError) {
      setError(saveError.message)
      setIsSaving(false)
    }
  }

  async function handleSubmit(event) {
    event.preventDefault()
    setError('')

    if (!title.trim()) { setError(t('teacher.create.titleRequired')); return }
    if (grades.length === 0) { setError(t('common.gradeRequired')); return }
    if (isTimed && (!durationMinutes || Number(durationMinutes) <= 0)) {
      setError(t('teacher.create.durationInvalid')); return
    }
    if (validatedRows.length === 0) { setError(t('teacher.create.questionRequired')); return }
    if (stats.errorsCount > 0) { setError(t('teacher.create.fixErrors')); return }
    if (!exerciseFile || !answerFile) { setError(t('teacher.create.filesRequired')); return }
    if (stats.warningsCount > 0) { setShowWarningConfirm(true); return }

    await saveExercise()
  }

  if (createdExerciseId) {
    return (
      <Card className="max-w-2xl border-destructive/50">
        <CardHeader>
          <h1 className="text-xl font-semibold">{t('teacher.create.partialTitle')}</h1>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            {failedUploadName ? t('teacher.create.partialNamed', { name: failedUploadName }) : t('teacher.create.partialGeneric')}
          </p>
          <div className="flex flex-wrap gap-2">
            <Button asChild><Link to={`/teacher/exercises/${createdExerciseId}`}>{t('teacher.create.openCreated')}</Link></Button>
            <Button asChild variant="outline"><Link to="/teacher/exercises">{t('teacher.create.back')}</Link></Button>
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">{t('teacher.create.title')}</h1>
        <p className="text-sm text-muted-foreground">{t('teacher.create.description')}</p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Metadata card */}
        <Card>
          <CardContent className="pt-5">
            <div className="grid grid-cols-[minmax(0,1fr)] gap-6 md:grid-cols-2">
              {/* Title — required */}
              <div className="md:col-span-2 space-y-2">
                <Label htmlFor="title">
                  {t('teacher.create.titleLabel')} <span aria-hidden="true" className="text-destructive">*</span>
                </Label>
                <Input
                  id="title"
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                />
              </div>

              <GradeDropdown
                id="exercise-grades"
                className="max-w-md md:col-span-2"
                legend={t('common.gradeAccess')}
                description={t('common.gradeAccessDescription')}
                value={grades}
                onChange={setGrades}
                disabled={isSaving}
              />

              {/* Timed mode toggle */}
              <div className="space-y-2">
                <Label>{t('teacher.create.mode')}</Label>
                <div className="flex h-10 items-center justify-between rounded-md border bg-background px-3">
                  <span className="text-sm">{isTimed ? t('teacher.create.timedMode') : t('teacher.create.untimedMode')}</span>
                  <Switch
                    id="timedToggle"
                    aria-label={t('teacher.create.timedToggle')}
                    checked={isTimed}
                    onCheckedChange={setIsTimed}
                  />
                </div>
              </div>

              {/* Duration — required when timed, with quick-select presets */}
              <div className="space-y-2">
                <Label htmlFor="duration">
                  {t('teacher.create.duration')}{isTimed && <span aria-hidden="true" className="text-destructive"> *</span>}
                </Label>
                <div className="flex flex-col gap-2 sm:flex-row">
                  <Input
                    id="duration"
                    type="number"
                    value={durationMinutes}
                    onChange={(e) => setDurationMinutes(e.target.value)}
                    disabled={!isTimed}
                    className="w-full sm:w-24"
                  />
                  {isTimed && (
                    <div className="grid w-full flex-1 grid-cols-3 gap-1.5" role="group" aria-label={t('teacher.create.presets')}>
                      {[60, 90, 120].map((mins) => (
                        <Button
                          key={mins}
                          type="button"
                          variant={Number(durationMinutes) === mins ? 'default' : 'outline'}
                          size="sm"
                          className="h-10 px-2 text-sm"
                          onClick={() => setDurationMinutes(mins)}
                        >
                          {formatDuration(mins, i18n.resolvedLanguage)}
                        </Button>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* Exercise PDF upload */}
              <div data-testid="exercise-pdf-upload" className="space-y-2 rounded-[var(--sc-component-control-shape)] border border-primary/20 bg-sc-primary-container p-4 text-sc-on-primary-container">
                <Label htmlFor="exerciseFile" className="gap-2">
                  <FileText aria-hidden="true" className="size-4" />
                  {t('teacher.create.exercisePdf')} <span aria-hidden="true" className="text-destructive">*</span>
                </Label>
                <FileDropzone
                  id="exerciseFile"
                  accept=".pdf"
                  hint={t('teacher.file.pdfOnly')}
                  file={exerciseFile}
                  onChange={setExerciseFile}
                />
                <p className="text-xs text-sc-on-primary-container/80">
                  {t('teacher.create.exercisePdfHint')}
                </p>
              </div>

              {/* Answer PDF upload + answer extraction grouped as related actions */}
              <div data-testid="answer-pdf-upload" className="space-y-2 rounded-[var(--sc-component-control-shape)] border border-[var(--sc-tertiary)]/20 bg-sc-tertiary-container p-4 text-sc-on-tertiary-container">
                <Label htmlFor="answerFile" className="gap-2">
                  <FileCheck2 aria-hidden="true" className="size-4" />
                  {t('teacher.create.answerPdf')} <span aria-hidden="true" className="text-destructive">*</span>
                </Label>
                <FileDropzone
                  id="answerFile"
                  accept=".pdf"
                  hint={t('teacher.file.pdfOnly')}
                  file={answerFile}
                  onChange={setAnswerFile}
                />
                <p className="text-xs text-sc-on-tertiary-container/80">
                  {t('teacher.create.answerPdfHint')}
                </p>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={!answerFile || isParsing}
                  onClick={handleParseSchema}
                  className="w-full mt-2"
                >
                  {isParsing ? (
                    <>
                      <Spinner className="mr-1.5" aria-label={t('common.loading')} />
                      {t('teacher.create.reading')}
                    </>
                  ) : (
                    t('teacher.create.readAnswers')
                  )}
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Schema table card */}
        <Card>
          <CardHeader className="border-b px-4 py-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
                <span className="text-muted-foreground">{t('teacher.create.questions', { count: stats.total })}</span>
                <span className="text-destructive">{t('teacher.create.errors', { count: stats.errorsCount })}</span>
                <span className="text-amber-600">{t('teacher.create.warnings', { count: stats.warningsCount })}</span>
              </div>
              <div className="grid w-full grid-cols-2 gap-2 sm:flex sm:w-auto">
                {['all', 'errors', 'warnings'].map((f) => (
                  <Button
                    key={f}
                    type="button"
                    size="sm"
                    variant={filter === f ? 'default' : 'outline'}
                    onClick={() => setFilter(f)}
                  >
                    {t(`teacher.create.${f === 'all' ? 'all' : `${f}Filter`}`)}
                  </Button>
                ))}
                <Button type="button" variant="outline" size="sm" onClick={handleAddRow}>
                  {t('teacher.create.addQuestion')}
                </Button>
              </div>
            </div>
          </CardHeader>
          <SchemaTable
            rows={visibleRows}
            onUpdateRow={handleUpdateRow}
            onDeleteRow={handleDeleteRow}
            onReorder={filter === 'all' ? handleReorder : undefined}
            showConfidence
          />
        </Card>

        {error && <p className="text-sm text-destructive">{error}</p>}

        <div className="flex justify-end">
          <Button type="submit" disabled={isSaving}>
            {isSaving ? t('teacher.create.saving') : t('teacher.create.save')}
          </Button>
        </div>
      </form>

      {/* Warning confirm dialog */}
      <Dialog open={showWarningConfirm} onOpenChange={setShowWarningConfirm}>
        <DialogContent closeLabel={t('common.close')}>
          <DialogHeader>
            <DialogTitle>{t('teacher.create.warningTitle')}</DialogTitle>
            <DialogDescription>
              {t('teacher.create.warningDescription', { count: stats.warningsCount, threshold: LOW_CONFIDENCE_THRESHOLD })}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowWarningConfirm(false)}>{t('teacher.create.cancel')}</Button>
            <Button onClick={() => { setShowWarningConfirm(false); saveExercise() }}>{t('teacher.create.continue')}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
