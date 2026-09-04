import { Outlet, useLocation, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useAuth } from '@/lib/auth-context'
import { AppShell } from '@/design-system/app-shell'
import { BookOpen, ClipboardList, History, LayoutDashboard } from 'lucide-react'

export function StudentLayout() {
  const navigate = useNavigate()
  const location = useLocation()
  const { user, logout } = useAuth()
  const { t } = useTranslation()
  const isTakingExercise = /^\/student\/exercises\/[^/]+\/take\/?$/.test(location.pathname)
  const navigation = [
    { label: t('common.dashboard'), to: '/student', icon: LayoutDashboard, end: true },
    { label: t('common.exercises'), to: '/student/exercises', icon: ClipboardList },
    { label: t('common.lectures'), to: '/student/lectures', icon: BookOpen },
    { label: t('common.history'), to: '/student/submissions', icon: History },
  ]

  function handleLogout() {
    logout()
    navigate('/', { replace: true })
  }

  return (
    <AppShell
      items={navigation}
      workspaceLabel={t('common.student')}
      userLabel={user?.phone}
      onLogout={handleLogout}
      focusedWorkspace={isTakingExercise}
    >
      <Outlet />
    </AppShell>
  )
}
