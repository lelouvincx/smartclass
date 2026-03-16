import React, { useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import {
  createExercise,
  createExerciseFileUpload,
  parseExerciseSchema,
  uploadExerciseFile,
} from '../lib/api'
import { useAuth } from '../lib/auth-context'
import { extractTextFromPdf } from '../lib/pdf'

const LOW_CONFIDENCE_THRESHOLD = 0.75
const BOOLEAN_SUB_IDS = ['a', 'b', 'c', 'd']

// --- Normalization helpers ---

function normalizeAnswer(type, value) {
  const trimmed = String(value ?? '').trim()
  if (type === 'mcq') {
    return trimmed.toUpperCase()
  }
  // boolean sub-answers are already '0' or '1'
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

  // Track boolean sub-ids per q_id for completeness check
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
      // For boolean, each row is a sub-question
      if (!row.sub_id || !BOOLEAN_SUB_IDS.includes(row.sub_id)) {
        errors.push('boolean sub_id must be a, b, c, or d')
      } else if (!['0', '1'].includes(row.correct_answer)) {
        errors.push('select True (1) or False (0)')
      }
    } else {
      // mcq / numeric: check for duplicate q_id
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

/**
 * For MCQ/numeric: returns a single row with a unique id.
 * For boolean: returns 4 sub-rows (a,b,c,d) under the same q_id.
 */
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
  const { token, logout } = useAuth()

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
    if (filter === 'errors') {
      return validatedRows.filter((row) => row.errors.length > 0)
    }
    if (filter === 'warnings') {
      return validatedRows.filter((row) => row.warnings.length > 0)
    }
    return validatedRows
  }, [filter, validatedRows])

  function handleUpdateRow(id, field, value) {
    setRows((prev) => {
      if (field === 'type') {
        // When changing type, replace the row(s) for this q_id
        const targetRow = prev.find((r) => r.id === id)
        if (!targetRow) return prev

        const qid = targetRow.q_id
        // Remove all rows with same q_id (handles boolean -> non-boolean collapse)
        const otherRows = prev.filter((r) => r.q_id !== qid)
        const insertIndex = prev.findIndex((r) => r.q_id === qid)

        const replacement = newRows(value, qid)
        const result = [...otherRows]
        result.splice(insertIndex, 0, ...replacement)
        return result
      }

      return prev.map((row) => {
        if (row.id !== id) return row
        if (field === 'correct_answer') {
          return { ...row, correct_answer: value }
        }
        if (field === 'q_id') {
          return { ...row, q_id: value }
        }
        return { ...row, [field]: value }
      })
    })
  }

  // When updating q_id for a boolean group, update all 4 sub-rows
  function handleUpdateQid(id, value) {
    setRows((prev) => {
      const targetRow = prev.find((r) => r.id === id)
      if (!targetRow) return prev

      if (targetRow.type === 'boolean') {
        // Update q_id on all sub-rows that share this q_id
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
      // Delete all sub-rows for this boolean q_id
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

      const response = await parseExerciseSchema(token, {
        source_text: sourceText,
      })

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

    if (!title.trim()) {
      setError('Title is required')
      return
    }

    if (isTimed && (!durationMinutes || Number(durationMinutes) <= 0)) {
      setError('Duration must be a positive number')
      return
    }

    if (validatedRows.length === 0) {
      setError('At least one schema row is required')
      return
    }

    if (stats.errorsCount > 0) {
      setError('Please fix all schema errors before saving')
      return
    }

    if (stats.warningsCount > 0) {
      setShowWarningConfirm(true)
      return
    }

    await saveExercise()
  }

  // --- Render boolean sub-question row ---

  function renderBooleanSubRow(row) {
    return (
      <tr key={row.id} className="border-t border-slate-200 align-top">
        <td className="px-3 py-2">
          {/* Show q_id input only on sub_id='a' row, read-only on others */}
          {row.sub_id === 'a' ? (
            <input
              aria-label={`q-id-${row.id}`}
              type="text"
              value={row.q_id}
              onChange={(event) => handleUpdateQid(row.id, event.target.value)}
              className="h-9 w-20 rounded border border-slate-300 px-2"
            />
          ) : (
            <span className="px-2 text-sm text-slate-400">{row.q_id}</span>
          )}
        </td>
        <td className="px-3 py-2">
          {row.sub_id === 'a' ? (
            <select
              aria-label={`type-${row.id}`}
              value="boolean"
              onChange={(event) => handleUpdateRow(row.id, 'type', event.target.value)}
              className="h-9 rounded border border-slate-300 px-2"
            >
              <option value="mcq">mcq</option>
              <option value="boolean">boolean</option>
              <option value="numeric">numeric</option>
            </select>
          ) : (
            <span className="text-sm text-slate-500">boolean</span>
          )}
        </td>
        <td className="px-3 py-2">
          <div className="flex items-center gap-3">
            <span className="w-4 text-sm font-medium text-slate-600">{row.sub_id}.</span>
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
        <td className="px-3 py-2 text-slate-600">{Math.round((row.confidence ?? 1) * 100)}%</td>
        <td className="px-3 py-2">
          {row.errors.length > 0 && (
            <p className="text-xs text-red-600">{row.errors[0]}</p>
          )}
          {row.errors.length === 0 && row.warnings.length > 0 && (
            <p className="text-xs text-amber-600">{row.warnings[0]}</p>
          )}
          {row.errors.length === 0 && row.warnings.length === 0 && (
            <p className="text-xs text-emerald-700">Valid</p>
          )}
        </td>
        <td className="px-3 py-2">
          {/* Show delete only on first sub-row */}
          {row.sub_id === 'a' && (
            <button
              type="button"
              onClick={() => handleDeleteRow(row.id)}
              className="text-sm text-red-600"
            >
              Delete
            </button>
          )}
        </td>
      </tr>
    )
  }

  // --- Render standard (mcq/numeric) row ---

  function renderStandardRow(row) {
    return (
      <tr key={row.id} className="border-t border-slate-200 align-top">
        <td className="px-3 py-2">
          <input
            aria-label={`q-id-${row.id}`}
            type="text"
            value={row.q_id}
            onChange={(event) => handleUpdateRow(row.id, 'q_id', event.target.value)}
            className="h-9 w-20 rounded border border-slate-300 px-2"
          />
        </td>
        <td className="px-3 py-2">
          <select
            aria-label={`type-${row.id}`}
            value={row.type}
            onChange={(event) => handleUpdateRow(row.id, 'type', event.target.value)}
            className="h-9 rounded border border-slate-300 px-2"
          >
            <option value="mcq">mcq</option>
            <option value="boolean">boolean</option>
            <option value="numeric">numeric</option>
          </select>
        </td>
        <td className="px-3 py-2">
          <input
            aria-label={`answer-${row.id}`}
            type="text"
            value={row.correct_answer}
            onChange={(event) => handleUpdateRow(row.id, 'correct_answer', event.target.value)}
            className="h-9 w-36 rounded border border-slate-300 px-2"
          />
        </td>
        <td className="px-3 py-2 text-slate-600">{Math.round((row.confidence ?? 1) * 100)}%</td>
        <td className="px-3 py-2">
          {row.errors.length > 0 && (
            <p className="text-xs text-red-600">{row.errors[0]}</p>
          )}
          {row.errors.length === 0 && row.warnings.length > 0 && (
            <p className="text-xs text-amber-600">{row.warnings[0]}</p>
          )}
          {row.errors.length === 0 && row.warnings.length === 0 && (
            <p className="text-xs text-emerald-700">Valid</p>
          )}
        </td>
        <td className="px-3 py-2">
          <button
            type="button"
            onClick={() => handleDeleteRow(row.id)}
            className="text-sm text-red-600"
          >
            Delete
          </button>
        </td>
      </tr>
    )
  }

  return (
    <div className="min-h-screen bg-slate-50 p-6">
      <div className="mx-auto max-w-6xl space-y-6">
        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h1 className="text-2xl font-semibold text-slate-900">Create Exercise</h1>
              <p className="text-sm text-slate-600">Upload answer PDF for auto-schema generation, or continue manually.</p>
            </div>
            <div className="flex gap-2">
              <Link to="/teacher" className="h-10 rounded-md border border-slate-300 px-4 text-sm font-medium leading-10 text-slate-700">
                Back
              </Link>
              <button
                type="button"
                onClick={() => {
                  logout()
                  navigate('/', { replace: true })
                }}
                className="h-10 rounded-md bg-slate-900 px-4 text-sm font-medium text-white"
              >
                Logout
              </button>
            </div>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="grid gap-4 rounded-xl border border-slate-200 bg-white p-5 shadow-sm md:grid-cols-3">
            <div className="md:col-span-2">
              <label htmlFor="title" className="mb-1 block text-sm font-medium text-slate-700">Exercise title</label>
              <input
                id="title"
                type="text"
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                className="h-10 w-full rounded-md border border-slate-300 px-3 focus:outline-none focus:ring-2 focus:ring-slate-800"
              />
            </div>
            <div>
              <p className="mb-1 block text-sm font-medium text-slate-700">Mode</p>
              <div className="flex items-center justify-between rounded-md border border-slate-300 p-2">
                <span className="text-sm text-slate-700">{isTimed ? 'Timed mode' : 'Untimed mode'}</span>
                <label htmlFor="timedToggle" className="relative inline-flex cursor-pointer items-center">
                  <input
                    id="timedToggle"
                    type="checkbox"
                    aria-label="Timed mode toggle"
                    className="peer sr-only"
                    checked={isTimed}
                    onChange={(event) => setIsTimed(event.target.checked)}
                  />
                  <span className="h-6 w-11 rounded-full bg-slate-300 transition peer-checked:bg-slate-900" />
                  <span className="absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-white transition peer-checked:translate-x-5" />
                </label>
              </div>
            </div>
            <div>
              <label htmlFor="duration" className="mb-1 block text-sm font-medium text-slate-700">Duration (minutes)</label>
              <input
                id="duration"
                type="number"
                value={durationMinutes}
                onChange={(event) => setDurationMinutes(event.target.value)}
                disabled={!isTimed}
                className="h-10 w-full rounded-md border border-slate-300 px-3 focus:outline-none focus:ring-2 focus:ring-slate-800 disabled:bg-slate-100 disabled:text-slate-500"
              />
            </div>
            <div>
              <label htmlFor="exerciseFile" className="mb-1 block text-sm font-medium text-slate-700">Exercise PDF (optional)</label>
              <input
                id="exerciseFile"
                type="file"
                accept=".pdf"
                onChange={(event) => setExerciseFile(event.target.files?.[0] || null)}
                className="block w-full text-sm"
              />
            </div>
            <div>
              <label htmlFor="answerFile" className="mb-1 block text-sm font-medium text-slate-700">Answer PDF (recommended)</label>
              <input
                id="answerFile"
                type="file"
                accept=".pdf"
                onChange={(event) => setAnswerFile(event.target.files?.[0] || null)}
                className="block w-full text-sm"
              />
            </div>
            <div className="flex items-end">
              <button
                type="button"
                disabled={!answerFile || isParsing}
                onClick={handleParseSchema}
                className="h-10 w-full rounded-md border border-slate-300 px-4 text-sm font-medium text-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {isParsing ? 'Generating schema...' : '✨ Generate Schema'}
              </button>
            </div>
          </div>

          {!answerFile && (
            <p className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
              Manual schema entry is available, but uploading an answer PDF is recommended for faster setup.
            </p>
          )}

          <div className="rounded-xl border border-slate-200 bg-white shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 p-4">
              <div className="flex items-center gap-3">
                <span className="text-sm text-slate-600">Questions: <strong>{stats.total}</strong></span>
                <span className="text-sm text-red-600">Errors: <strong>{stats.errorsCount}</strong></span>
                <span className="text-sm text-amber-600">Warnings: <strong>{stats.warningsCount}</strong></span>
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setFilter('all')}
                  className={`h-8 rounded-md px-3 text-sm ${filter === 'all' ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-700'}`}
                >
                  All
                </button>
                <button
                  type="button"
                  onClick={() => setFilter('errors')}
                  className={`h-8 rounded-md px-3 text-sm ${filter === 'errors' ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-700'}`}
                >
                  Errors
                </button>
                <button
                  type="button"
                  onClick={() => setFilter('warnings')}
                  className={`h-8 rounded-md px-3 text-sm ${filter === 'warnings' ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-700'}`}
                >
                  Warnings
                </button>
                <button
                  type="button"
                  onClick={handleAddRow}
                  className="h-8 rounded-md border border-slate-300 px-3 text-sm font-medium text-slate-700"
                >
                  Add Row
                </button>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="min-w-full border-collapse text-sm">
                <thead>
                  <tr className="bg-slate-50 text-left text-slate-600">
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
                    row.type === 'boolean'
                      ? renderBooleanSubRow(row)
                      : renderStandardRow(row)
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {error && <p className="text-sm text-red-600">{error}</p>}

          <div className="flex justify-end">
            <button
              type="submit"
              disabled={isSaving}
              className="h-10 rounded-md bg-slate-900 px-4 text-sm font-medium text-white disabled:opacity-60"
            >
              {isSaving ? 'Saving...' : 'Save Exercise'}
            </button>
          </div>
        </form>
      </div>

      {showWarningConfirm && (
        <div className="fixed inset-0 flex items-center justify-center bg-black/20 p-4">
          <div className="w-full max-w-md rounded-lg border border-slate-200 bg-white p-4 shadow-lg">
            <h2 className="text-lg font-semibold text-slate-900">Save with warnings?</h2>
            <p className="mt-1 text-sm text-slate-600">There are {stats.warningsCount} warning rows with confidence below {LOW_CONFIDENCE_THRESHOLD}.</p>
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                className="h-9 rounded-md border border-slate-300 px-3 text-sm"
                onClick={() => setShowWarningConfirm(false)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="h-9 rounded-md bg-slate-900 px-3 text-sm font-medium text-white"
                onClick={() => {
                  setShowWarningConfirm(false)
                  saveExercise()
                }}
              >
                Continue
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
