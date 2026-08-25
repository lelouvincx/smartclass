import { Outlet, useNavigate } from 'react-router-dom'
import { useAuth } from '@/lib/auth-context'
import { AppShell } from '@/design-system/app-shell'
import { ClipboardList, LayoutDashboard, Plus, Users } from 'lucide-react'

const TEACHER_NAVIGATION = [
  { label: 'Dashboard', to: '/teacher', icon: LayoutDashboard, end: true },
  { label: 'Students', to: '/teacher/students', icon: Users },
  { label: 'Exercises', to: '/teacher/exercises', icon: ClipboardList, end: true },
  { label: 'Create', to: '/teacher/exercises/new', icon: Plus },
]

export function TeacherLayout() {
  const navigate = useNavigate()
  const { user, logout } = useAuth()

  function handleLogout() {
    logout()
    navigate('/', { replace: true })
  }

  return (
    <AppShell
      items={TEACHER_NAVIGATION}
      workspaceLabel="Teacher"
      userLabel={user?.phone}
      onLogout={handleLogout}
    >
      <Outlet />
    </AppShell>
  )
}
