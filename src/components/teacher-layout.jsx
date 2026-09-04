import { Outlet, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useAuth } from '@/lib/auth-context'
import { AppShell } from '@/design-system/app-shell'
import { BookOpen, ClipboardList, LayoutDashboard, Plus, Users } from 'lucide-react'

export function TeacherLayout() {
  const navigate = useNavigate()
  const { user, logout } = useAuth()
  const { t } = useTranslation()
  const navigation = [
    { label: t('common.dashboard'), to: '/teacher', icon: LayoutDashboard, end: true },
    { label: t('common.students'), to: '/teacher/students', icon: Users },
    { label: t('common.exercises'), to: '/teacher/exercises', icon: ClipboardList, end: true },
    { label: t('common.lectures'), to: '/teacher/lectures', icon: BookOpen },
    { label: t('common.create'), to: '/teacher/exercises/new', icon: Plus },
  ]

  function handleLogout() {
    logout()
    navigate('/', { replace: true })
  }

  return (
    <AppShell
      items={navigation}
      workspaceLabel={t('common.teacher')}
      userLabel={user?.name || user?.phone}
      onLogout={handleLogout}
    >
      <Outlet />
    </AppShell>
  )
}
