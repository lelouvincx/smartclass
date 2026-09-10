import React, { useState } from 'react'
import { Link, Navigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { joinWorkspace } from '@/lib/api'
import { useAuth } from '@/lib/auth-context'
import { DEFAULT_STUDENT_GRADES } from '@/lib/grades'
import { GradeDropdown } from '@/components/grade-checkbox-group'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { FieldError } from '@/components/ui/field'

export default function WorkspaceStatusPage() {
  const auth = useAuth()
  const { token, user, membership, workspace, defaultPath, refreshUser, isActiveStudent, canManage, isLoading } = auth
  const { t } = useTranslation()
  const [grades, setGrades] = useState([...DEFAULT_STUDENT_GRADES])
  const [error, setError] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)

  if (isLoading) return <p className="p-6">{t('common.loading')}</p>
  if (!user) return <Navigate to="/" replace />
  if (canManage || isActiveStudent) return <Navigate to={defaultPath} replace />

  async function handleJoin(event) {
    event.preventDefault()
    setError('')
    if (grades.length === 0) {
      setError(t('common.gradeRequired'))
      return
    }

    setIsSubmitting(true)
    try {
      await joinWorkspace(token, { grades })
      await refreshUser()
    } catch (joinError) {
      setError(joinError.message)
    } finally {
      setIsSubmitting(false)
    }
  }

  const workspaceName = workspace?.id === 'english' ? t('common.englishSite') : t('common.mathsSite')
  const isPending = membership?.status === 'pending'
  const isDisabled = membership?.status === 'disabled' || user.disabled_at != null

  return (
    <main className="min-h-screen bg-background flex items-center justify-center p-4">
      <Card className="w-full max-w-lg">
        <CardHeader>
          <CardTitle><h1>{workspaceName}</h1></CardTitle>
          <CardDescription>
            {membership || isDisabled
              ? t(isDisabled ? 'common.workspaceDisabledDescription' : 'common.workspacePendingDescription')
              : t('common.workspaceJoinDescription')}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {membership || isDisabled ? (
            <div className="space-y-4">
              <p className="rounded-[var(--sc-component-card-shape)] border bg-muted/30 p-4 text-sm text-muted-foreground">
                {isDisabled ? t('common.workspaceDisabled') : isPending ? t('common.workspacePending') : t('common.workspaceUnavailable')}
              </p>
            </div>
          ) : (
            <form onSubmit={handleJoin} className="space-y-4">
              <GradeDropdown
                id="join-workspace-grades"
                legend={t('common.gradeAccess')}
                description={t('common.workspaceJoinProgrammes')}
                value={grades}
                onChange={setGrades}
                disabled={isSubmitting}
              />
              {error && <FieldError>{error}</FieldError>}
              <Button type="submit" disabled={isSubmitting || grades.length === 0}>
                {isSubmitting ? t('common.joiningWorkspace') : t('common.joinWorkspace')}
              </Button>
            </form>
          )}
          <div className="mt-4 flex flex-wrap gap-2">
            <Button variant="outline" asChild><Link to="/settings">{t('common.settings')}</Link></Button>
            <Button variant="outline" onClick={auth.logout}>{t('common.logout')}</Button>
          </div>
        </CardContent>
      </Card>
    </main>
  )
}
