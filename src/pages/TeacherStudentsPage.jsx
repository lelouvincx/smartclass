import React, { useCallback, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Users } from 'lucide-react'
import { listStudents, createStudent, approveStudent, updateStudentGrades, updateStudentName } from '@/lib/api'
import { toast } from 'sonner'
import { useAuth } from '@/lib/auth-context'
import GradeCheckboxGroup, { GradeBadges } from '@/components/grade-checkbox-group'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Spinner } from '@/components/ui/spinner'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { EmptyState } from '@/design-system/empty-state'
import { PageHeader } from '@/design-system/page-header'
import { formatFullDate } from '@/lib/format'
import { GRADES } from '@/lib/grades'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'

const STATUS_FILTERS = [
  'active',
  'pending',
]

const STATUS_VARIANT = {
  active: 'default',
  pending: 'secondary',
  disabled: 'outline',
}

function formatCreatedDate(isoStr, language) {
  if (!isoStr) return '—'
  const d = new Date(isoStr)
  return formatFullDate(d, language)
}

export default function TeacherStudentsPage() {
  const { t, i18n } = useTranslation()
  const { token } = useAuth()
  const requestIdRef = useRef(0)
  const [students, setStudents] = useState([])
  const [loadedFilter, setLoadedFilter] = useState(undefined)
  const [loading, setLoading] = useState(true)
  const [statusFilter, setStatusFilter] = useState(null)
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [newStudentGrades, setNewStudentGrades] = useState([...GRADES])
  const [creating, setCreating] = useState(false)
  const [selectedStudentIds, setSelectedStudentIds] = useState([])
  const [bulkGrades, setBulkGrades] = useState([...GRADES])
  const [isAssigningGrades, setIsAssigningGrades] = useState(false)
  const [approvingId, setApprovingId] = useState(null)
  const [renamingStudent, setRenamingStudent] = useState(null)
  const [renamedName, setRenamedName] = useState('')
  const [renameError, setRenameError] = useState('')
  const [isRenaming, setIsRenaming] = useState(false)
  const [createError, setCreateError] = useState('')
  const [listLoadError, setListLoadError] = useState('')
  const [successMessage, setSuccessMessage] = useState('')

  const loadStudents = useCallback(async () => {
    const requestId = ++requestIdRef.current
    const requestedFilter = statusFilter
    setLoading(true)
    setListLoadError('')
    try {
      const res = await listStudents(token, { status: requestedFilter })
      if (requestId !== requestIdRef.current) return
      setStudents(res.data || [])
      setLoadedFilter(requestedFilter)
    } catch (loadError) {
      if (requestId !== requestIdRef.current) return
      setListLoadError(loadError.message || t('teacher.students.loadError'))
    } finally {
      if (requestId === requestIdRef.current) setLoading(false)
    }
  }, [token, statusFilter, t])

  useEffect(() => {
    loadStudents()
  }, [loadStudents])

  function handleFilterChange(filterValue) {
    setStatusFilter(filterValue === statusFilter ? null : filterValue)
    setSelectedStudentIds([])
  }

  const hasCurrentRows = loadedFilter === statusFilter

  async function handleApprove(studentId) {
    setApprovingId(studentId)
    try {
      const res = await approveStudent(token, studentId)
      toast.success(res.message || t('teacher.students.approvedFallback'))
      await loadStudents()
    } catch (err) {
      toast.error(err.message)
    } finally {
      setApprovingId(null)
    }
  }

  async function handleCreate(e) {
    e.preventDefault()
    setCreateError('')
    setSuccessMessage('')

    const trimmedPhone = phone.trim()
    const trimmedName = name.trim()
    if (!trimmedPhone) {
      setCreateError(t('teacher.students.phoneRequired'))
      return
    }
    if (!trimmedName) {
      setCreateError(t('teacher.students.nameRequired'))
      return
    }
    if (newStudentGrades.length === 0) {
      setCreateError(t('teacher.students.gradeRequired'))
      return
    }

    setCreating(true)
    try {
      const res = await createStudent(token, {
        name: trimmedName,
        phone: trimmedPhone,
        grades: newStudentGrades,
      })
      setName('')
      setPhone('')
      setNewStudentGrades([...GRADES])
      setSuccessMessage(res.message || t('teacher.students.createdFallback'))
      await loadStudents()
    } catch (err) {
      setCreateError(err.message)
    } finally {
      setCreating(false)
    }
  }

  function handleRenameDialogChange(open) {
    if (isRenaming) return
    if (!open) {
      setRenamingStudent(null)
      setRenamedName('')
      setRenameError('')
    }
  }

  function openRenameDialog(student) {
    setRenamingStudent(student)
    setRenamedName(student.name || '')
    setRenameError('')
  }

  async function handleRename(event) {
    event.preventDefault()
    const trimmedName = renamedName.trim()
    if (!trimmedName) {
      setRenameError(t('teacher.students.nameRequired'))
      return
    }

    setIsRenaming(true)
    try {
      const res = await updateStudentName(token, renamingStudent.id, { name: trimmedName })
      toast.success(res.message || t('teacher.students.renamedFallback'))
      setRenamingStudent(null)
      setRenamedName('')
      await loadStudents()
    } catch (error) {
      setRenameError(error.message)
    } finally {
      setIsRenaming(false)
    }
  }

  function toggleStudentSelection(studentId) {
    setSelectedStudentIds((current) => current.includes(studentId)
      ? current.filter((id) => id !== studentId)
      : [...current, studentId])
  }

  function toggleAllStudents() {
    setSelectedStudentIds(selectedStudentIds.length === students.length
      ? []
      : students.map((student) => student.id))
  }

  async function handleAssignGrades() {
    if (selectedStudentIds.length === 0 || bulkGrades.length === 0) return

    setIsAssigningGrades(true)
    try {
      const res = await updateStudentGrades(token, {
        student_ids: selectedStudentIds,
        grades: bulkGrades,
      })
      toast.success(res.message || t('teacher.students.gradesUpdatedFallback'))
      setSelectedStudentIds([])
      await loadStudents()
    } catch (assignError) {
      toast.error(assignError.message)
    } finally {
      setIsAssigningGrades(false)
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader title={t('teacher.students.title')} description={t('teacher.students.description')} />

      <Card>
        <CardHeader className="pb-4">
          <CardTitle className="text-lg">{t('teacher.students.createTitle')}</CardTitle>
          <CardDescription>
            {t('teacher.students.createDescription')}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form noValidate onSubmit={handleCreate} className="grid gap-4 lg:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="student-name">{t('teacher.students.name')}</Label>
              <Input
                id="student-name"
                name="name"
                type="text"
                autoComplete="name"
                required
                value={name}
                onChange={(e) => {
                  setName(e.target.value)
                  if (createError) setCreateError('')
                }}
                disabled={creating}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="phone">{t('teacher.students.phone')}</Label>
              <Input
                id="phone"
                name="phone"
                type="tel"
                required
                placeholder={t('teacher.students.phonePlaceholder')}
                value={phone}
                onChange={(e) => {
                  setPhone(e.target.value)
                  if (createError) setCreateError('')
                }}
                disabled={creating}
              />
            </div>
            <GradeCheckboxGroup
              id="new-student-grades"
              className="lg:col-span-2"
              legend={t('teacher.students.studentGrades')}
              description={t('teacher.students.studentGradesDescription')}
              value={newStudentGrades}
              onChange={(grades) => {
                setNewStudentGrades(grades)
                if (createError) setCreateError('')
              }}
              disabled={creating}
            />
            <Button className="w-full sm:w-fit" type="submit" disabled={creating}>
              {creating ? t('teacher.students.creating') : t('teacher.students.create')}
            </Button>
          </form>
          {createError && (
            <p role="alert" className="mt-2 text-sm text-destructive">{createError}</p>
          )}
          {successMessage && (
            <p className="mt-2 text-sm text-green-600 dark:text-green-400">{successMessage}</p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-4">
          <div className="flex items-center justify-between">
            <CardTitle className="text-lg">{t('teacher.students.listTitle')}</CardTitle>
            <div className="flex gap-1">
              {STATUS_FILTERS.map((status) => (
                <Button
                  key={status}
                  variant={statusFilter === status ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => handleFilterChange(status)}
                  aria-label={t(`teacher.students.${status}`)}
                >
                  {t(`teacher.students.${status}`)}
                </Button>
              ))}
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {loading && !hasCurrentRows ? (
            <p className="py-8 text-center text-sm text-muted-foreground">{t('teacher.students.loading')}</p>
          ) : listLoadError && !hasCurrentRows ? (
            <div className="space-y-3 py-8 text-center">
              <p className="font-medium">{t('teacher.students.loadError')}</p>
              <Button type="button" variant="outline" onClick={loadStudents}>{t('teacher.students.retry')}</Button>
            </div>
          ) : hasCurrentRows && students.length === 0 ? (
            <EmptyState
              icon={Users}
              title={t('teacher.students.empty')}
              description={statusFilter
                ? t('teacher.students.emptyFiltered', { status: t(`teacher.students.${statusFilter}`).toLocaleLowerCase(i18n.resolvedLanguage) })
                : t('teacher.students.emptyDescription')}
            />
          ) : hasCurrentRows ? (
            <>
              {listLoadError && (
                <div className="mb-3 flex items-center justify-between gap-3 rounded-md border border-destructive/40 p-3">
                  <p className="text-sm text-destructive">{t('teacher.students.staleError')}</p>
                  <Button type="button" variant="outline" size="sm" onClick={loadStudents}>{t('teacher.students.retry')}</Button>
                </div>
              )}
              <div className="mb-4 grid gap-4 rounded-lg border bg-muted/30 p-4 lg:grid-cols-[auto_minmax(0,1fr)_auto] lg:items-end">
                <label className="flex min-h-[var(--sc-component-hit-target)] cursor-pointer items-center gap-2 text-sm font-medium">
                  <input
                    type="checkbox"
                    className="size-4 accent-primary"
                    checked={students.length > 0 && selectedStudentIds.length === students.length}
                    onChange={toggleAllStudents}
                  />
                  {t('teacher.students.selectAll')}
                </label>
                <GradeCheckboxGroup
                  id="bulk-student-grades"
                  legend={t('teacher.students.gradesToAssign')}
                  value={bulkGrades}
                  onChange={setBulkGrades}
                  disabled={isAssigningGrades}
                />
                <Button
                  type="button"
                  onClick={handleAssignGrades}
                  disabled={isAssigningGrades || selectedStudentIds.length === 0 || bulkGrades.length === 0}
                >
                  {isAssigningGrades
                    ? t('teacher.students.assigningGrades')
                    : t('teacher.students.assignGrades', { count: selectedStudentIds.length })}
                </Button>
              </div>
              <div data-testid="responsive-student-list" className="grid gap-3" aria-label={t('teacher.students.listLabel')}>
                {students.map((student) => (
                  <div
                    key={student.id}
                    className="grid min-w-0 grid-cols-[auto_minmax(0,1fr)] gap-3 rounded-lg border p-3 sm:grid-cols-[auto_minmax(0,1fr)_auto_auto] sm:items-center"
                  >
                    <label className="flex size-12 cursor-pointer items-center justify-center self-start sm:self-center">
                      <span className="sr-only">
                        {t('teacher.students.selectNamed', { name: student.name || student.phone })}
                      </span>
                      <input
                        type="checkbox"
                        className="size-4 accent-primary"
                        checked={selectedStudentIds.includes(student.id)}
                        onChange={() => toggleStudentSelection(student.id)}
                      />
                    </label>
                    <div className="min-w-0">
                      <p className="min-w-0 truncate font-medium">
                        {student.name || t('teacher.students.nameMissing')}
                      </p>
                      <p className="mt-1 min-w-0 truncate font-mono text-sm text-muted-foreground">{student.phone}</p>
                      <GradeBadges
                        className="mt-2"
                        grades={student.grades}
                        emptyText={t('teacher.students.noGrades')}
                      />
                      <p className="mt-1 text-xs text-muted-foreground">
                        {t('teacher.students.created', { date: formatCreatedDate(student.created_at, i18n.resolvedLanguage) })}
                      </p>
                    </div>
                    <Badge className="w-fit" variant={STATUS_VARIANT[student.status] || 'outline'}>
                      {t(`teacher.students.${student.status}`, { defaultValue: student.status })}
                    </Badge>
                    <div className="flex flex-col gap-2 sm:min-w-24 sm:flex-row sm:justify-end">
                      <Button
                        className="w-full sm:w-auto"
                        type="button"
                        size="sm"
                        variant="outline"
                        aria-label={t('teacher.students.renameNamed', {
                          name: student.name || student.phone,
                        })}
                        onClick={() => openRenameDialog(student)}
                      >
                        {t('teacher.students.rename')}
                      </Button>
                      {student.status === 'pending' ? (
                        <Button
                          className="w-full sm:w-auto"
                          size="sm"
                          variant="default"
                          onClick={() => handleApprove(student.id)}
                          disabled={approvingId === student.id}
                        >
                          {approvingId === student.id ? (
                            <Spinner data-icon="inline-start" aria-label={t('common.loading')} />
                          ) : null}
                          {approvingId === student.id ? t('teacher.students.approving') : t('teacher.students.approve')}
                        </Button>
                      ) : null}
                    </div>
                  </div>
                ))}
              </div>
            </>
          ) : null}
        </CardContent>
      </Card>

      <Dialog open={Boolean(renamingStudent)} onOpenChange={handleRenameDialogChange}>
        <DialogContent closeLabel={t('common.close')}>
          <DialogHeader>
            <DialogTitle>{t('teacher.students.renameTitle')}</DialogTitle>
            <DialogDescription>
              {t('teacher.students.renameDescription', { phone: renamingStudent?.phone })}
            </DialogDescription>
          </DialogHeader>
          <form id="rename-student-form" noValidate onSubmit={handleRename} className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="renamed-student-name">{t('teacher.students.name')}</Label>
              <Input
                id="renamed-student-name"
                name="name"
                type="text"
                autoComplete="name"
                required
                aria-invalid={Boolean(renameError)}
                aria-describedby={renameError ? 'rename-student-error' : undefined}
                value={renamedName}
                onChange={(event) => {
                  setRenamedName(event.target.value)
                  if (renameError) setRenameError('')
                }}
                disabled={isRenaming}
              />
            </div>
            {renameError && (
              <p id="rename-student-error" role="alert" className="text-sm text-destructive">
                {renameError}
              </p>
            )}
          </form>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => handleRenameDialogChange(false)} disabled={isRenaming}>
              {t('teacher.students.cancel')}
            </Button>
            <Button type="submit" form="rename-student-form" disabled={isRenaming}>
              {isRenaming ? t('teacher.students.savingName') : t('teacher.students.saveName')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
