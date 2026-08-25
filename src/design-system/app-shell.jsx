import { useState } from 'react'
import { Link, NavLink } from 'react-router-dom'
import { GraduationCap, LogOut, Menu, Settings } from 'lucide-react'
import { ModeToggle } from '@/components/mode-toggle'
import { Button } from '@/components/ui/button'
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { cn } from '@/lib/utils'

function Brand({ workspaceLabel }) {
  return (
    <div className="flex min-w-0 items-center gap-3">
      <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-sm">
        <GraduationCap className="size-5" aria-hidden="true" />
      </span>
      <span className="min-w-0">
        <span className="block text-sm font-semibold tracking-tight">SmartClass</span>
        <span className="block truncate text-xs text-muted-foreground">{workspaceLabel} workspace</span>
      </span>
    </div>
  )
}

function Navigation({ items, label, onNavigate }) {
  return (
    <nav aria-label={label} className="grid gap-1">
      {items.map(({ end, icon: Icon, label: itemLabel, to }) => (
        <NavLink
          key={to}
          to={to}
          end={end}
          onClick={onNavigate}
          className={({ isActive }) => cn(
            'flex min-h-11 items-center gap-3 rounded-xl px-3 py-2 text-sm font-medium text-muted-foreground transition-colors',
            'hover:bg-accent hover:text-accent-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring',
            isActive && 'bg-primary/10 text-primary',
          )}
        >
          <Icon className="size-4 shrink-0" aria-hidden="true" />
          <span>{itemLabel}</span>
        </NavLink>
      ))}
    </nav>
  )
}

function ShellFooter({ userLabel, onLogout, onNavigate }) {
  return (
    <div className="space-y-3 border-t px-3 py-4">
      {userLabel && (
        <p className="truncate px-2 text-xs text-muted-foreground" title={userLabel}>
          {userLabel}
        </p>
      )}
      <div className="grid grid-cols-[1fr_auto] gap-2">
        <Button variant="ghost" className="h-[44px] justify-start" asChild>
          <Link to="/settings" onClick={onNavigate}>
            <Settings aria-hidden="true" />
            Settings
          </Link>
        </Button>
        <ModeToggle className="size-[44px]" />
      </div>
      <Button
        variant="ghost"
        className="h-[44px] w-full justify-start text-destructive hover:bg-destructive/10 hover:text-destructive"
        onClick={onLogout}
      >
        <LogOut aria-hidden="true" />
        Logout
      </Button>
    </div>
  )
}

export function AppShell({ children, items, onLogout, userLabel, workspaceLabel }) {
  const [navigationOpen, setNavigationOpen] = useState(false)
  const navigationLabel = `${workspaceLabel} navigation`

  return (
    <div className="min-h-screen bg-background">
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-56 flex-col border-r bg-sidebar text-sidebar-foreground shadow-sm lg:flex">
        <div className="border-b px-5 py-5">
          <Brand workspaceLabel={workspaceLabel} />
        </div>
        <div className="flex-1 overflow-y-auto px-3 py-5">
          <Navigation items={items} label={navigationLabel} />
        </div>
        <ShellFooter userLabel={userLabel} onLogout={onLogout} />
      </aside>

      <header className="sticky top-0 z-40 flex min-h-16 items-center justify-between border-b bg-background/95 px-4 backdrop-blur lg:hidden">
        <Brand workspaceLabel={workspaceLabel} />
        <Button
          variant="outline"
          size="icon"
          className="size-[44px]"
          aria-label="Open navigation"
          onClick={() => setNavigationOpen(true)}
        >
          <Menu aria-hidden="true" />
        </Button>
      </header>

      <Sheet open={navigationOpen} onOpenChange={setNavigationOpen}>
        <SheetContent side="left" aria-describedby={undefined}>
          <SheetHeader className="border-b px-5 py-5 pr-14">
            <SheetTitle className="sr-only">{navigationLabel}</SheetTitle>
            <Brand workspaceLabel={workspaceLabel} />
          </SheetHeader>
          <div className="px-3 py-5">
            <Navigation
              items={items}
              label={navigationLabel}
              onNavigate={() => setNavigationOpen(false)}
            />
          </div>
          <div className="mt-auto">
            <ShellFooter
              userLabel={userLabel}
              onLogout={onLogout}
              onNavigate={() => setNavigationOpen(false)}
            />
          </div>
        </SheetContent>
      </Sheet>

      <div className="lg:pl-56">
        <main className="mx-auto w-full max-w-5xl px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
          {children}
        </main>
      </div>
    </div>
  )
}
