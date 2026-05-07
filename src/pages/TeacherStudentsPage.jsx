import React, { useCallback, useEffect, useState } from 'react'
import { listStudents, createStudent } from '@/lib/api'
import { useAuth } from '@/lib/auth-context'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'

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
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Students</h1>
        <p className="text-sm text-muted-foreground">Manage student accounts.</p>
      </div>

      <Card>
        <CardHeader className="pb-4">
          <CardTitle className="text-lg">Create Student</CardTitle>
          <CardDescription>
            Enter a phone number to create a new student account. Default password is 123.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleCreate} className="flex gap-2">
            <div className="flex-1 space-y-1.5">
              <Label htmlFor="phone" className="sr-only">Phone number</Label>
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
            <p className="py-8 text-center text-sm text-muted-foreground">No students yet.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Phone</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="hidden sm:table-cell">Created</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {students.map((s) => (
                  <TableRow key={s.id}>
                    <TableCell className="font-mono text-sm">{s.phone}</TableCell>
                    <TableCell>
                      <Badge variant={STATUS_VARIANT[s.status] || 'outline'}>
                        {s.status.charAt(0).toUpperCase() + s.status.slice(1)}
                      </Badge>
                    </TableCell>
                    <TableCell className="hidden text-sm text-muted-foreground sm:table-cell">
                      {formatDate(s.created_at)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
