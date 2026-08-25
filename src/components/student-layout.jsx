import { Outlet, useNavigate } from 'react-router-dom'
import { useAuth } from '@/lib/auth-context'
import { AppShell } from '@/design-system/app-shell'
import { ClipboardList, History, LayoutDashboard } from 'lucide-react'

const STUDENT_NAVIGATION = [
  { label: 'Dashboard', to: '/student', icon: LayoutDashboard, end: true },
  { label: 'Exercises', to: '/student/exercises', icon: ClipboardList },
  { label: 'History', to: '/student/submissions', icon: History },
]

export function StudentLayout() {
  const navigate = useNavigate()
  const { user, logout } = useAuth()

  function handleLogout() {
    logout()
    navigate('/', { replace: true })
  }

  return (
    <AppShell
      items={STUDENT_NAVIGATION}
      workspaceLabel="Student"
      userLabel={user?.phone}
      onLogout={handleLogout}
    >
      <Outlet />
    </AppShell>
  )
}
