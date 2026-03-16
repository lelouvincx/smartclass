import { Outlet, useNavigate } from 'react-router-dom'
import { useAuth } from '@/lib/auth-context'
import { Button } from '@/components/ui/button'
import { ModeToggle } from '@/components/mode-toggle'
import { LogOut, Plus } from 'lucide-react'

export function TeacherLayout() {
  const navigate = useNavigate()
  const { user, logout } = useAuth()

  function handleLogout() {
    logout()
    navigate('/', { replace: true })
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-40 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="mx-auto flex h-14 max-w-5xl items-center justify-between px-6">
          <div className="flex items-center gap-4">
            <span className="text-sm font-semibold">SmartClass</span>
            <nav className="hidden items-center gap-1 sm:flex">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => navigate('/teacher')}
              >
                Dashboard
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => navigate('/teacher/exercises')}
              >
                Exercises
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => navigate('/teacher/exercises/new')}
              >
                <Plus className="h-4 w-4" />
                Create
              </Button>
            </nav>
          </div>
          <div className="flex items-center gap-2">
            {user?.phone && (
              <span className="hidden text-sm text-muted-foreground sm:inline">
                {user.phone}
              </span>
            )}
            <ModeToggle />
            <Button variant="outline" size="sm" onClick={handleLogout}>
              <LogOut className="h-4 w-4" />
              <span className="hidden sm:inline">Logout</span>
            </Button>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-5xl px-6 py-6">
        <Outlet />
      </main>
    </div>
  )
}
