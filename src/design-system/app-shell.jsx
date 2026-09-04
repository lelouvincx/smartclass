import { useEffect, useState } from 'react'
import { Link, NavLink, useLocation } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import {
  GraduationCap,
  LogOut,
  Menu,
  PanelLeftClose,
  PanelLeftOpen,
  Settings,
} from 'lucide-react'
import { ModeToggle } from '@/components/mode-toggle'
import { Button } from '@/components/ui/button'
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { cn } from '@/lib/utils'

const SIDEBAR_STORAGE_KEY = 'smartclass-sidebar-collapsed'

function Brand({ workspaceLabel }) {
  const { t } = useTranslation()
  return (
    <div className="flex min-w-0 items-center gap-3">
      <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-sm">
        <GraduationCap className="size-5" aria-hidden="true" />
      </span>
      <span className="min-w-0">
        <span className="block text-sm font-semibold tracking-tight">SmartClass</span>
        <span className="block truncate text-xs text-muted-foreground">
          {t('common.workspace', { role: workspaceLabel })}
        </span>
      </span>
    </div>
  )
}

function Navigation({ items, label, onNavigate, rail = false }) {
  return (
    <nav aria-label={label} className="grid gap-1">
      {items.map(({ end, icon: Icon, label: itemLabel, to }) => (
        <NavLink
          key={to}
          to={to}
          end={end}
          onClick={onNavigate}
          className={({ isActive }) => cn(
            'flex min-h-[var(--sc-component-hit-target)] items-center rounded-xl text-sm font-medium text-muted-foreground transition-colors',
            rail ? 'flex-col justify-center gap-1 px-2 py-2 text-center text-xs' : 'gap-3 px-3 py-2',
            'hover:bg-accent hover:text-accent-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring',
            isActive && 'bg-accent text-accent-foreground',
          )}
        >
          <Icon className={cn('shrink-0', rail ? 'size-5' : 'size-4')} aria-hidden="true" />
          <span className={cn(rail && 'max-w-full truncate')}>{itemLabel}</span>
        </NavLink>
      ))}
    </nav>
  )
}

function RailFooter({ userLabel, onLogout }) {
  const { t } = useTranslation()
  return (
    <div className="space-y-2 border-t px-2 py-3 text-xs">
      {userLabel && (
        <p className="px-1 text-center text-muted-foreground">
          <span className="block">{t('common.signedInAs')}</span>
          <span className="block truncate" title={userLabel}>{userLabel}</span>
        </p>
      )}
      <Button variant="ghost" className="h-auto min-h-[var(--sc-component-hit-target)] w-full flex-col gap-1 px-1 py-2 text-xs" asChild>
        <Link to="/settings">
          <Settings className="size-5" aria-hidden="true" />
          {t('common.settings')}
        </Link>
      </Button>
      <div className="flex flex-col items-center gap-1 py-1 text-muted-foreground">
        <ModeToggle className="size-[48px]" />
        <span aria-hidden="true">{t('common.theme')}</span>
      </div>
      <Button
        variant="ghost"
        className="h-auto min-h-[var(--sc-component-hit-target)] w-full flex-col gap-1 px-1 py-2 text-xs text-destructive hover:bg-destructive/10 hover:text-destructive"
        onClick={onLogout}
      >
        <LogOut className="size-5" aria-hidden="true" />
        {t('common.logout')}
      </Button>
    </div>
  )
}

function ShellFooter({ userLabel, onLogout, onNavigate }) {
  const { t } = useTranslation()
  return (
    <div className="space-y-3 border-t px-3 py-4">
      {userLabel && (
        <p className="px-2 text-xs text-muted-foreground">
          <span>{t('common.signedInAs')} </span>
          <span className="font-medium text-foreground" title={userLabel}>{userLabel}</span>
        </p>
      )}
      <div className="grid grid-cols-[1fr_auto] gap-2">
        <Button variant="ghost" className="h-[48px] justify-start" asChild>
          <Link to="/settings" onClick={onNavigate}>
            <Settings aria-hidden="true" />
            {t('common.settings')}
          </Link>
        </Button>
        <ModeToggle className="size-[48px]" />
      </div>
      <Button
        variant="ghost"
        className="h-[48px] w-full justify-start text-destructive hover:bg-destructive/10 hover:text-destructive"
        onClick={onLogout}
      >
        <LogOut aria-hidden="true" />
        {t('common.logout')}
      </Button>
    </div>
  )
}

export function AppShell({ children, focusedWorkspace = false, items, onLogout, userLabel, workspaceLabel }) {
  const [navigationOpen, setNavigationOpen] = useState(false)
  const [sidebarCollapsed, setSidebarCollapsed] = useState(
    () => globalThis.localStorage?.getItem(SIDEBAR_STORAGE_KEY) === 'true',
  )
  const location = useLocation()
  const { t } = useTranslation()
  const navigationLabel = t('common.navigation', { workspace: workspaceLabel })
  const effectiveSidebarCollapsed = focusedWorkspace || sidebarCollapsed

  function toggleSidebar() {
    setSidebarCollapsed((collapsed) => {
      const nextCollapsed = !collapsed
      globalThis.localStorage?.setItem(SIDEBAR_STORAGE_KEY, String(nextCollapsed))
      return nextCollapsed
    })
  }

  useEffect(() => {
    setNavigationOpen(false)
  }, [location.pathname])

  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return undefined

    const mediumViewport = window.matchMedia('(min-width: 768px)')
    const closeCompactDrawer = (event) => {
      if (event.matches) setNavigationOpen(false)
    }
    mediumViewport.addEventListener('change', closeCompactDrawer)
    return () => mediumViewport.removeEventListener('change', closeCompactDrawer)
  }, [])

  return (
    <div className="min-h-screen bg-background">
      <a
        href="#main-content"
        className="fixed start-4 top-4 z-[60] -translate-y-24 rounded-[var(--sc-component-control-shape)] bg-primary px-4 py-3 font-medium text-primary-foreground shadow-lg transition-transform focus:translate-y-0"
      >
        {t('common.skipToMain')}
      </a>
      <aside
        id="desktop-sidebar"
        data-app-shell-persistent-navigation
        className={cn(
          'fixed inset-y-0 start-0 z-40 hidden flex-col border-e bg-sidebar text-sidebar-foreground shadow-sm transition-[width] duration-[var(--sc-motion-duration-medium)] ease-[var(--sc-motion-standard)] motion-reduce:transition-none lg:flex',
          effectiveSidebarCollapsed ? 'w-28' : 'w-56',
        )}
      >
        <div className={cn(
          'flex min-h-16 items-center border-b',
          effectiveSidebarCollapsed ? 'justify-center gap-2 px-2' : 'justify-between gap-2 px-3',
        )}>
          {effectiveSidebarCollapsed ? (
            <span
              role="img"
              aria-label="SmartClass"
              className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-sm"
            >
              <GraduationCap className="size-5" aria-hidden="true" />
            </span>
          ) : (
            <Brand workspaceLabel={workspaceLabel} />
          )}
          {!focusedWorkspace && (
            <Button
              variant="ghost"
              size="icon"
              className="size-[48px]"
              aria-label={t(sidebarCollapsed ? 'common.expandSidebar' : 'common.collapseSidebar')}
              aria-controls="desktop-sidebar"
              aria-expanded={!sidebarCollapsed}
              onClick={toggleSidebar}
            >
              {sidebarCollapsed
                ? <PanelLeftOpen aria-hidden="true" />
                : <PanelLeftClose aria-hidden="true" />}
            </Button>
          )}
        </div>
        <div className={cn('flex-1 overflow-y-auto py-5', effectiveSidebarCollapsed ? 'px-2' : 'px-3')}>
          <Navigation items={items} label={navigationLabel} rail={effectiveSidebarCollapsed} />
        </div>
        {effectiveSidebarCollapsed
          ? <RailFooter userLabel={userLabel} onLogout={onLogout} />
          : <ShellFooter userLabel={userLabel} onLogout={onLogout} />}
      </aside>

      <aside
        data-app-shell-persistent-navigation
        className="fixed inset-y-0 start-0 z-40 hidden w-28 flex-col border-e bg-sidebar text-sidebar-foreground shadow-sm md:flex lg:hidden"
      >
        <div className="flex min-h-16 items-center justify-center border-b">
          <span
            role="img"
            aria-label="SmartClass"
            className="flex size-10 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-sm"
          >
            <GraduationCap className="size-5" aria-hidden="true" />
          </span>
        </div>
        <div className="flex-1 overflow-y-auto px-2 py-4">
          <Navigation items={items} label={navigationLabel} rail />
        </div>
        <RailFooter userLabel={userLabel} onLogout={onLogout} />
      </aside>

      <header
        data-app-shell-mobile-header
        className="sticky top-0 z-40 flex min-h-16 items-center justify-between border-b bg-background/95 px-4 backdrop-blur md:hidden"
      >
        <Brand workspaceLabel={workspaceLabel} />
        <Button
          variant="outline"
          size="icon"
          className="size-[48px]"
          aria-label={t('common.openNavigation')}
          onClick={() => setNavigationOpen(true)}
        >
          <Menu aria-hidden="true" />
        </Button>
      </header>

      <Sheet open={navigationOpen} onOpenChange={setNavigationOpen}>
        <SheetContent side="left" closeLabel={t('common.close')} aria-describedby={undefined}>
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

      <div data-app-shell-content className={cn(
        'md:ps-28 lg:transition-[padding] lg:duration-[var(--sc-motion-duration-medium)] lg:ease-[var(--sc-motion-standard)] lg:motion-reduce:transition-none',
        effectiveSidebarCollapsed ? 'lg:ps-28' : 'lg:ps-56',
      )}>
        <main
          id="main-content"
          tabIndex={-1}
          className={cn(
            'mx-auto w-full px-4 py-6 sm:px-6 lg:px-8 lg:py-8',
            focusedWorkspace ? 'max-w-[90rem]' : 'max-w-5xl',
          )}
        >
          {children}
        </main>
      </div>
    </div>
  )
}
