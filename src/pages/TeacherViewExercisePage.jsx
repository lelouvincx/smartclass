import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { deleteExercise, getExercise, updateExercise } from '@/lib/api'
import { useAuth } from '@/lib/auth-context'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
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
import { SchemaTable } from '@/components/schema-table'
import ExtractModelSelect from '@/components/extract-model-select'

// ── Constants ──────────────────────────────────────────────────────────────────

const BOOLEAN_SUB_IDS = ['a', 'b', 'c', 'd']

// ── Schema helpers ─────────────────────────────────────────────────────────────

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
    return <Badge variant="default">Timed · {durationMinutes} min</Badge>
  }
  return <Badge variant="secondary">Untimed</Badge>
}

function ViewSchemaTable({ schema }) {
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
          <tr className="bg-muted text-left text-xs font-medium uppercase tracking-wide text-muted-foreground">
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
                <tr key={`${g.q_id}-${sub.sub_id}`} className="border-t">
                  <td className="px-4 py-2 text-muted-foreground">{i === 0 ? g.q_id : ''}</td>
                  <td className="px-4 py-2 font-mono text-muted-foreground">{sub.sub_id}</td>
                  <td className="px-4 py-2 text-muted-foreground">{i === 0 ? 'boolean' : ''}</td>
                  <td className="px-4 py-2 font-medium">
                    {sub.correct_answer === '1' ? (
                      <span className="rounded px-1.5 py-0.5 text-xs font-semibold bg-success/15 text-success">
                        True
                      </span>
                    ) : (
                      <span className="rounded px-1.5 py-0.5 text-xs font-semibold bg-destructive/15 text-destructive">
                        False
                      </span>
                    )}
                  </td>
                </tr>
              ))
            }
            return (
              <tr key={g.q_id} className="border-t">
                <td className="px-4 py-2 text-muted-foreground">{g.q_id}</td>
                <td className="px-4 py-2 text-muted-foreground">—</td>
                <td className="px-4 py-2 text-muted-foreground">{g.type}</td>
                <td className="px-4 py-2 font-medium">{g.correct_answer}</td>
              </tr>
            )
          })}
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

  const [exercise, setExercise] = useState(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState('')

  const [isEditing, setIsEditing] = useState(false)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [deleteConfirmText, setDeleteConfirmText] = useState('')
  const [isSaving, setIsSaving] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)
  const [saveError, setSaveError] = useState('')

  const [editTitle, setEditTitle] = useState('')
  const [editIsTimed, setEditIsTimed] = useState(true)
  const [editDuration, setEditDuration] = useState(60)
  const [editExtractModel, setEditExtractModel] = useState(null)
  const [editRows, setEditRows] = useState([])

  const validatedRows = useMemo(() => validateRows(editRows), [editRows])
  const hasErrors = validatedRows.some((r) => r.errors.length > 0)

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

  function enterEditMode() {
    setEditTitle(exercise.title)
    setEditIsTimed(exercise.is_timed === 1 || exercise.is_timed === true)
    setEditDuration(exercise.duration_minutes)
    setEditExtractModel(exercise.extract_model ?? null)
    setEditRows(schemaToRows(exercise.schema))
    setSaveError('')
    setIsEditing(true)
  }

  function cancelEdit() {
    setIsEditing(false)
    setSaveError('')
  }

  const handleUpdateRow = useCallback((rowId, field, value) => {
    setEditRows((prev) => {
      if (field === 'type') {
        const target = prev.find((r) => r.id === rowId)
        if (!target) return prev
        const qid = target.q_id
        const withoutOld = prev.filter((r) => r.q_id !== qid)
        const insertAt = prev.findIndex((r) => r.q_id === qid)
        const replacement = newRows(value, qid)
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

  const handleReorderRows = useCallback((newRows) => {
    setEditRows(newRows)
  }, [])

  async function handleSave() {
    setSaveError('')
    if (!editTitle.trim()) { setSaveError('Title is required'); return }
    if (editIsTimed && (!editDuration || Number(editDuration) <= 0)) {
      setSaveError('Duration must be a positive number'); return
    }
    if (hasErrors) { setSaveError('Please fix all schema errors before saving'); return }

    setIsSaving(true)
    try {
      const payload = {
        title: editTitle.trim(),
        is_timed: editIsTimed,
        duration_minutes: editIsTimed ? Number(editDuration) : 0,
        schema: toSchemaPayload(validatedRows),
        extract_model: editExtractModel,
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
      <Card className="max-w-3xl border-destructive/50">
        <CardContent className="pt-6">
          <p className="text-sm text-destructive">{error}</p>
          <Button variant="outline" asChild className="mt-4">
            <Link to="/teacher/exercises">Back to Exercises</Link>
          </Button>
        </CardContent>
      </Card>
    )
  }

  const isTimed = exercise.is_timed === 1 || exercise.is_timed === true

  return (
    <div className="max-w-3xl space-y-6">

      {/* Header card */}
      <Card>
        <CardContent className="pt-5">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="flex-1 min-w-0">
              {isEditing ? (
                <div className="space-y-3">
                  <div className="space-y-1.5">
                    <Label htmlFor="edit-title">Exercise title</Label>
                    <Input
                      id="edit-title"
                      type="text"
                      value={editTitle}
                      onChange={(e) => setEditTitle(e.target.value)}
                    />
                  </div>
                  <div className="flex flex-wrap gap-4">
                    <div className="flex items-center gap-2">
                      <Label htmlFor="edit-timed">Timed</Label>
                      <Switch
                        id="edit-timed"
                        aria-label="Timed mode toggle"
                        checked={editIsTimed}
                        onCheckedChange={setEditIsTimed}
                      />
                    </div>
                    {editIsTimed && (
                      <div className="flex items-center gap-2">
                        <Label htmlFor="edit-duration">Duration (min)</Label>
                        <Input
                          id="edit-duration"
                          type="number"
                          value={editDuration}
                          onChange={(e) => setEditDuration(e.target.value)}
                          className="h-9 w-24"
                        />
                      </div>
                    )}
                  </div>
                  <ExtractModelSelect
                    value={editExtractModel}
                    onChange={setEditExtractModel}
                  />
                </div>
              ) : (
                <>
                  <h1 className="truncate text-2xl font-semibold">{exercise.title}</h1>
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <MetaBadge isTimed={isTimed} durationMinutes={exercise.duration_minutes} />
                    <span className="text-sm text-muted-foreground">
                      {exercise.schema?.length ?? 0} schema row{exercise.schema?.length !== 1 ? 's' : ''}
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Extraction model:{' '}
                    <span className="font-medium text-foreground">
                      {exercise.extract_model || 'server default'}
                    </span>
                  </p>
                </>
              )}
            </div>

            {/* Action buttons */}
            <div className="flex shrink-0 gap-2">
              {isEditing ? (
                <>
                  <Button onClick={handleSave} disabled={isSaving}>
                    {isSaving ? 'Saving...' : 'Save'}
                  </Button>
                  <Button variant="outline" onClick={cancelEdit} disabled={isSaving}>
                    Cancel
                  </Button>
                </>
              ) : (
                <>
                  <Button variant="outline" asChild>
                    <Link to="/teacher/exercises">Back to Exercises</Link>
                  </Button>
                  <Button variant="outline" onClick={enterEditMode}>Edit</Button>
                  <Button variant="destructive" onClick={() => setShowDeleteConfirm(true)}>
                    Delete
                  </Button>
                </>
              )}
            </div>
          </div>

          {saveError && <p className="mt-3 text-sm text-destructive">{saveError}</p>}
        </CardContent>
      </Card>

      {/* Files card */}
      <Card>
        <CardContent className="pt-5">
          <h2 className="mb-3 text-sm font-semibold">Files</h2>
          {exercise.files?.length > 0 ? (
            <ul className="space-y-1">
              {exercise.files.map((f) => (
                <li key={f.id} className="flex items-center gap-2 text-sm">
                  <Badge variant="secondary" className="text-xs">{f.file_type}</Badge>
                  <span>{f.file_name}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">No files uploaded.</p>
          )}
        </CardContent>
      </Card>

      {/* Schema card */}
      <Card>
        <CardHeader className="border-b px-5 py-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold">Answer Schema</h2>
            {isEditing && (
              <Button type="button" variant="outline" size="sm" onClick={handleAddRow}>
                Add Row
              </Button>
            )}
          </div>
        </CardHeader>
        {isEditing ? (
          <SchemaTable
            rows={validatedRows}
            onUpdateRow={handleUpdateRow}
            onUpdateQid={handleUpdateQid}
            onDeleteRow={handleDeleteRow}
            onReorder={handleReorderRows}
          />
        ) : (
          <ViewSchemaTable schema={exercise.schema || []} />
        )}
      </Card>

      {/* Delete confirmation dialog */}
      <Dialog
        open={showDeleteConfirm}
        onOpenChange={(open) => {
          setShowDeleteConfirm(open)
          if (!open) setDeleteConfirmText('')
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete this exercise?</DialogTitle>
            <DialogDescription>
              This action cannot be undone. All submissions and schema data will be permanently deleted.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5 py-2">
            <Label htmlFor="delete-confirm">
              Type <span className="font-mono font-semibold text-destructive">DELETE</span> to confirm
            </Label>
            <Input
              id="delete-confirm"
              value={deleteConfirmText}
              onChange={(e) => setDeleteConfirmText(e.target.value)}
              placeholder="DELETE"
              disabled={isDeleting}
              autoComplete="off"
            />
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => { setShowDeleteConfirm(false); setDeleteConfirmText('') }}
              disabled={isDeleting}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleConfirmDelete}
              disabled={isDeleting || deleteConfirmText !== 'DELETE'}
            >
              {isDeleting ? 'Deleting...' : 'Yes, delete'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
