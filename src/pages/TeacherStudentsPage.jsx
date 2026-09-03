import React, { useCallback, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Users } from 'lucide-react'
import { listStudents, createStudent, approveStudent } from '@/lib/api'
import { toast } from 'sonner'
import { useAuth } from '@/lib/auth-context'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Spinner } from '@/components/ui/spinner'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { EmptyState } from '@/design-system/empty-state'
import { PageHeader } from '@/design-system/page-header'
import { formatFullDate } from '@/lib/format'

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
  const [phone, setPhone] = useState('')
  const [creating, setCreating] = useState(false)
  const [approvingId, setApprovingId] = useState(null)
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

    const trimmed = phone.trim()
    if (!trimmed) {
      setCreateError(t('teacher.students.phoneRequired'))
      return
    }

    setCreating(true)
    try {
      const res = await createStudent(token, { phone: trimmed })
      setPhone('')
      setSuccessMessage(res.message || t('teacher.students.createdFallback'))
      await loadStudents()
    } catch (err) {
      setCreateError(err.message)
    } finally {
      setCreating(false)
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
          <form onSubmit={handleCreate} className="flex flex-col gap-3 sm:flex-row sm:items-end">
            <div className="flex-1 space-y-1.5">
              <Label htmlFor="phone">{t('teacher.students.phone')}</Label>
              <Input
                id="phone"
                placeholder={t('teacher.students.phonePlaceholder')}
                value={phone}
                onChange={(e) => {
                  setPhone(e.target.value)
                  if (createError) setCreateError('')
                }}
                disabled={creating}
              />
            </div>
            <Button type="submit" disabled={creating}>
              {creating ? t('teacher.students.creating') : t('teacher.students.create')}
            </Button>
          </form>
          {createError && (
            <p className="mt-2 text-sm text-destructive">{createError}</p>
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
              <div data-testid="responsive-student-list" className="grid gap-3" aria-label={t('teacher.students.listLabel')}>
                {students.map((student) => (
                  <div
                    key={student.id}
                    className="grid min-w-0 gap-3 rounded-lg border p-3 sm:grid-cols-[minmax(0,1fr)_auto_auto] sm:items-center"
                  >
                    <div className="min-w-0">
                      <p className="min-w-0 truncate font-mono text-sm">{student.phone}</p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {t('teacher.students.created', { date: formatCreatedDate(student.created_at, i18n.resolvedLanguage) })}
                      </p>
                    </div>
                    <Badge className="w-fit" variant={STATUS_VARIANT[student.status] || 'outline'}>
                      {t(`teacher.students.${student.status}`, { defaultValue: student.status })}
                    </Badge>
                    <div className="sm:min-w-24 sm:text-right">
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
                      ) : (
                        <span className="hidden text-sm text-muted-foreground sm:inline">—</span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </>
          ) : null}
        </CardContent>
      </Card>
    </div>
  )
}
