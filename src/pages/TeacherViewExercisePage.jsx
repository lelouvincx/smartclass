import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { deleteExercise, getExercise, updateExercise } from '@/lib/api'
import { useAuth } from '@/lib/auth-context'

// ── Constants ──────────────────────────────────────────────────────────────────

const BOOLEAN_SUB_IDS = ['a', 'b', 'c', 'd']
const VALID_TYPES = new Set(['mcq', 'boolean', 'numeric'])
const LOW_CONFIDENCE_THRESHOLD = 0.75

// ── Schema helpers (shared with create page patterns) ─────────────────────────

function normalizeAnswer(type, value) {
  const trimmed = String(value ?? '').trim()
  return type === 'mcq' ? trimmed.toUpperCase() : trimmed
}

function validateRows(rows) {
  const qidCounts = new Map()
  rows.forEach((row) => {
    if (row.type !== 'boolean') {
      const key = String(row.q_id)
      qidCounts.set(key, (qidCounts.get(key) || 0) + 1)
    }
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
      if ((qidCounts.get(String(row.q_id)) || 0) > 1) {
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

    return {
      ...row,
      correct_answer: row.type === 'boolean'
        ? (row.correct_answer ?? '')
        : normalizeAnswer(row.type, row.correct_answer),
      errors,
    }
  })
}

function toSchemaPayload(rows) {
  return rows.map((row) => {
    if (row.type === 'boolean') {
      return { q_id: Number(row.q_id), type: 'boolean', sub_id: row.sub_id, correct_answer: row.correct_answer }
    }
    return { q_id: Number(row.q_id), type: row.type, correct_answer: normalizeAnswer(row.type, row.correct_answer) }
  })
}

function makeId() {
  return typeof crypto !== 'undefined' && crypto.randomUUID
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2)
}

function newRows(type, qid) {
  if (type === 'boolean') {
    return BOOLEAN_SUB_IDS.map((sub_id) => ({
      id: makeId(), q_id: qid, sub_id, type: 'boolean', correct_answer: '',
    }))
  }
  return [{ id: makeId(), q_id: qid, sub_id: null, type, correct_answer: '' }]
}

/** Convert schema rows from API response into editable row objects */
function schemaToRows(schema) {
  return (schema || []).map((row) => ({
    id: makeId(),
    q_id: String(row.q_id),
    sub_id: row.sub_id ?? null,
    type: row.type,
    correct_answer: row.correct_answer ?? '',
  }))
}

// ── View-mode components ───────────────────────────────────────────────────────

function MetaBadge({ isTimed, durationMinutes }) {
  if (isTimed) {
    return (
      <span className="inline-flex items-center rounded-full bg-blue-100 px-2.5 py-0.5 text-xs font-medium text-blue-800">
        Timed · {durationMinutes} min
      </span>
    )
  }
  return (
    <span className="inline-flex items-center rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-slate-600">
      Untimed
    </span>
  )
}

function ViewSchemaTable({ schema }) {
  // Group boolean sub-rows under their q_id
  const groups = useMemo(() => {
    const result = []
    const seen = new Map()
    for (const row of schema) {
      if (row.type === 'boolean') {
        if (!seen.has(row.q_id)) {
          const g = { q_id: row.q_id, type: 'boolean', subRows: [] }
          result.push(g)
          seen.set(row.q_id, g)
        }
        seen.get(row.q_id).subRows.push(row)
      } else {
        result.push({ q_id: row.q_id, type: row.type, correct_answer: row.correct_answer })
        seen.set(row.q_id, true)
      }
    }
    return result
  }, [schema])

  return (
    <div className="overflow-x-auto">
      <table className="min-w-full border-collapse text-sm">
        <thead>
          <tr className="bg-slate-50 text-left text-xs font-medium uppercase tracking-wide text-slate-500">
            <th className="px-4 py-2">Q#</th>
            <th className="px-4 py-2">Sub</th>
            <th className="px-4 py-2">Type</th>
            <th className="px-4 py-2">Correct Answer</th>
          </tr>
        </thead>
        <tbody>
          {groups.map((g) => {
            if (g.type === 'boolean') {
              return g.subRows.map((sub, i) => (
                <tr key={`${g.q_id}-${sub.sub_id}`} className="border-t border-slate-100">
                  <td className="px-4 py-2 text-slate-700">{i === 0 ? g.q_id : ''}</td>
                  <td className="px-4 py-2 font-mono text-slate-500">{sub.sub_id}</td>
                  <td className="px-4 py-2 text-slate-500">{i === 0 ? 'boolean' : ''}</td>
                  <td className="px-4 py-2 font-medium text-slate-900">
                    {sub.correct_answer === '1' ? 'True (1)' : 'False (0)'}
                  </td>
                </tr>
              ))
            }
            return (
              <tr key={g.q_id} className="border-t border-slate-100">
                <td className="px-4 py-2 text-slate-700">{g.q_id}</td>
                <td className="px-4 py-2 text-slate-400">—</td>
                <td className="px-4 py-2 text-slate-500">{g.type}</td>
                <td className="px-4 py-2 font-medium text-slate-900">{g.correct_answer}</td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

// ── Edit-mode schema table ─────────────────────────────────────────────────────

function EditSchemaTable({ rows, onUpdateRow, onUpdateQid, onDeleteRow }) {
  function renderBooleanSubRow(row) {
    return (
      <tr key={row.id} className="border-t border-slate-100 align-top">
        <td className="px-3 py-2">
          {row.sub_id === 'a' ? (
            <input
              aria-label={`q-id-${row.id}`}
              type="text"
              value={row.q_id}
              onChange={(e) => onUpdateQid(row.id, e.target.value)}
              className="h-9 w-20 rounded-sm border border-slate-300 px-2 text-sm"
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
              onChange={(e) => onUpdateRow(row.id, 'type', e.target.value)}
              className="h-9 rounded-sm border border-slate-300 px-2 text-sm"
            >
              <option value="mcq">mcq</option>
              <option value="boolean">boolean</option>
              <option value="numeric">numeric</option>
            </select>
          ) : (
            <span className="text-sm text-slate-400">boolean</span>
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
                onChange={() => onUpdateRow(row.id, 'correct_answer', '1')}
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
                onChange={() => onUpdateRow(row.id, 'correct_answer', '0')}
                aria-label={`sub-q ${row.q_id} ${row.sub_id} false`}
              />
              False
            </label>
          </div>
        </td>
        <td className="px-3 py-2">
          {row.errors?.length > 0
            ? <span className="text-xs text-red-600">{row.errors[0]}</span>
            : <span className="text-xs text-emerald-700">Valid</span>
          }
        </td>
        <td className="px-3 py-2">
          {row.sub_id === 'a' && (
            <button type="button" onClick={() => onDeleteRow(row.id)} className="text-sm text-red-600">
              Delete
            </button>
          )}
        </td>
      </tr>
    )
  }

  function renderStandardRow(row) {
    return (
      <tr key={row.id} className="border-t border-slate-100 align-top">
        <td className="px-3 py-2">
          <input
            aria-label={`q-id-${row.id}`}
            type="text"
            value={row.q_id}
            onChange={(e) => onUpdateRow(row.id, 'q_id', e.target.value)}
            className="h-9 w-20 rounded-sm border border-slate-300 px-2 text-sm"
          />
        </td>
        <td className="px-3 py-2">
          <select
            aria-label={`type-${row.id}`}
            value={row.type}
            onChange={(e) => onUpdateRow(row.id, 'type', e.target.value)}
            className="h-9 rounded-sm border border-slate-300 px-2 text-sm"
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
            onChange={(e) => onUpdateRow(row.id, 'correct_answer', e.target.value)}
            className="h-9 w-32 rounded-sm border border-slate-300 px-2 text-sm"
          />
        </td>
        <td className="px-3 py-2">
          {row.errors?.length > 0
            ? <span className="text-xs text-red-600">{row.errors[0]}</span>
            : <span className="text-xs text-emerald-700">Valid</span>
          }
        </td>
        <td className="px-3 py-2">
          <button type="button" onClick={() => onDeleteRow(row.id)} className="text-sm text-red-600">
            Delete
          </button>
        </td>
      </tr>
    )
  }

  return (
    <div className="overflow-x-auto">
      <table className="min-w-full border-collapse text-sm">
        <thead>
          <tr className="bg-slate-50 text-left text-xs font-medium uppercase tracking-wide text-slate-500">
            <th className="px-3 py-2">q_id</th>
            <th className="px-3 py-2">type</th>
            <th className="px-3 py-2">correct_answer</th>
            <th className="px-3 py-2">status</th>
            <th className="px-3 py-2">actions</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) =>
            row.type === 'boolean' ? renderBooleanSubRow(row) : renderStandardRow(row)
          )}
        </tbody>
      </table>
    </div>
  )
}

// ── Main page ──────────────────────────────────────────────────────────────────

export default function TeacherViewExercisePage() {
  const { id } = useParams()
  const { token } = useAuth()
  const navigate = useNavigate()

  // Remote data
  const [exercise, setExercise] = useState(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState('')

  // UI mode
  const [isEditing, setIsEditing] = useState(false)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)
  const [saveError, setSaveError] = useState('')

  // Edit-mode fields
  const [editTitle, setEditTitle] = useState('')
  const [editIsTimed, setEditIsTimed] = useState(true)
  const [editDuration, setEditDuration] = useState(60)
  const [editRows, setEditRows] = useState([])

  // Derived validated rows
  const validatedRows = useMemo(() => validateRows(editRows), [editRows])
  const hasErrors = validatedRows.some((r) => r.errors.length > 0)

  // ── Fetch exercise ───────────────────────────────────────────────────────────

  useEffect(() => {
    async function load() {
      setIsLoading(true)
      setError('')
      try {
        const res = await getExercise(id, token)
        setExercise(res.data)
      } catch (e) {
        setError(e.message)
      } finally {
        setIsLoading(false)
      }
    }
    load()
  }, [id, token])

  // ── Edit mode helpers ────────────────────────────────────────────────────────

  function enterEditMode() {
    setEditTitle(exercise.title)
    setEditIsTimed(exercise.is_timed === 1 || exercise.is_timed === true)
    setEditDuration(exercise.duration_minutes)
    setEditRows(schemaToRows(exercise.schema))
    setSaveError('')
    setIsEditing(true)
  }

  function cancelEdit() {
    setIsEditing(false)
    setSaveError('')
  }

  // Row mutation handlers
  const handleUpdateRow = useCallback((rowId, field, value) => {
    setEditRows((prev) => {
      if (field === 'type') {
        const target = prev.find((r) => r.id === rowId)
        if (!target) return prev
        const qid = target.q_id
        const otherRows = prev.filter((r) => r.q_id !== qid || r.type !== target.type)
        const insertIdx = prev.findIndex((r) => r.id === rowId)
        const replacement = newRows(value, qid)
        const result = [...otherRows]
        result.splice(
          prev.filter((r) => r.q_id < qid || (r.q_id === qid && r !== target)).length,
          0,
          ...replacement,
        )
        // Simpler: remove old rows for same q_id, insert replacement at same position
        const withoutOld = prev.filter((r) => r.q_id !== qid)
        const insertAt = prev.findIndex((r) => r.q_id === qid)
        const final = [...withoutOld]
        final.splice(insertAt >= 0 ? insertAt : final.length, 0, ...replacement)
        return final
      }
      return prev.map((r) => r.id !== rowId ? r : { ...r, [field]: value })
    })
  }, [])

  const handleUpdateQid = useCallback((rowId, value) => {
    setEditRows((prev) => {
      const target = prev.find((r) => r.id === rowId)
      if (!target) return prev
      if (target.type === 'boolean') {
        const oldQid = target.q_id
        return prev.map((r) => r.type === 'boolean' && r.q_id === oldQid ? { ...r, q_id: value } : r)
      }
      return prev.map((r) => r.id === rowId ? { ...r, q_id: value } : r)
    })
  }, [])

  const handleDeleteRow = useCallback((rowId) => {
    setEditRows((prev) => {
      const target = prev.find((r) => r.id === rowId)
      if (!target) return prev
      if (target.type === 'boolean') {
        return prev.filter((r) => !(r.type === 'boolean' && r.q_id === target.q_id))
      }
      return prev.filter((r) => r.id !== rowId)
    })
  }, [])

  function handleAddRow() {
    const maxQid = editRows.reduce((acc, r) => {
      const n = Number.parseInt(String(r.q_id), 10)
      return Number.isNaN(n) ? acc : Math.max(acc, n)
    }, 0)
    setEditRows((prev) => [...prev, ...newRows('mcq', String(maxQid + 1))])
  }

  // ── Save ─────────────────────────────────────────────────────────────────────

  async function handleSave() {
    setSaveError('')
    if (!editTitle.trim()) {
      setSaveError('Title is required')
      return
    }
    if (editIsTimed && (!editDuration || Number(editDuration) <= 0)) {
      setSaveError('Duration must be a positive number')
      return
    }
    if (hasErrors) {
      setSaveError('Please fix all schema errors before saving')
      return
    }

    setIsSaving(true)
    try {
      const payload = {
        title: editTitle.trim(),
        is_timed: editIsTimed,
        duration_minutes: editIsTimed ? Number(editDuration) : 0,
        schema: toSchemaPayload(validatedRows),
      }
      const res = await updateExercise(token, exercise.id, payload)
      setExercise(res.data)
      setIsEditing(false)
    } catch (e) {
      setSaveError(e.message)
    } finally {
      setIsSaving(false)
    }
  }

  // ── Delete ───────────────────────────────────────────────────────────────────

  async function handleConfirmDelete() {
    setIsDeleting(true)
    try {
      await deleteExercise(token, exercise.id)
      navigate('/teacher/exercises', { replace: true })
    } catch (e) {
      setError(e.message)
      setIsDeleting(false)
      setShowDeleteConfirm(false)
    }
  }

  // ── Render ───────────────────────────────────────────────────────────────────

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <p className="text-sm text-muted-foreground">Loading exercise...</p>
      </div>
    )
  }

  if (error) {
    return (
      <div className="max-w-3xl rounded-xl border border-destructive/50 bg-card p-6 shadow-xs">
        <p className="text-sm text-destructive">{error}</p>
        <Link
          to="/teacher/exercises"
          className="mt-4 inline-flex h-10 items-center rounded-md border px-4 text-sm font-medium"
        >
          Back to Exercises
        </Link>
      </div>
    )
  }

  const isTimed = exercise.is_timed === 1 || exercise.is_timed === true

  return (
    <div className="max-w-3xl space-y-6">

      {/* Header */}
      <div className="rounded-xl border bg-card p-5 shadow-xs">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="flex-1 min-w-0">
              {isEditing ? (
                <div className="space-y-3">
                  <div>
                    <label htmlFor="edit-title" className="mb-1 block text-sm font-medium text-slate-700">
                      Exercise title
                    </label>
                    <input
                      id="edit-title"
                      type="text"
                      value={editTitle}
                      onChange={(e) => setEditTitle(e.target.value)}
                      className="h-10 w-full rounded-md border border-slate-300 px-3 text-sm focus:outline-hidden focus:ring-2 focus:ring-slate-800"
                    />
                  </div>
                  <div className="flex flex-wrap gap-4">
                    <div className="flex items-center gap-2">
                      <span className="text-sm text-slate-700">Timed</span>
                      <label className="relative inline-flex cursor-pointer items-center">
                        <input
                          type="checkbox"
                          aria-label="Timed mode toggle"
                          className="peer sr-only"
                          checked={editIsTimed}
                          onChange={(e) => setEditIsTimed(e.target.checked)}
                        />
                        <span className="h-6 w-11 rounded-full bg-slate-300 transition peer-checked:bg-slate-900" />
                        <span className="absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-white transition peer-checked:translate-x-5" />
                      </label>
                    </div>
                    {editIsTimed && (
                      <div>
                        <label htmlFor="edit-duration" className="mr-2 text-sm text-slate-700">
                          Duration (min)
                        </label>
                        <input
                          id="edit-duration"
                          type="number"
                          value={editDuration}
                          onChange={(e) => setEditDuration(e.target.value)}
                          className="h-9 w-24 rounded-sm border border-slate-300 px-2 text-sm"
                        />
                      </div>
                    )}
                  </div>
                </div>
              ) : (
                <>
                  <h1 className="truncate text-2xl font-semibold text-slate-900">{exercise.title}</h1>
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <MetaBadge isTimed={isTimed} durationMinutes={exercise.duration_minutes} />
                    <span className="text-sm text-slate-500">
                      {exercise.schema?.length ?? 0} schema row{exercise.schema?.length !== 1 ? 's' : ''}
                    </span>
                  </div>
                </>
              )}
            </div>

            {/* Action buttons */}
            <div className="flex shrink-0 gap-2">
              {isEditing ? (
                <>
                  <button
                    type="button"
                    onClick={handleSave}
                    disabled={isSaving}
                    className="h-10 rounded-md bg-slate-900 px-4 text-sm font-medium text-white disabled:opacity-60"
                  >
                    {isSaving ? 'Saving...' : 'Save'}
                  </button>
                  <button
                    type="button"
                    onClick={cancelEdit}
                    disabled={isSaving}
                    className="h-10 rounded-md border border-slate-300 px-4 text-sm font-medium text-slate-700"
                  >
                    Cancel
                  </button>
                </>
              ) : (
                <>
                  <Link
                    to="/teacher/exercises"
                    className="inline-flex h-10 items-center rounded-md border border-slate-300 px-4 text-sm font-medium text-slate-700"
                  >
                    Back to Exercises
                  </Link>
                  <button
                    type="button"
                    onClick={enterEditMode}
                    className="h-10 rounded-md border border-slate-300 px-4 text-sm font-medium text-slate-700"
                  >
                    Edit
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowDeleteConfirm(true)}
                    className="h-10 rounded-md border border-red-300 px-4 text-sm font-medium text-red-700"
                  >
                    Delete
                  </button>
                </>
              )}
            </div>
          </div>

          {saveError && (
            <p className="mt-3 text-sm text-red-600">{saveError}</p>
          )}
        </div>

        {/* Files */}
        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-xs">
          <h2 className="mb-3 text-sm font-semibold text-slate-700">Files</h2>
          {exercise.files?.length > 0 ? (
            <ul className="space-y-1">
              {exercise.files.map((f) => (
                <li key={f.id} className="flex items-center gap-2 text-sm text-slate-700">
                  <span className="rounded-sm bg-slate-100 px-1.5 py-0.5 text-xs text-slate-500">{f.file_type}</span>
                  <span>{f.file_name}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-slate-500">No files uploaded.</p>
          )}
        </div>

        {/* Schema */}
        <div className="rounded-xl border border-slate-200 bg-white shadow-xs">
          <div className="flex items-center justify-between border-b border-slate-200 px-5 py-3">
            <h2 className="text-sm font-semibold text-slate-700">Answer Schema</h2>
            {isEditing && (
              <button
                type="button"
                onClick={handleAddRow}
                className="h-8 rounded-md border border-slate-300 px-3 text-sm font-medium text-slate-700"
              >
                Add Row
              </button>
            )}
          </div>

          {isEditing ? (
            <EditSchemaTable
              rows={validatedRows}
              onUpdateRow={handleUpdateRow}
              onUpdateQid={handleUpdateQid}
              onDeleteRow={handleDeleteRow}
            />
          ) : (
            <ViewSchemaTable schema={exercise.schema || []} />
          )}
        </div>

      {/* Delete confirmation dialog */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 flex items-center justify-center bg-black/20 p-4">
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Delete exercise"
            className="w-full max-w-md rounded-xl border border-slate-200 bg-white p-6 shadow-xl"
          >
            <h2 className="text-lg font-semibold text-slate-900">Delete this exercise?</h2>
            <p className="mt-2 text-sm text-slate-600">
              This action cannot be undone. All submissions and schema data will be permanently deleted.
            </p>
            <div className="mt-5 flex gap-3">
              <button
                type="button"
                onClick={handleConfirmDelete}
                disabled={isDeleting}
                className="h-10 rounded-md bg-red-600 px-5 text-sm font-medium text-white disabled:opacity-60"
              >
                {isDeleting ? 'Deleting...' : 'Yes, delete'}
              </button>
              <button
                type="button"
                onClick={() => setShowDeleteConfirm(false)}
                disabled={isDeleting}
                className="h-10 rounded-md border border-slate-300 px-4 text-sm font-medium text-slate-700"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
