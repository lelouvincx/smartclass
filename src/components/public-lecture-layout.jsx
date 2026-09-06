import React from 'react'
import { useTranslation } from 'react-i18next'
import { Link, Outlet } from 'react-router-dom'
import { useAuth } from '@/lib/auth-context'
import { getDefaultPathForRole } from '@/lib/navigation'
import { Button } from '@/components/ui/button'

export function PublicLectureLayout() {
  const { t } = useTranslation()
  const { user } = useAuth()

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b border-border bg-card">
        <div className="mx-auto flex min-h-16 max-w-6xl items-center justify-between gap-4 px-4 sm:px-6">
          <Link to="/lectures" className="font-semibold tracking-tight">SmartClass</Link>
          <Button asChild variant="outline">
            <Link to={user ? getDefaultPathForRole(user.role) : '/'}>
              {user ? t('common.openWorkspace') : t('common.signIn')}
            </Link>
          </Button>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-6 sm:px-6 sm:py-10">
        <Outlet />
      </main>
    </div>
  )
}
