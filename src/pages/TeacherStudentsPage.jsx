import React, { useCallback, useEffect, useState } from 'react'
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

const STATUS_FILTERS = [
  { label: 'Active', value: 'active' },
  { label: 'Pending', value: 'pending' },
]

const STATUS_VARIANT = {
  active: 'default',
  pending: 'secondary',
  disabled: 'outline',
}

function formatDate(isoStr) {
  if (!isoStr) return '—'
  const d = new Date(isoStr)
  return d.toLocaleDateString('vi-VN', { year: 'numeric', month: '2-digit', day: '2-digit' })
}

export default function TeacherStudentsPage() {
  const { token } = useAuth()
  const [students, setStudents] = useState([])
  const [loading, setLoading] = useState(true)
  const [statusFilter, setStatusFilter] = useState(null)
  const [phone, setPhone] = useState('')
  const [creating, setCreating] = useState(false)
  const [approvingId, setApprovingId] = useState(null)
  const [error, setError] = useState('')
  const [successMessage, setSuccessMessage] = useState('')

  const loadStudents = useCallback(async () => {
    setLoading(true)
    try {
      const res = await listStudents(token, { status: statusFilter })
      setStudents(res.data || [])
    } catch {
      setStudents([])
    } finally {
      setLoading(false)
    }
  }, [token, statusFilter])

  useEffect(() => {
    loadStudents()
  }, [loadStudents])

  function handleFilterChange(filterValue) {
    setStatusFilter(filterValue === statusFilter ? null : filterValue)
  }

  async function handleApprove(studentId) {
    setApprovingId(studentId)
    try {
      const res = await approveStudent(token, studentId)
      toast.success(res.message || 'Student approved successfully.')
      await loadStudents()
    } catch (err) {
      toast.error(err.message)
    } finally {
      setApprovingId(null)
    }
  }

  async function handleCreate(e) {
    e.preventDefault()
    setError('')
    setSuccessMessage('')

    const trimmed = phone.trim()
    if (!trimmed) {
      setError('Phone is required.')
      return
    }

    setCreating(true)
    try {
      const res = await createStudent(token, { phone: trimmed })
      setPhone('')
      setSuccessMessage(res.message || 'Student created.')
      await loadStudents()
    } catch (err) {
      setError(err.message)
    } finally {
      setCreating(false)
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader title="Students" description="Manage student accounts." />

      <Card>
        <CardHeader className="pb-4">
          <CardTitle className="text-lg">Create Student</CardTitle>
          <CardDescription>
            Enter a phone number to create a new student account. Default password is 123.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleCreate} className="flex flex-col gap-3 sm:flex-row sm:items-end">
            <div className="flex-1 space-y-1.5">
              <Label htmlFor="phone">Phone number</Label>
              <Input
                id="phone"
                placeholder="+84xxx or 0xxx"
                value={phone}
                onChange={(e) => {
                  setPhone(e.target.value)
                  if (error) setError('')
                }}
                disabled={creating}
              />
            </div>
            <Button type="submit" disabled={creating}>
              {creating ? 'Creating...' : 'Create Student'}
            </Button>
          </form>
          {error && (
            <p className="mt-2 text-sm text-destructive">{error}</p>
          )}
          {successMessage && (
            <p className="mt-2 text-sm text-green-600 dark:text-green-400">{successMessage}</p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-4">
          <div className="flex items-center justify-between">
            <CardTitle className="text-lg">Student List</CardTitle>
            <div className="flex gap-1">
              {STATUS_FILTERS.map((f) => (
                <Button
                  key={f.value}
                  variant={statusFilter === f.value ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => handleFilterChange(f.value)}
                  aria-label={f.label}
                >
                  {f.label}
                </Button>
              ))}
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <p className="py-8 text-center text-sm text-muted-foreground">Loading...</p>
          ) : students.length === 0 ? (
            <EmptyState
              icon={Users}
              title="No students yet."
              description={statusFilter
                ? `No ${statusFilter} students match this filter.`
                : 'Create a student account to start building your class.'}
            />
          ) : (
            <div data-testid="responsive-student-list" className="grid gap-3" aria-label="Students">
              {students.map((student) => (
                <div
                  key={student.id}
                  className="grid min-w-0 gap-3 rounded-lg border p-3 sm:grid-cols-[minmax(0,1fr)_auto_auto] sm:items-center"
                >
                  <div className="min-w-0">
                    <p className="min-w-0 truncate font-mono text-sm">{student.phone}</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Created {formatDate(student.created_at)}
                    </p>
                  </div>
                  <Badge className="w-fit" variant={STATUS_VARIANT[student.status] || 'outline'}>
                    {student.status.charAt(0).toUpperCase() + student.status.slice(1)}
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
                          <Spinner data-icon="inline-start" />
                        ) : null}
                        {approvingId === student.id ? 'Approving...' : 'Approve'}
                      </Button>
                    ) : (
                      <span className="hidden text-sm text-muted-foreground sm:inline">—</span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
