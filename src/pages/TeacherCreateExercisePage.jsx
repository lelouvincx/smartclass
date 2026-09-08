import React, { useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useNavigate } from 'react-router-dom'
import {
  createExercise,
  createExerciseFileUpload,
  createQuestionAssetSet,
  getExercise,
  parseExerciseSchema,
  updateExercise,
  uploadGeneratedQuestionAsset,
  uploadExerciseFile,
} from '@/lib/api'
import { useAuth } from '@/lib/auth-context'
import {
  extractDetailedAnswerKeySchema,
  extractGreenHighlightedAnswerSchema,
  prepareAnswerPdfForParsing,
} from '@/lib/pdf'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { Switch } from '@/components/ui/switch'
import { SegmentedButton, SegmentedButtonGroup } from '@/components/ui/segmented-button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'
import { cn } from '@/lib/utils'
import { FileCheck2, FileText } from '@/components/material-symbol'
import { Spinner } from '@/components/ui/spinner'
import { SchemaTable } from '@/components/schema-table'
import AnswerParseProgress from '@/components/answer-parse-progress'
import { GradeDropdown } from '@/components/grade-checkbox-group'
import FileDropzone from '@/components/file-dropzone'
import { formatDuration } from '@/lib/format'
import { AttemptLimitField } from '@/components/attempt-limit-field'
import ScoreAllocationCard from '@/components/score-allocation-card'
import { applyScoreAllocation } from '@/lib/score-allocation'
import QuestionAssetWorkflow from '@/components/question-asset-workflow'
import { ProgressIndicator } from '@/design-system/progress-indicator'
import { generateQuestionAssets } from '@/lib/question-generation'
import ScrollToTopButton from '@/components/scroll-to-top-button'
import ScoreAllocationInline from '@/components/score-allocation-inline'

const LOW_CONFIDENCE_THRESHOLD = 0.75
const BOOLEAN_SUB_IDS = ['a', 'b', 'c', 'd']

// --- Normalization helpers ---

function makeRowId() {
  return typeof crypto !== 'undefined' && crypto.randomUUID
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2)
}

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
  const missingPreviousBySource = missingPreviousSourceNumbers(rows)

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
    if (missingPreviousBySource.has(`${row.section_key ?? 'main'}:${localNumber}`)) {
      warnings.push(t('teacher.schema.contiguousLocalNumber'))
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

    if (row.confidence === null) {
      warnings.push(t('teacher.schema.unscored'))
    } else if ((row.confidence ?? 1) < LOW_CONFIDENCE_THRESHOLD) {
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

function missingPreviousSourceNumbers(rows) {
  const numbersBySection = new Map()
  for (const row of rows) {
    const localNumber = Number.parseInt(String(row.local_number ?? row.q_id), 10)
    if (Number.isNaN(localNumber) || localNumber <= 0) continue
    const sectionKey = row.section_key ?? 'main'
    if (!numbersBySection.has(sectionKey)) numbersBySection.set(sectionKey, new Set())
    numbersBySection.get(sectionKey).add(localNumber)
  }

  const invalidRows = new Set()
  for (const [sectionKey, numbers] of numbersBySection) {
    const ordered = [...numbers].sort((a, b) => a - b)
    for (const number of ordered) {
      if (number === 1 || numbers.has(number - 1)) continue
      invalidRows.add(`${sectionKey}:${number}`)
    }
  }
  return invalidRows
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
        max_score_hundredths: row.max_score_hundredths ?? null,
      }
    }
    return {
      q_id: Number.parseInt(String(row.q_id), 10),
      ...identity,
      type: row.type,
      correct_answer: normalizeAnswer(row.type, row.correct_answer),
      max_score_hundredths: row.max_score_hundredths ?? null,
    }
  })
}

function uniqueQuestionDescriptors(rows) {
  const byId = new Map()
  for (const row of rows || []) {
    const qId = Number.parseInt(String(row.q_id), 10)
    if (!Number.isSafeInteger(qId) || qId <= 0 || byId.has(qId)) continue
    byId.set(qId, {
      q_id: qId,
      section_key: row.section_key ?? 'main',
      section_title: row.section_title ?? null,
      local_number: Number.parseInt(String(row.local_number ?? row.q_id), 10),
    })
  }
  return [...byId.values()]
}

function groupPreviewAssets(questionDescriptors, assets) {
  return questionDescriptors.map(descriptor => ({
    ...descriptor,
    assets: (assets || []).filter(asset => asset.qId === descriptor.q_id),
  }))
}

function answerPagePreviewAssets(questionDescriptors, preparedAnswerPdf) {
  const pageFile = preparedAnswerPdf?.page_files?.[0]
  const pageNumber = preparedAnswerPdf?.page_manifest?.[0]?.page_number ?? 1
  if (!pageFile) return []
  return questionDescriptors.map(descriptor => ({
    qId: descriptor.q_id,
    segmentIndex: 0,
    sourcePage: pageNumber,
    blob: pageFile,
    fileName: `answer-page-${pageNumber}-question-${descriptor.q_id}.png`,
  }))
}

function BlobPreviewImage({ asset, label }) {
  const [source, setSource] = useState('')

  React.useEffect(() => {
    const objectUrl = URL.createObjectURL(asset.blob)
    setSource(objectUrl)
    return () => URL.revokeObjectURL(objectUrl)
  }, [asset.blob])

  if (!source) {
    return (
      <div className="flex min-h-32 items-center justify-center rounded-[var(--sc-component-card-shape)] border bg-muted/40 p-4" aria-label={label}>
        <ProgressIndicator indeterminate className="max-w-48" />
      </div>
    )
  }

  return (
    <div className="max-h-80 overflow-auto rounded-[var(--sc-component-card-shape)] border bg-white">
      <img src={source} alt="" aria-label={label} className="h-auto w-full object-contain" />
    </div>
  )
}

function PreviewAnswerReview({ rows, onUpdateRow }) {
  const { t } = useTranslation()

  if (rows.length === 0) {
    return <p className="text-sm text-muted-foreground">{t('teacher.questionViews.noAutomaticAnswer')}</p>
  }

  return (
    <div className="space-y-4">
      <h4 className="font-semibold">{t('teacher.questionViews.answerReviewTitle')}</h4>
      <div className="divide-y">
        {rows.map((row) => {
          const labelNumber = row.sub_id ? `${row.q_id}${row.sub_id}` : row.q_id
          const fieldId = `preview-answer-${row.id}`
          const errorId = `${fieldId}-error`
          const invalid = row.errors?.length > 0
          return (
            <div key={row.id} className="space-y-3 py-3 first:pt-0 last:pb-0">
              <div>
                <p className="text-sm font-medium">
                  {row.sub_id
                    ? t('teacher.questionViews.answerPart', { number: row.local_number ?? row.q_id, part: row.sub_id })
                    : t('teacher.questionViews.question', { number: row.local_number ?? row.q_id })}
                </p>
                <p className="text-xs text-muted-foreground">
                  {row.confidence === null
                    ? t('teacher.schema.unscored')
                    : `${Math.round((row.confidence ?? 1) * 100)}%`}
                </p>
              </div>
              <div className="space-y-1">
                <Label htmlFor={fieldId} className="text-xs font-medium text-muted-foreground">
                  {t('teacher.questionViews.currentAnswer')}
                </Label>
                {row.type === 'mcq' ? (
                  <Select
                    value={row.correct_answer}
                    onValueChange={value => onUpdateRow(row.id, 'correct_answer', value)}
                  >
                    <SelectTrigger
                      id={fieldId}
                      className="w-32 px-3 [&_svg]:!size-5"
                      aria-label={t('teacher.schema.correctAnswerAria', { number: labelNumber })}
                      aria-invalid={invalid}
                      aria-describedby={invalid ? errorId : undefined}
                    >
                      <SelectValue placeholder="-" />
                    </SelectTrigger>
                    <SelectContent>
                      {['A', 'B', 'C', 'D'].map(value => (
                        <SelectItem key={value} value={value}>{value}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                ) : row.type === 'boolean' ? (
                  <Select
                    value={row.correct_answer}
                    onValueChange={value => onUpdateRow(row.id, 'correct_answer', value)}
                  >
                    <SelectTrigger
                      id={fieldId}
                      className="w-32 px-3 [&_svg]:!size-5"
                      aria-label={t('teacher.schema.correctAnswerAria', { number: labelNumber })}
                      aria-invalid={invalid}
                      aria-describedby={invalid ? errorId : undefined}
                    >
                      <SelectValue placeholder="-" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="1">{t('teacher.schema.true')}</SelectItem>
                      <SelectItem value="0">{t('teacher.schema.false')}</SelectItem>
                    </SelectContent>
                  </Select>
                ) : (
                  <Input
                    id={fieldId}
                    value={row.correct_answer}
                    inputMode="decimal"
                    onChange={event => onUpdateRow(row.id, 'correct_answer', event.target.value)}
                    aria-label={t('teacher.schema.correctAnswerAria', { number: labelNumber })}
                    aria-invalid={invalid}
                    aria-describedby={invalid ? errorId : undefined}
                    className="min-h-12 w-32"
                  />
                )}
                {invalid ? (
                  <p id={errorId} className="text-xs text-destructive">{row.errors[0]}</p>
                ) : row.warnings?.length > 0 ? (
                  <p className="text-xs text-amber-600">{row.warnings[0]}</p>
                ) : (
                  <p className="text-xs text-emerald-700 dark:text-emerald-400">{t('teacher.schema.valid')}</p>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// --- Row factory ---

function newRows(type, nextQid = '', descriptor = {}) {
  if (type === 'boolean') {
    return BOOLEAN_SUB_IDS.map((sub_id) => ({
      id: makeRowId(),
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
    id: makeRowId(),
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

function fillMissingSourceNumberRows(rows) {
  const sections = []
  const bySection = new Map()
  for (const row of rows) {
    const sectionKey = row.section_key ?? 'main'
    if (!bySection.has(sectionKey)) {
      const section = {
        key: sectionKey,
        title: row.section_title ?? null,
        rows: [],
      }
      bySection.set(sectionKey, section)
      sections.push(section)
    }
    bySection.get(sectionKey).rows.push(row)
  }

  const expandedRows = sections.flatMap((section) => {
    const rowsByLocal = new Map()
    for (const row of section.rows) {
      const localNumber = Number.parseInt(String(row.local_number ?? row.q_id), 10)
      if (!Number.isSafeInteger(localNumber) || localNumber <= 0) return section.rows
      if (!rowsByLocal.has(localNumber)) rowsByLocal.set(localNumber, [])
      rowsByLocal.get(localNumber).push(row)
    }
    if (rowsByLocal.size === 0) return section.rows

    const orderedLocalNumbers = [...rowsByLocal.keys()].sort((left, right) => left - right)
    const expanded = []
    for (let localNumber = orderedLocalNumbers[0]; localNumber <= orderedLocalNumbers.at(-1); localNumber += 1) {
      const matchingRows = rowsByLocal.get(localNumber)
      if (matchingRows) {
        expanded.push(...matchingRows)
      } else {
        expanded.push({
          id: makeRowId(),
          q_id: `missing:${section.key}:${localNumber}`,
          section_key: section.key,
          section_title: section.title,
          local_number: String(localNumber),
          sub_id: null,
          type: 'mcq',
          correct_answer: '',
          confidence: null,
        })
      }
    }
    return expanded
  })

  const renumberedQids = new Map()
  let nextQid = 1
  return expandedRows.map((row) => {
    if (!renumberedQids.has(row.q_id)) {
      renumberedQids.set(row.q_id, String(nextQid))
      nextQid += 1
    }
    return { ...row, q_id: renumberedQids.get(row.q_id) }
  })
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
  const [maxAttempts, setMaxAttempts] = useState(1)
  const [allowAnswerPdfDownload, setAllowAnswerPdfDownload] = useState(false)
  const [exerciseFile, setExerciseFile] = useState(null)
  const [answerFile, setAnswerFile] = useState(null)
  const [rows, setRows] = useState([])
  const [filter, setFilter] = useState('all')
  const [error, setError] = useState('')
  const [isParsing, setIsParsing] = useState(false)
  const [answerParseProgress, setAnswerParseProgress] = useState(null)
  const [isSaving, setIsSaving] = useState(false)
  const [showWarningConfirm, setShowWarningConfirm] = useState(false)
  const [createdExerciseId, setCreatedExerciseId] = useState(null)
  const [createdExercise, setCreatedExercise] = useState(null)
  const [questionViewGenerationKey, setQuestionViewGenerationKey] = useState(0)
  const [failedUploadName, setFailedUploadName] = useState('')
  const [questionPreview, setQuestionPreview] = useState({ phase: 'idle', error: '', progress: null, draft: null })
  const [allocationMode, setAllocationMode] = useState('automatic')
  const [customScores, setCustomScores] = useState({})
  const allocationRef = useRef(null)

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
  const questionPreviewGroups = useMemo(() => {
    if (!questionPreview.draft) return []
    return groupPreviewAssets(questionPreview.draft.descriptors, questionPreview.draft.previewAssets)
  }, [questionPreview.draft])
  const answerPreviewGroups = useMemo(() => {
    if (!questionPreview.draft) return new Map()
    return new Map(groupPreviewAssets(questionPreview.draft.descriptors, questionPreview.draft.answerPreviewAssets)
      .map(group => [group.q_id, group.assets]))
  }, [questionPreview.draft])
  const previewAnswerRowsByQuestion = useMemo(() => {
    const grouped = new Map()
    for (const row of validatedRows) {
      const qId = Number.parseInt(String(row.q_id), 10)
      if (!Number.isSafeInteger(qId)) continue
      grouped.set(qId, [...(grouped.get(qId) || []), row])
    }
    return grouped
  }, [validatedRows])

  function clearQuestionPreview() {
    setQuestionPreview({ phase: 'idle', error: '', progress: null, draft: null })
  }

  function handleUpdateRow(id, field, value) {
    if (field !== 'correct_answer') clearQuestionPreview()
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
    clearQuestionPreview()
    const maxQid = rows.reduce((acc, row) => {
      const parsed = Number.parseInt(String(row.q_id), 10)
      return Number.isNaN(parsed) ? acc : Math.max(acc, parsed)
    }, 0)
    setRows((prev) => [...prev, ...newRows('mcq', String(maxQid + 1))])
  }

  function handleReorder(newRows) {
    clearQuestionPreview()
    setRows(newRows)
  }

  function handleDeleteRow(id) {
    clearQuestionPreview()
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
    clearQuestionPreview()
    setAnswerParseProgress({ stage: 'reading', progress: 0 })
    try {
      const greenSchema = await extractGreenHighlightedAnswerSchema(answerFile, {
        onProgress: ({ stage, current, total }) => setAnswerParseProgress({
          stage,
          progress: total ? current / total : 0,
        }),
      })
      if (greenSchema.length > 0) {
        setAnswerParseProgress({ stage: 'applying', progress: 0 })
        const editableRows = schemaRowsToEditableRows(greenSchema)
        setRows(editableRows)
        setAnswerParseProgress({ stage: 'complete', progress: 1 })
        await prepareQuestionPreview(editableRows)
        return
      }

      const detailedAnswerSchema = await extractDetailedAnswerKeySchema(answerFile, {
        onProgress: ({ stage, current, total }) => setAnswerParseProgress({
          stage,
          progress: total ? current / total : 0,
        }),
      })
      if (detailedAnswerSchema.length > 0) {
        setAnswerParseProgress({ stage: 'applying', progress: 0 })
        const editableRows = schemaRowsToEditableRows(detailedAnswerSchema)
        setRows(editableRows)
        setAnswerParseProgress({ stage: 'complete', progress: 1 })
        await prepareQuestionPreview(editableRows)
        return
      }

      const prepared = await prepareAnswerPdfForParsing(answerFile, {
        onProgress: ({ stage, current, total }) => setAnswerParseProgress({
          stage,
          progress: total ? current / total : 0,
        }),
      })
      setAnswerParseProgress({ stage: 'waiting', progress: 0 })
      const response = await parseExerciseSchema(token, prepared)
      setAnswerParseProgress({ stage: 'applying', progress: 0 })
      const schema = response?.data?.schema
      if (!Array.isArray(schema) || schema.length === 0) {
        const emptySchemaError = new Error(t('teacher.create.unreadablePdf'))
        emptySchemaError.code = 'UNSUPPORTED_DOCUMENT'
        throw emptySchemaError
      }
      const editableRows = schemaRowsToEditableRows(schema)
      setRows(editableRows)
      setAnswerParseProgress({ stage: 'complete', progress: 1 })
      await prepareQuestionPreview(editableRows, prepared)
    } catch (parseError) {
      setError(parseError.recoverable || parseError.code === 'UNSUPPORTED_DOCUMENT'
        ? t('teacher.create.unreadablePdf')
        : parseError.message)
      setAnswerParseProgress(current => ({ ...(current || {}), stage: 'error' }))
    } finally {
      setIsParsing(false)
    }
  }

  async function prepareQuestionPreview(nextRows, preparedAnswerPdf = null) {
    if (!exerciseFile) {
      setQuestionPreview({
        phase: 'error',
        error: t('teacher.create.questionPreviewExerciseRequired'),
        progress: null,
        draft: null,
      })
      return
    }

    const descriptors = uniqueQuestionDescriptors(nextRows)
    if (descriptors.length === 0) return

    setQuestionPreview({ phase: 'generating', error: '', progress: { stage: 'reading', current: 0, total: 1 }, draft: null })
    try {
      const generated = await generateQuestionAssets(exerciseFile, descriptors, {
        schemaRows: toSchemaPayload(nextRows),
        createPreviewAssets: true,
        onProgress: progress => setQuestionPreview(current => ({ ...current, progress })),
      })
      let answerPreviewAssets = []
      try {
        const answerGeneration = await generateQuestionAssets(answerFile, descriptors, {
          schemaRows: toSchemaPayload(nextRows),
          createAssets: false,
          createPreviewAssets: true,
        })
        answerPreviewAssets = answerGeneration.previewAssets || []
      } catch {
        answerPreviewAssets = []
      }
      if (answerPreviewAssets.length === 0) {
        answerPreviewAssets = answerPagePreviewAssets(descriptors, preparedAnswerPdf)
      }
      setQuestionPreview({
        phase: 'ready',
        error: '',
        progress: null,
        draft: {
          descriptors,
          detectorVersion: generated.detectorVersion,
          detectionMethod: generated.detectionMethod,
          assets: generated.assets,
          previewAssets: generated.previewAssets || generated.assets,
          answerPreviewAssets,
        },
      })
    } catch (generationError) {
      setQuestionPreview({
        phase: 'error',
        error: questionDetectionErrorMessage(generationError),
        progress: null,
        draft: null,
      })
    }
  }

  function questionDetectionErrorMessage(error) {
    if (error?.code === 'SCANNED_OR_IMAGE_ONLY_PAGE') return t('teacher.questionViews.scannedUnsupported')
    if (error?.code === 'UNEXPECTED_QUESTION_MARKER') {
      return t('teacher.questionViews.unexpectedQuestionMarker', { number: error.details?.qId ?? '' })
    }
    if (error?.code === 'MISSING_QUESTION_MARKER') {
      return t('teacher.questionViews.missingQuestionMarker', { number: error.details?.qId ?? '' })
    }
    return error?.message || t('teacher.questionViews.generationFailed')
  }

  function schemaRowsToEditableRows(schema) {
    return fillMissingSourceNumberRows(schema.map((row) => ({
      id: makeRowId(),
      q_id: String(row.q_id),
      section_key: row.section_key ?? 'main',
      section_title: row.section_title ?? null,
      local_number: String(row.local_number ?? row.q_id),
      sub_id: row.sub_id ?? null,
      type: row.type,
      correct_answer: row.type === 'boolean'
        ? (row.correct_answer ?? '')
        : normalizeAnswer(row.type, row.correct_answer),
      confidence: row.confidence ?? null,
    })))
  }

  async function uploadFiles(exerciseId) {
    const uploaded = {}
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
        const uploadResponse = await uploadExerciseFile(token, exerciseId, createResponse.data, entry.file)
        uploaded[entry.file_type] = uploadResponse.data
      } catch (uploadError) {
        const failure = new Error(uploadError?.message || t('teacher.create.uploadFailed'), { cause: uploadError })
        failure.failedFileName = entry.file.name
        throw failure
      }
    }
    return uploaded
  }

  async function uploadPreparedQuestionViews(exerciseId, uploadedFiles, schemaPayload) {
    const draft = questionPreview.draft
    if (!draft) return null

    const sourceFileId = uploadedFiles.exercise_pdf?.file_id
    const answerSourceFileId = uploadedFiles.solution_pdf?.file_id
    if (!sourceFileId || !answerSourceFileId) return null

    const created = await createQuestionAssetSet(token, exerciseId, {
      source_file_id: sourceFileId,
      answer_source_file_id: answerSourceFileId,
      answer_parser_status: 'parsed',
      detector_version: draft.detectorVersion,
      detection_method: draft.detectionMethod,
    })
    const setId = created.data.id
    for (const asset of draft.assets) {
      await uploadGeneratedQuestionAsset(token, exerciseId, setId, asset)
    }
    await updateExercise(token, exerciseId, {
      schema: schemaPayload,
      question_asset_set_id: setId,
    })
    return setId
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
        max_attempts: maxAttempts === null ? null : Number(maxAttempts),
        allow_answer_pdf_download: allowAnswerPdfDownload,
        schema: toSchemaPayload(applyScoreAllocation(validatedRows, allocationMode, customScores)),
      }
      const createResponse = await createExercise(token, payload)
      const exerciseId = createResponse.data.id
      let uploadedFiles
      try {
        uploadedFiles = await uploadFiles(exerciseId)
      } catch (uploadError) {
        setCreatedExerciseId(exerciseId)
        setFailedUploadName(uploadError.failedFileName || '')
        setIsSaving(false)
        return
      }
      if (questionPreview.draft) {
        await uploadPreparedQuestionViews(exerciseId, uploadedFiles, payload.schema)
        navigate(`/teacher/exercises/${exerciseId}`, { replace: true })
        return
      }
      const exerciseResponse = await getExercise(exerciseId, token)
      setCreatedExercise(exerciseResponse.data)
      setQuestionViewGenerationKey(key => key + 1)
      setIsSaving(false)
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
    if (maxAttempts !== null && (!Number.isInteger(Number(maxAttempts)) || Number(maxAttempts) <= 0)) {
      setError(t('teacher.attemptLimit.invalid')); return
    }
    if (validatedRows.length === 0) { setError(t('teacher.create.questionRequired')); return }
    if (stats.errorsCount > 0) { setError(t('teacher.create.fixErrors')); return }
    if (!allocationRef.current?.validate()) return
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

  if (createdExercise) {
    return (
      <div className="max-w-5xl">
        <QuestionAssetWorkflow
          exercise={createdExercise}
          token={token}
          autoStartKey={questionViewGenerationKey}
          onActivated={() => navigate(`/teacher/exercises/${createdExercise.id}`, { replace: true })}
          onReplacePdf={() => navigate(`/teacher/exercises/${createdExercise.id}`)}
        />
        <ScrollToTopButton />
      </div>
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
              {/* Title - required */}
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

              <AttemptLimitField
                id="attempt-limit"
                value={maxAttempts}
                onChange={setMaxAttempts}
                disabled={isSaving}
                className="max-w-md md:col-span-2"
              />

              <div className="space-y-2 md:col-span-2">
                <Label htmlFor="answer-pdf-download-toggle">{t('teacher.answerPdfDownload.label')}</Label>
                <div className="flex max-w-md items-center justify-between gap-4 rounded-md border bg-background px-3 py-2">
                  <p id="answer-pdf-download-help" className="text-sm text-muted-foreground">
                    {t('teacher.answerPdfDownload.description')}
                  </p>
                  <Switch
                    id="answer-pdf-download-toggle"
                    checked={allowAnswerPdfDownload}
                    onCheckedChange={setAllowAnswerPdfDownload}
                    aria-describedby="answer-pdf-download-help"
                    disabled={isSaving}
                  />
                </div>
              </div>

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

              {/* Duration - required when timed, with quick-select presets */}
              <div className="space-y-2">
                <Label htmlFor="duration">
                  {t('teacher.create.duration')}{isTimed && <span aria-hidden="true" className="text-destructive"> *</span>}
                </Label>
                <div className="flex flex-col gap-2 sm:flex-row">
                  <Input
                    id="duration"
                    type="number"
                    value={isTimed ? durationMinutes : ''}
                    onChange={(e) => setDurationMinutes(e.target.value)}
                    disabled={!isTimed}
                    className="w-full sm:w-24"
                  />
                  {isTimed && (
                    <SegmentedButtonGroup className="w-full flex-1" role="group" aria-label={t('teacher.create.presets')}>
                      {[60, 90, 120].map((mins) => (
                        <SegmentedButton
                          key={mins}
                          selected={Number(durationMinutes) === mins}
                          onClick={() => setDurationMinutes(mins)}
                        >
                          {formatDuration(mins, i18n.resolvedLanguage)}
                        </SegmentedButton>
                      ))}
                    </SegmentedButtonGroup>
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
                  onChange={(file) => {
                    setExerciseFile(file)
                    clearQuestionPreview()
                  }}
                />
                <p className="text-xs text-sc-on-primary-container/80">
                  {t('teacher.create.exercisePdfHint')}
                </p>
              </div>

              {/* Answer PDF upload */}
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
                  onChange={(file) => {
                    setAnswerFile(file)
                    setAnswerParseProgress(null)
                    setError('')
                    clearQuestionPreview()
                  }}
                />
                <p className="text-xs text-sc-on-tertiary-container/80">
                  {t('teacher.create.answerPdfHint')}
                </p>
              </div>

              <div data-testid="answer-parse-action" className="space-y-3 md:col-span-2">
                <Button
                  type="button"
                  variant="outline"
                  disabled={!answerFile || isParsing}
                  onClick={handleParseSchema}
                  className="w-full"
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
                {answerParseProgress && (
                  <AnswerParseProgress
                    stage={answerParseProgress.stage}
                    stageProgress={answerParseProgress.progress}
                    labels={{
                      reading: t('teacher.answerParse.reading'),
                      rendering: t('teacher.answerParse.rendering'),
                      waiting: t('teacher.answerParse.waiting'),
                      stillWaiting: t('teacher.answerParse.stillWaiting'),
                      applying: t('teacher.answerParse.applying'),
                      complete: t('teacher.answerParse.complete'),
                      error: t('teacher.answerParse.error'),
                    }}
                  />
                )}
              </div>

            </div>
          </CardContent>
        </Card>

        {(questionPreview.phase !== 'idle') && (
          <Card role="region" aria-labelledby="create-question-views-title">
            <CardHeader className="border-b px-5 py-4">
              <div>
                <h2 id="create-question-views-title" className="font-semibold">{t('teacher.questionViews.title')}</h2>
                <p className="mt-0.5 text-sm text-muted-foreground">
                  {t('teacher.create.questionPreviewDescription')}
                </p>
              </div>
            </CardHeader>
            <CardContent className="space-y-4 pt-5">
              {questionPreview.phase === 'generating' && (
                <div className="space-y-2" aria-live="polite">
                  <div className="flex items-center justify-between gap-3 text-sm">
                    <span className="font-medium">
                      {t(`teacher.questionViews.progress.${questionPreview.progress?.stage || 'reading'}`)}
                    </span>
                    <span className="tabular-nums text-muted-foreground">
                      {Math.round(((questionPreview.progress?.current || 0) / (questionPreview.progress?.total || 1)) * 100)}%
                    </span>
                  </div>
                  <ProgressIndicator
                    value={(questionPreview.progress?.current || 0) / (questionPreview.progress?.total || 1)}
                  />
                </div>
              )}
              {questionPreview.phase === 'error' && (
                <div className="rounded-[var(--sc-component-card-shape)] border border-destructive/40 bg-destructive/5 p-4 text-sm text-destructive" role="alert">
                  {questionPreview.error}
                </div>
              )}
              {questionPreview.phase === 'ready' && (
                <ScoreAllocationInline
                  ref={allocationRef}
                  rows={validatedRows}
                  mode={allocationMode}
                  onModeChange={setAllocationMode}
                  values={customScores}
                  onValuesChange={setCustomScores}
                >
                  {({ controls, questionControl }) => (
                    <div className="space-y-4">
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <p className="text-sm text-muted-foreground">
                          {t('teacher.create.questionPreviewReady', { count: questionPreviewGroups.length })}
                        </p>
                        <Button type="button" variant="outline" size="sm" onClick={() => prepareQuestionPreview(rows)}>
                          {t('teacher.questionViews.generateNewPreview')}
                        </Button>
                      </div>
                      {controls}
                      {questionPreviewGroups.map((group) => {
                        const answerAssets = answerPreviewGroups.get(group.q_id) || []
                        const answerRows = previewAnswerRowsByQuestion.get(group.q_id) || []
                        return (
                          <div key={group.q_id} className="rounded-[var(--sc-component-card-shape)] border">
                            <div className="border-b px-4 py-3">
                              <h3 className="font-medium">
                                {group.section_title
                                  ? t('teacher.questionViews.questionInSection', { section: group.section_title, number: group.local_number })
                                  : t('teacher.questionViews.question', { number: group.local_number })}
                              </h3>
                            </div>
                            <div className="grid gap-4 p-4 lg:grid-cols-[minmax(0,3fr)_minmax(14rem,1fr)]">
                              <div className="min-w-0 space-y-4">
                                {group.assets.map((asset, index) => (
                                  <figure key={`${asset.fileName}:${index}`} className="space-y-3">
                                    <figcaption className="text-xs font-medium text-muted-foreground">
                                      {group.assets.length > 1
                                        ? t('teacher.questionViews.exerciseSegment', { current: index + 1, total: group.assets.length })
                                        : t('teacher.questionViews.exerciseCrop')}
                                    </figcaption>
                                    <BlobPreviewImage asset={asset} label={t('teacher.questionViews.exerciseCrop')} />
                                  </figure>
                                ))}
                                {answerAssets.map((asset, index) => (
                                  <figure key={`${asset.fileName}:answer:${index}`} className="space-y-3">
                                    <figcaption className="text-xs font-medium text-muted-foreground">
                                      {answerAssets.length > 1
                                        ? t('teacher.questionViews.answerSegment', { current: index + 1, total: answerAssets.length })
                                        : t('teacher.questionViews.answerCrop')}
                                    </figcaption>
                                    <BlobPreviewImage asset={asset} label={t('teacher.questionViews.answerCrop')} />
                                  </figure>
                                ))}
                              </div>
                              <div className="min-w-0 space-y-4 border-t p-4 lg:border-l lg:border-t-0">
                                <PreviewAnswerReview rows={answerRows} onUpdateRow={handleUpdateRow} />
                                {questionControl(group.q_id)}
                              </div>
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  )}
                </ScoreAllocationInline>
              )}
              {questionPreview.phase !== 'ready' && (
                <ScoreAllocationCard
                  ref={allocationRef}
                  rows={validatedRows}
                  mode={allocationMode}
                  onModeChange={setAllocationMode}
                  values={customScores}
                  onValuesChange={setCustomScores}
                  embedded
                />
              )}
            </CardContent>
          </Card>
        )}

        {questionPreview.phase !== 'ready' && (
          <Card>
            <CardHeader className="border-b px-4 py-3">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
                  <span className="text-muted-foreground">{t('teacher.create.questions', { count: stats.total })}</span>
                  <span className="text-destructive">{t('teacher.create.errors', { count: stats.errorsCount })}</span>
                  <span className="text-amber-600">{t('teacher.create.warnings', { count: stats.warningsCount })}</span>
                </div>
                <div className="grid w-full grid-cols-1 gap-2 sm:flex sm:w-auto sm:items-center">
                  <SegmentedButtonGroup aria-label={t('teacher.schema.status')} className="w-full sm:w-auto">
                    {['all', 'errors', 'warnings'].map((f) => (
                      <SegmentedButton
                        key={f}
                        selected={filter === f}
                        onClick={() => setFilter(f)}
                      >
                        {t(`teacher.create.${f === 'all' ? 'all' : `${f}Filter`}`)}
                      </SegmentedButton>
                    ))}
                  </SegmentedButtonGroup>
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
        )}

        {questionPreview.phase === 'idle' && (
          <ScoreAllocationCard
            ref={allocationRef}
            rows={validatedRows}
            mode={allocationMode}
            onModeChange={setAllocationMode}
            values={customScores}
            onValuesChange={setCustomScores}
          />
        )}

        {error && <p className="text-sm text-destructive">{error}</p>}

        <div className="flex justify-end">
          <Button type="submit" disabled={isSaving}>
            {isSaving ? t('teacher.create.saving') : t('teacher.create.save')}
          </Button>
        </div>
      </form>
      <ScrollToTopButton />

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
