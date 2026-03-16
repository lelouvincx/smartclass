import React, { useMemo, useState } from 'react'
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

function validateRows(rows) {
  const qidCounts = new Map()
  rows.forEach((row) => {
    const key = String(row.q_id)
    if (!key) return
    qidCounts.set(key, (qidCounts.get(key) || 0) + 1)
  })

  const booleanSubIds = new Map()
  rows.forEach((row) => {
    if (row.type === 'boolean' && row.sub_id) {
      if (!booleanSubIds.has(String(row.q_id))) {
        booleanSubIds.set(String(row.q_id), new Set())
      }
      booleanSubIds.get(String(row.q_id)).add(row.sub_id)
    }
  })

  return rows.map((row) => {
    const errors = []
    const warnings = []
    const qid = Number.parseInt(String(row.q_id), 10)

    if (!row.q_id || Number.isNaN(qid) || qid <= 0) {
      errors.push('q_id must be a positive integer')
    }

    if (row.type === 'boolean') {
      if (!row.sub_id || !BOOLEAN_SUB_IDS.includes(row.sub_id)) {
        errors.push('boolean sub_id must be a, b, c, or d')
      } else if (!['0', '1'].includes(row.correct_answer)) {
        errors.push('select True (1) or False (0)')
      }
    } else {
      if (qidCounts.get(String(row.q_id)) > 1) {
        errors.push('q_id must be unique')
      }

      const answer = normalizeAnswer(row.type, row.correct_answer)
      if (!answer) {
        errors.push('correct_answer is required')
      } else if (row.type === 'mcq' && !['A', 'B', 'C', 'D'].includes(answer)) {
        errors.push('MCQ answer must be A, B, C, or D')
      } else if (row.type === 'numeric' && Number.isNaN(Number(answer))) {
        errors.push('Numeric answer must be a valid number')
      }
    }

    if ((row.confidence ?? 1) < LOW_CONFIDENCE_THRESHOLD) {
      warnings.push('Low confidence, please verify')
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
    if (row.type === 'boolean') {
      return {
        q_id: Number.parseInt(String(row.q_id), 10),
        type: 'boolean',
        sub_id: row.sub_id,
        correct_answer: row.correct_answer,
      }
    }
    return {
      q_id: Number.parseInt(String(row.q_id), 10),
      type: row.type,
      correct_answer: normalizeAnswer(row.type, row.correct_answer),
    }
  })
}

// --- Row factory ---

function newRows(type, nextQid = '') {
  const makeId = () =>
    typeof crypto !== 'undefined' && crypto.randomUUID
      ? crypto.randomUUID()
      : Math.random().toString(36).slice(2)

  if (type === 'boolean') {
    return BOOLEAN_SUB_IDS.map((sub_id) => ({
      id: makeId(),
      q_id: nextQid,
      sub_id,
      type: 'boolean',
      correct_answer: '',
      confidence: 1,
    }))
  }

  return [{
    id: makeId(),
    q_id: nextQid,
    sub_id: null,
    type,
    correct_answer: '',
    confidence: 1,
  }]
}

// --- Main page ---

export default function TeacherCreateExercisePage() {
  const navigate = useNavigate()
  const { token } = useAuth()

  const [title, setTitle] = useState('')
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

  const validatedRows = useMemo(() => validateRows(rows), [rows])
  const stats = useMemo(() => {
    const total = validatedRows.length
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
      if (field === 'type') {
        const targetRow = prev.find((r) => r.id === id)
        if (!targetRow) return prev
        const qid = targetRow.q_id
        const otherRows = prev.filter((r) => r.q_id !== qid)
        const insertIndex = prev.findIndex((r) => r.q_id === qid)
        const replacement = newRows(value, qid)
        const result = [...otherRows]
        result.splice(insertIndex, 0, ...replacement)
        return result
      }
      return prev.map((row) => {
        if (row.id !== id) return row
        if (field === 'correct_answer') return { ...row, correct_answer: value }
        if (field === 'q_id') return { ...row, q_id: value }
        return { ...row, [field]: value }
      })
    })
  }

  function handleUpdateQid(id, value) {
    setRows((prev) => {
      const targetRow = prev.find((r) => r.id === id)
      if (!targetRow) return prev
      if (targetRow.type === 'boolean') {
        const oldQid = targetRow.q_id
        return prev.map((r) =>
          r.type === 'boolean' && r.q_id === oldQid ? { ...r, q_id: value } : r
        )
      }
      return prev.map((r) => r.id === id ? { ...r, q_id: value } : r)
    })
  }

  function handleAddRow() {
    const maxQid = rows.reduce((acc, row) => {
      const parsed = Number.parseInt(String(row.q_id), 10)
      return Number.isNaN(parsed) ? acc : Math.max(acc, parsed)
    }, 0)
    setRows((prev) => [...prev, ...newRows('mcq', String(maxQid + 1))])
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
        throw new Error('Could not extract enough text from PDF. Continue with manual schema entry.')
      }
      const response = await parseExerciseSchema(token, { source_text: sourceText })
      const makeId = () =>
        typeof crypto !== 'undefined' && crypto.randomUUID
          ? crypto.randomUUID()
          : Math.random().toString(36).slice(2)
      const parsedRows = response.data.schema.map((row) => ({
        id: makeId(),
        q_id: String(row.q_id),
        sub_id: row.sub_id ?? null,
        type: row.type,
        correct_answer: row.type === 'boolean' ? row.correct_answer : normalizeAnswer(row.type, row.correct_answer),
        confidence: row.confidence,
      }))
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
      const createResponse = await createExerciseFileUpload(token, exerciseId, {
        file_type: entry.file_type,
        file_name: entry.file.name,
      })
      await uploadExerciseFile(token, exerciseId, createResponse.data, entry.file)
    }
  }

  async function saveExercise() {
    setIsSaving(true)
    setError('')
    try {
      const payload = {
        title: title.trim(),
        is_timed: isTimed,
        duration_minutes: isTimed ? Number(durationMinutes) : 0,
        schema: toSchemaPayload(validatedRows),
      }
      const createResponse = await createExercise(token, payload)
      await uploadFiles(createResponse.data.id)
      navigate('/teacher/exercises', { replace: true })
    } catch (saveError) {
      setError(saveError.message)
      setIsSaving(false)
    }
  }

  async function handleSubmit(event) {
    event.preventDefault()
    setError('')

    if (!title.trim()) { setError('Title is required'); return }
    if (isTimed && (!durationMinutes || Number(durationMinutes) <= 0)) {
      setError('Duration must be a positive number'); return
    }
    if (validatedRows.length === 0) { setError('At least one schema row is required'); return }
    if (stats.errorsCount > 0) { setError('Please fix all schema errors before saving'); return }
    if (stats.warningsCount > 0) { setShowWarningConfirm(true); return }

    await saveExercise()
  }

  // --- Render boolean sub-question row ---

  function renderBooleanSubRow(row) {
    return (
      <tr key={row.id} className="border-t align-top">
        <td className="px-3 py-2">
          {row.sub_id === 'a' ? (
            <Input
              aria-label={`q-id-${row.id}`}
              type="text"
              value={row.q_id}
              onChange={(e) => handleUpdateQid(row.id, e.target.value)}
              className="h-9 w-20"
            />
          ) : (
            <span className="px-2 text-sm text-muted-foreground">{row.q_id}</span>
          )}
        </td>
        <td className="px-3 py-2">
          {row.sub_id === 'a' ? (
            <select
              aria-label={`type-${row.id}`}
              value="boolean"
              onChange={(e) => handleUpdateRow(row.id, 'type', e.target.value)}
              className="h-9 rounded-md border bg-background px-2 text-sm"
            >
              <option value="mcq">mcq</option>
              <option value="boolean">boolean</option>
              <option value="numeric">numeric</option>
            </select>
          ) : (
            <span className="text-sm text-muted-foreground">boolean</span>
          )}
        </td>
        <td className="px-3 py-2">
          <div className="flex items-center gap-3">
            <span className="w-4 text-sm font-medium text-muted-foreground">{row.sub_id}.</span>
            <label className="flex items-center gap-1 text-sm">
              <input
                type="radio"
                name={`bool-${row.id}`}
                value="1"
                checked={row.correct_answer === '1'}
                onChange={() => handleUpdateRow(row.id, 'correct_answer', '1')}
                aria-label={`sub-q ${row.q_id} ${row.sub_id} true`}
              />
              True
            </label>
            <label className="flex items-center gap-1 text-sm">
              <input
                type="radio"
                name={`bool-${row.id}`}
                value="0"
                checked={row.correct_answer === '0'}
                onChange={() => handleUpdateRow(row.id, 'correct_answer', '0')}
                aria-label={`sub-q ${row.q_id} ${row.sub_id} false`}
              />
              False
            </label>
          </div>
        </td>
        <td className="px-3 py-2 text-muted-foreground">{Math.round((row.confidence ?? 1) * 100)}%</td>
        <td className="px-3 py-2">
          {row.errors.length > 0 && <p className="text-xs text-destructive">{row.errors[0]}</p>}
          {row.errors.length === 0 && row.warnings.length > 0 && <p className="text-xs text-amber-600">{row.warnings[0]}</p>}
          {row.errors.length === 0 && row.warnings.length === 0 && <p className="text-xs text-emerald-700 dark:text-emerald-400">Valid</p>}
        </td>
        <td className="px-3 py-2">
          {row.sub_id === 'a' && (
            <Button type="button" variant="ghost" size="sm" onClick={() => handleDeleteRow(row.id)} className="text-destructive hover:text-destructive">
              Delete
            </Button>
          )}
        </td>
      </tr>
    )
  }

  // --- Render standard (mcq/numeric) row ---

  function renderStandardRow(row) {
    return (
      <tr key={row.id} className="border-t align-top">
        <td className="px-3 py-2">
          <Input
            aria-label={`q-id-${row.id}`}
            type="text"
            value={row.q_id}
            onChange={(e) => handleUpdateRow(row.id, 'q_id', e.target.value)}
            className="h-9 w-20"
          />
        </td>
        <td className="px-3 py-2">
          <select
            aria-label={`type-${row.id}`}
            value={row.type}
            onChange={(e) => handleUpdateRow(row.id, 'type', e.target.value)}
            className="h-9 rounded-md border bg-background px-2 text-sm"
          >
            <option value="mcq">mcq</option>
            <option value="boolean">boolean</option>
            <option value="numeric">numeric</option>
          </select>
        </td>
        <td className="px-3 py-2">
          <Input
            aria-label={`answer-${row.id}`}
            type="text"
            value={row.correct_answer}
            onChange={(e) => handleUpdateRow(row.id, 'correct_answer', e.target.value)}
            className="h-9 w-36"
          />
        </td>
        <td className="px-3 py-2 text-muted-foreground">{Math.round((row.confidence ?? 1) * 100)}%</td>
        <td className="px-3 py-2">
          {row.errors.length > 0 && <p className="text-xs text-destructive">{row.errors[0]}</p>}
          {row.errors.length === 0 && row.warnings.length > 0 && <p className="text-xs text-amber-600">{row.warnings[0]}</p>}
          {row.errors.length === 0 && row.warnings.length === 0 && <p className="text-xs text-emerald-700 dark:text-emerald-400">Valid</p>}
        </td>
        <td className="px-3 py-2">
          <Button type="button" variant="ghost" size="sm" onClick={() => handleDeleteRow(row.id)} className="text-destructive hover:text-destructive">
            Delete
          </Button>
        </td>
      </tr>
    )
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Create Exercise</h1>
        <p className="text-sm text-muted-foreground">Upload answer PDF for auto-schema generation, or continue manually.</p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Metadata card */}
        <Card>
          <CardContent className="pt-5">
            <div className="grid gap-4 md:grid-cols-3">
              <div className="md:col-span-2 space-y-1.5">
                <Label htmlFor="title">Exercise title</Label>
                <Input
                  id="title"
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Mode</Label>
                <div className="flex items-center justify-between rounded-md border bg-background p-2">
                  <span className="text-sm">{isTimed ? 'Timed mode' : 'Untimed mode'}</span>
                  <Switch
                    id="timedToggle"
                    aria-label="Timed mode toggle"
                    checked={isTimed}
                    onCheckedChange={setIsTimed}
                  />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="duration">Duration (minutes)</Label>
                <Input
                  id="duration"
                  type="number"
                  value={durationMinutes}
                  onChange={(e) => setDurationMinutes(e.target.value)}
                  disabled={!isTimed}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="exerciseFile">Exercise PDF (optional)</Label>
                <input
                  id="exerciseFile"
                  type="file"
                  accept=".pdf"
                  onChange={(e) => setExerciseFile(e.target.files?.[0] || null)}
                  className="block w-full text-sm"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="answerFile">Answer PDF (recommended)</Label>
                <input
                  id="answerFile"
                  type="file"
                  accept=".pdf"
                  onChange={(e) => setAnswerFile(e.target.files?.[0] || null)}
                  className="block w-full text-sm"
                />
              </div>
              <div className="flex items-end">
                <Button
                  type="button"
                  variant="outline"
                  disabled={!answerFile || isParsing}
                  onClick={handleParseSchema}
                  className="w-full"
                >
                  {isParsing ? 'Generating schema...' : '✨ Generate Schema'}
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        {!answerFile && (
          <p className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800 dark:border-amber-800 dark:bg-amber-950/50 dark:text-amber-300">
            Manual schema entry is available, but uploading an answer PDF is recommended for faster setup.
          </p>
        )}

        {/* Schema table card */}
        <Card>
          <CardHeader className="border-b px-4 py-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-3 text-sm">
                <span className="text-muted-foreground">Questions: <strong className="text-foreground">{stats.total}</strong></span>
                <span className="text-destructive">Errors: <strong>{stats.errorsCount}</strong></span>
                <span className="text-amber-600">Warnings: <strong>{stats.warningsCount}</strong></span>
              </div>
              <div className="flex gap-2">
                {['all', 'errors', 'warnings'].map((f) => (
                  <Button
                    key={f}
                    type="button"
                    size="sm"
                    variant={filter === f ? 'default' : 'outline'}
                    onClick={() => setFilter(f)}
                  >
                    {f.charAt(0).toUpperCase() + f.slice(1)}
                  </Button>
                ))}
                <Button type="button" variant="outline" size="sm" onClick={handleAddRow}>
                  Add Row
                </Button>
              </div>
            </div>
          </CardHeader>
          <div className="overflow-x-auto">
            <table className="min-w-full border-collapse text-sm">
              <thead>
                <tr className="bg-muted text-left text-muted-foreground">
                  <th className="px-3 py-2">q_id</th>
                  <th className="px-3 py-2">type</th>
                  <th className="px-3 py-2">correct_answer</th>
                  <th className="px-3 py-2">confidence</th>
                  <th className="px-3 py-2">status</th>
                  <th className="px-3 py-2">actions</th>
                </tr>
              </thead>
              <tbody>
                {visibleRows.map((row) =>
                  row.type === 'boolean' ? renderBooleanSubRow(row) : renderStandardRow(row)
                )}
              </tbody>
            </table>
          </div>
        </Card>

        {error && <p className="text-sm text-destructive">{error}</p>}

        <div className="flex justify-end">
          <Button type="submit" disabled={isSaving}>
            {isSaving ? 'Saving...' : 'Save Exercise'}
          </Button>
        </div>
      </form>

      {/* Warning confirm dialog */}
      <Dialog open={showWarningConfirm} onOpenChange={setShowWarningConfirm}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Save with warnings?</DialogTitle>
            <DialogDescription>
              There are {stats.warningsCount} warning rows with confidence below {LOW_CONFIDENCE_THRESHOLD}.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowWarningConfirm(false)}>Cancel</Button>
            <Button onClick={() => { setShowWarningConfirm(false); saveExercise() }}>Continue</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
