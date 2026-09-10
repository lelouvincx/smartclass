import React, { useCallback, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ChevronDown, Users } from '@/components/material-symbol'
import { useSearchParams } from 'react-router-dom'
import { listStudents, createStudent, approveStudent, removeStudent, updateStudentAccessTier, updateStudentGlobalStatus, updateStudentGrades, updateStudentName, updateStudentStatus } from '@/lib/api'
import { toast } from 'sonner'
import { useAuth } from '@/lib/auth-context'
import { GradeBadges, GradeDropdown } from '@/components/grade-checkbox-group'
import AccessTierRadioGroup, { AccessTierBadge } from '@/components/access-tier-radio-group'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Checkbox } from '@/components/ui/checkbox'
import { Spinner } from '@/components/ui/spinner'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { EmptyState } from '@/design-system/empty-state'
import { PageHeader } from '@/design-system/page-header'
import { formatFullDate } from '@/lib/format'
import { DEFAULT_STUDENT_GRADES } from '@/lib/grades'
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
  'disabled',
]

const STATUS_VARIANT = {
  active: 'success',
  pending: 'secondary',
  disabled: 'outline',
}

function formatCreatedDate(isoStr, language) {
  if (!isoStr) return '-'
  const d = new Date(isoStr)
  return formatFullDate(d, language)
}

function StudentRowActions({
  student,
  approvingId,
  updatingStatusId,
  onApprove,
  onRename,
  onToggleStatus,
  onGlobalStatus,
  isPlatformAdmin,
  onRemove,
  t,
}) {
  const displayName = student.name || student.phone
  const isPending = student.status === 'pending'
  const hasProgrammes = Array.isArray(student.grades) && student.grades.length > 0
  const actionVariant = isPending ? 'default' : 'outline'
  const menuButtonClassName = isPending
    ? 'w-9 rounded-l-none border-l border-primary-foreground/25 px-0'
    : '-ml-px w-9 rounded-l-none px-0'
  const toggleLabel = student.status === 'disabled'
    ? t(updatingStatusId === student.id ? 'teacher.students.activating' : 'teacher.students.activate')
    : t(updatingStatusId === student.id ? 'teacher.students.deactivating' : 'teacher.students.deactivate')
  const toggleAriaLabel = t(student.status === 'disabled'
    ? 'teacher.students.activateNamed'
    : 'teacher.students.deactivateNamed', {
    name: displayName,
  })

  return (
    <div className="flex w-full justify-stretch sm:w-auto sm:justify-end">
      <div className="inline-flex w-full min-w-0 rounded-[var(--sc-component-control-shape)] shadow-sm sm:w-auto">
        {isPending ? (
          <Button
            className="min-w-0 flex-1 rounded-r-none sm:flex-none"
            size="sm"
            variant={actionVariant}
            onClick={() => onApprove(student.id)}
            disabled={approvingId === student.id || !hasProgrammes || student.globally_disabled}
          >
            {approvingId === student.id ? (
              <Spinner data-icon="inline-start" aria-label={t('common.loading')} />
            ) : null}
            {approvingId === student.id ? t('teacher.students.approving') : t('teacher.students.approve')}
          </Button>
        ) : (
          <Button
            className="min-w-0 flex-1 rounded-r-none sm:flex-none"
            type="button"
            size="sm"
            variant={actionVariant}
            aria-label={toggleAriaLabel}
            onClick={() => onToggleStatus(student)}
            disabled={updatingStatusId === student.id || (student.status === 'disabled' && (!hasProgrammes || student.globally_disabled))}
          >
            {updatingStatusId === student.id ? (
              <Spinner data-icon="inline-start" aria-label={t('common.loading')} />
            ) : null}
            {toggleLabel}
          </Button>
        )}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              className={menuButtonClassName}
              type="button"
              size="icon-sm"
              variant={actionVariant}
              aria-label={t('teacher.students.moreActionsNamed', { name: displayName })}
            >
              <ChevronDown className="size-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-40">
            <DropdownMenuItem onSelect={() => onRename(student)} aria-label={t('teacher.students.renameNamed', { name: displayName })}>
              {t('teacher.students.rename')}
            </DropdownMenuItem>
            {isPlatformAdmin ? (
              <DropdownMenuItem
                variant={student.globally_disabled ? undefined : 'destructive'}
                onSelect={() => onGlobalStatus(student)}
                aria-label={t(student.globally_disabled ? 'teacher.students.restoreGlobalNamed' : 'teacher.students.disableGlobalNamed', { name: displayName })}
              >
                {t(student.globally_disabled ? 'teacher.students.restoreGlobal' : 'teacher.students.disableGlobal')}
              </DropdownMenuItem>
            ) : null}
            {student.status === 'pending' ? (
              <DropdownMenuItem
                onSelect={() => onToggleStatus(student)}
                disabled={updatingStatusId === student.id}
                aria-label={toggleAriaLabel}
              >
                {toggleLabel}
              </DropdownMenuItem>
            ) : null}
            <DropdownMenuItem
              variant="destructive"
              onSelect={() => onRemove(student)}
              aria-label={t('teacher.students.removeNamed', { name: displayName })}
            >
              {t('teacher.students.remove')}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  )
}

export default function TeacherStudentsPage() {
  const { t, i18n } = useTranslation()
  const { token, user, isPlatformAdmin, workspace } = useAuth()
  const [searchParams, setSearchParams] = useSearchParams()
  const requestIdRef = useRef(0)
  const nameInputRef = useRef(null)
  const [students, setStudents] = useState([])
  const [loadedFilter, setLoadedFilter] = useState(undefined)
  const [loading, setLoading] = useState(true)
  const [statusFilter, setStatusFilter] = useState(null)
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [newStudentGrades, setNewStudentGrades] = useState([...DEFAULT_STUDENT_GRADES])
  const [newStudentAccessTier, setNewStudentAccessTier] = useState('standard')
  const [creating, setCreating] = useState(false)
  const [selectedStudentIds, setSelectedStudentIds] = useState([])
  const [bulkGrades, setBulkGrades] = useState([...DEFAULT_STUDENT_GRADES])
  const [isAssigningGrades, setIsAssigningGrades] = useState(false)
  const [bulkAccessTier, setBulkAccessTier] = useState('standard')
  const [isAssigningAccessTier, setIsAssigningAccessTier] = useState(false)
  const [approvingId, setApprovingId] = useState(null)
  const [updatingStatusId, setUpdatingStatusId] = useState(null)
  const [renamingStudent, setRenamingStudent] = useState(null)
  const [renamedName, setRenamedName] = useState('')
  const [renameError, setRenameError] = useState('')
  const [isRenaming, setIsRenaming] = useState(false)
  const [removingStudent, setRemovingStudent] = useState(null)
  const [globalStatusStudent, setGlobalStatusStudent] = useState(null)
  const [globalStatusConfirmation, setGlobalStatusConfirmation] = useState('')
  const [globalStatusError, setGlobalStatusError] = useState('')
  const [isUpdatingGlobalStatus, setIsUpdatingGlobalStatus] = useState(false)
  const [removeConfirmation, setRemoveConfirmation] = useState('')
  const [removeError, setRemoveError] = useState('')
  const [isRemoving, setIsRemoving] = useState(false)
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

  useEffect(() => {
    if (searchParams.get('create') !== 'student') return

    nameInputRef.current?.focus()
    const nextParams = new URLSearchParams(searchParams)
    nextParams.delete('create')
    setSearchParams(nextParams, { replace: true })
  }, [searchParams, setSearchParams])

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

  async function handleToggleStatus(student) {
    const nextStatus = student.status === 'disabled' ? 'active' : 'disabled'
    setUpdatingStatusId(student.id)
    try {
      const res = await updateStudentStatus(token, student.id, { status: nextStatus })
      toast.success(res.message || t(nextStatus === 'active'
        ? 'teacher.students.activatedFallback'
        : 'teacher.students.deactivatedFallback'))
      setSelectedStudentIds((current) => nextStatus === 'disabled'
        ? current.filter((id) => id !== student.id)
        : current)
      await loadStudents()
    } catch (err) {
      toast.error(err.message)
    } finally {
      setUpdatingStatusId(null)
    }
  }

  function handleRemoveDialogChange(open) {
    if (isRemoving) return
    if (!open) {
      setRemovingStudent(null)
      setRemoveConfirmation('')
      setRemoveError('')
    }
  }

  function openRemoveDialog(student) {
    setRemovingStudent(student)
    setRemoveConfirmation('')
    setRemoveError('')
  }

  function handleGlobalStatusDialogChange(open) {
    if (isUpdatingGlobalStatus) return
    if (!open) {
      setGlobalStatusStudent(null)
      setGlobalStatusConfirmation('')
      setGlobalStatusError('')
    }
  }

  function openGlobalStatusDialog(student) {
    setGlobalStatusStudent(student)
    setGlobalStatusConfirmation('')
    setGlobalStatusError('')
  }

  async function handleGlobalStatus(event) {
    event.preventDefault()
    if (globalStatusConfirmation !== 'GLOBAL') return
    setIsUpdatingGlobalStatus(true)
    setGlobalStatusError('')
    try {
      const disabled = !globalStatusStudent.globally_disabled
      await updateStudentGlobalStatus(token, globalStatusStudent.id, { disabled })
      toast.success(t(disabled ? 'teacher.students.globalDisabledFallback' : 'teacher.students.globalRestoredFallback'))
      setGlobalStatusStudent(null)
      setGlobalStatusConfirmation('')
      await loadStudents()
    } catch (error) {
      setGlobalStatusError(error.message)
    } finally {
      setIsUpdatingGlobalStatus(false)
    }
  }

  async function handleRemove(event) {
    event.preventDefault()
    if (removeConfirmation !== 'REMOVE') return

    setIsRemoving(true)
    setRemoveError('')
    try {
      const res = await removeStudent(token, removingStudent.id)
      toast.success(res.message || t('teacher.students.removedFallback'))
      setRemovingStudent(null)
      setRemoveConfirmation('')
      setSelectedStudentIds((current) => current.filter((id) => id !== removingStudent.id))
      await loadStudents()
    } catch (error) {
      setRemoveError(error.message)
    } finally {
      setIsRemoving(false)
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
        access_tier: newStudentAccessTier,
      })
      setName('')
      setPhone('')
      setNewStudentGrades([...DEFAULT_STUDENT_GRADES])
      setNewStudentAccessTier('standard')
      setSuccessMessage(res.data?.defaultPassword
        ? t('common.newStudentPassword', { password: res.data.defaultPassword })
        : t('teacher.students.createdFallback'))
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
    const selectableStudentIds = students
      .filter((student) => statusFilter || student.status !== 'disabled')
      .map((student) => student.id)
    setSelectedStudentIds(selectedStudentIds.length === selectableStudentIds.length
      ? []
      : selectableStudentIds)
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

  async function handleAssignAccessTier() {
    if (selectedStudentIds.length === 0) return

    setIsAssigningAccessTier(true)
    try {
      const res = await updateStudentAccessTier(token, {
        student_ids: selectedStudentIds,
        access_tier: bulkAccessTier,
      })
      toast.success(res.message || t('teacher.students.accessTierUpdatedFallback'))
      setSelectedStudentIds([])
      await loadStudents()
    } catch (assignError) {
      toast.error(assignError.message)
    } finally {
      setIsAssigningAccessTier(false)
    }
  }

  const visibleStudents = statusFilter
    ? students
    : students.filter((student) => student.status !== 'disabled')

  return (
    <div className="space-y-6">
      <PageHeader title={t('teacher.students.title')} description={t('teacher.students.description')} />
      <p className="text-sm text-muted-foreground">
        {workspace?.id === 'english' ? t('common.englishSite') : t('common.mathsSite')}
        {' · '}{t('common.workspaceStudentControls')}
      </p>

      <Card>
        <CardHeader className="pb-4">
          <CardTitle className="text-lg">{t('teacher.students.createTitle')}</CardTitle>
          <CardDescription>
            {t('common.newStudentDescription')}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form noValidate onSubmit={handleCreate} className="grid gap-4 lg:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="student-name">{t('teacher.students.name')}</Label>
              <Input
                ref={nameInputRef}
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
            <GradeDropdown
              id="new-student-grades"
              className="lg:col-span-2 lg:max-w-md"
              legend={t('teacher.students.studentGrades')}
              description={t('teacher.students.studentGradesDescription')}
              value={newStudentGrades}
              onChange={(grades) => {
                setNewStudentGrades(grades)
                if (createError) setCreateError('')
              }}
              disabled={creating}
            />
            <AccessTierRadioGroup
              id="new-student-access-tier"
              legend={t('teacher.students.studentAccessTier')}
              value={newStudentAccessTier}
              onChange={setNewStudentAccessTier}
              disabled={creating}
              className="lg:col-span-2"
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
          <div className="flex flex-wrap items-center justify-between gap-3">
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
          ) : hasCurrentRows && visibleStudents.length === 0 ? (
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
                  <Checkbox
                    checked={visibleStudents.length > 0 && selectedStudentIds.length === visibleStudents.length}
                    onCheckedChange={toggleAllStudents}
                  />
                  {t('teacher.students.selectAll')}
                </label>
                <GradeDropdown
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
                <AccessTierRadioGroup
                  id="bulk-student-access-tier"
                  legend={t('teacher.students.accessTierToAssign')}
                  value={bulkAccessTier}
                  onChange={setBulkAccessTier}
                  disabled={isAssigningAccessTier}
                  className="lg:col-start-2"
                />
                <Button
                  type="button"
                  onClick={handleAssignAccessTier}
                  disabled={isAssigningAccessTier || selectedStudentIds.length === 0}
                >
                  {isAssigningAccessTier
                    ? t('teacher.students.assigningAccessTier')
                    : t('teacher.students.assignAccessTier', { count: selectedStudentIds.length })}
                </Button>
              </div>
              <div data-testid="responsive-student-list" className="grid gap-3" aria-label={t('teacher.students.listLabel')}>
                {visibleStudents.map((student) => (
                  <div
                    key={student.id}
                    className="grid min-w-0 grid-cols-1 gap-3 rounded-lg border p-3 sm:grid-cols-[auto_minmax(0,1fr)_auto_auto] sm:items-center"
                  >
                    <label className="flex size-12 cursor-pointer items-center justify-center self-start sm:self-center">
                      <span className="sr-only">
                        {t('teacher.students.selectNamed', { name: student.name || student.phone })}
                      </span>
                      <Checkbox
                        checked={selectedStudentIds.includes(student.id)}
                        onCheckedChange={() => toggleStudentSelection(student.id)}
                      />
                    </label>
                    <div className="min-w-0">
                      <p className="min-w-0 break-words font-medium">
                        {student.name || t('teacher.students.nameMissing')}
                      </p>
                      <p className="mt-1 min-w-0 truncate font-mono text-sm text-muted-foreground">{student.phone}</p>
                      <GradeBadges
                        className="mt-2"
                        grades={student.grades}
                        emptyText={t('teacher.students.noGrades')}
                      />
                      {student.status !== 'active' && !student.grades?.length ? (
                        <p className="mt-2 text-xs text-warning">
                          {t('teacher.students.assignProgrammesBeforeApproval')}
                        </p>
                      ) : null}
                      <div className="mt-2">
                        <AccessTierBadge tier={student.access_tier} />
                      </div>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {t('teacher.students.created', { date: formatCreatedDate(student.created_at, i18n.resolvedLanguage) })}
                      </p>
                    </div>
                    <Badge className="w-fit" variant={STATUS_VARIANT[student.status] || 'outline'}>
                      {t(`teacher.students.${student.status}`, { defaultValue: student.status })}
                    </Badge>
                    {student.globally_disabled ? (
                      <Badge className="w-fit" variant="destructive">
                        {t('teacher.students.globallyDisabled')}
                      </Badge>
                    ) : null}
                    <StudentRowActions
                      student={student}
                      approvingId={approvingId}
                      updatingStatusId={updatingStatusId}
                      onApprove={handleApprove}
                      onRename={openRenameDialog}
                      onToggleStatus={handleToggleStatus}
                      onGlobalStatus={openGlobalStatusDialog}
                      isPlatformAdmin={isPlatformAdmin && student.platform_role === 'user' && student.id !== user.id}
                      onRemove={openRemoveDialog}
                      t={t}
                    />
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
            <DialogTitle className="pr-12">{t('teacher.students.renameTitle')}</DialogTitle>
            <DialogDescription>
              {t('teacher.students.renameDescription', { phone: renamingStudent?.phone })}
            </DialogDescription>
          </DialogHeader>
          <form id="rename-student-form" noValidate onSubmit={handleRename} className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="renamed-student-name">{t('common.workspaceDisplayName')}</Label>
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

      <Dialog open={Boolean(removingStudent)} onOpenChange={handleRemoveDialogChange}>
        <DialogContent closeLabel={t('common.close')}>
          <DialogHeader>
            <DialogTitle>{t('teacher.students.removeTitle')}</DialogTitle>
            <DialogDescription>
              {t('teacher.students.removeDescription', {
                name: removingStudent?.name || removingStudent?.phone,
              })}
            </DialogDescription>
          </DialogHeader>
          <form id="remove-student-form" noValidate onSubmit={handleRemove} className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="remove-student-confirmation">{t('teacher.students.removeInstruction')}</Label>
              <Input
                id="remove-student-confirmation"
                name="confirmation"
                type="text"
                autoComplete="off"
                aria-invalid={Boolean(removeError)}
                aria-describedby={removeError ? 'remove-student-error' : undefined}
                value={removeConfirmation}
                onChange={(event) => {
                  setRemoveConfirmation(event.target.value)
                  if (removeError) setRemoveError('')
                }}
                disabled={isRemoving}
              />
            </div>
            {removeError && (
              <p id="remove-student-error" role="alert" className="text-sm text-destructive">
                {removeError}
              </p>
            )}
          </form>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => handleRemoveDialogChange(false)} disabled={isRemoving}>
              {t('teacher.students.cancel')}
            </Button>
            <Button type="submit" form="remove-student-form" variant="destructive" disabled={isRemoving || removeConfirmation !== 'REMOVE'}>
              {isRemoving ? t('teacher.students.removing') : t('teacher.students.confirmRemove')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(globalStatusStudent)} onOpenChange={handleGlobalStatusDialogChange}>
        <DialogContent closeLabel={t('common.close')}>
          <DialogHeader>
            <DialogTitle>
              {t(globalStatusStudent?.globally_disabled ? 'teacher.students.restoreGlobalTitle' : 'teacher.students.disableGlobalTitle')}
            </DialogTitle>
            <DialogDescription>
              {t(globalStatusStudent?.globally_disabled ? 'teacher.students.restoreGlobalDescription' : 'teacher.students.disableGlobalDescription', {
                name: globalStatusStudent?.name || globalStatusStudent?.phone,
              })}
            </DialogDescription>
          </DialogHeader>
          <form id="global-status-form" noValidate onSubmit={handleGlobalStatus} className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="global-status-confirmation">{t('teacher.students.globalStatusInstruction')}</Label>
              <Input
                id="global-status-confirmation"
                name="confirmation"
                type="text"
                autoComplete="off"
                aria-invalid={Boolean(globalStatusError)}
                aria-describedby={globalStatusError ? 'global-status-error' : undefined}
                value={globalStatusConfirmation}
                onChange={(event) => {
                  setGlobalStatusConfirmation(event.target.value)
                  if (globalStatusError) setGlobalStatusError('')
                }}
                disabled={isUpdatingGlobalStatus}
              />
            </div>
            {globalStatusError && (
              <p id="global-status-error" role="alert" className="text-sm text-destructive">
                {globalStatusError}
              </p>
            )}
          </form>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => handleGlobalStatusDialogChange(false)} disabled={isUpdatingGlobalStatus}>
              {t('teacher.students.cancel')}
            </Button>
            <Button type="submit" form="global-status-form" variant={globalStatusStudent?.globally_disabled ? 'default' : 'destructive'} disabled={isUpdatingGlobalStatus || globalStatusConfirmation !== 'GLOBAL'}>
              {isUpdatingGlobalStatus
                ? t('teacher.students.updatingGlobalStatus')
                : t(globalStatusStudent?.globally_disabled ? 'teacher.students.confirmRestoreGlobal' : 'teacher.students.confirmDisableGlobal')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
