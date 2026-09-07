import { useEffect, useState } from 'react'
import { Link, NavLink, useLocation } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import {
  ChevronDown,
  GraduationCap,
  LogIn,
  LogOut,
  Menu,
  PanelLeftClose,
  PanelLeftOpen,
  Settings,
} from '@/components/material-symbol'
import { ModeToggle } from '@/components/mode-toggle'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { changeLanguage } from '@/i18n'
import { cn } from '@/lib/utils'

const SIDEBAR_STORAGE_KEY = 'smartclass-sidebar-collapsed'

function Brand({ workspaceLabel }) {
  const { t } = useTranslation()
  return (
    <div className="flex min-w-0 items-center gap-3">
      <span className="flex size-9 shrink-0 items-center justify-center rounded-[var(--sc-component-control-shape)] bg-primary text-primary-foreground shadow-sm">
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

function navigationItemClass(rail, isActive = false, disabled = false) {
  return cn(
    'flex min-h-[var(--sc-component-hit-target)] w-full items-center rounded-[var(--sc-component-navigation-shape)] text-sm font-medium text-muted-foreground transition-colors',
    rail ? 'flex-col justify-center gap-1 px-2 py-2 text-center text-xs' : 'gap-3 px-3 py-2',
    disabled
      ? 'cursor-not-allowed opacity-60'
      : 'hover:bg-accent hover:text-accent-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring',
    isActive && 'bg-accent text-accent-foreground',
  )
}

function Navigation({ items, label, onNavigate, rail = false }) {
  const location = useLocation()
  const [expandedItem, setExpandedItem] = useState(null)

  return (
    <nav aria-label={label} className="grid gap-1">
      {items.map(({ activePath, disabled, end, icon: Icon, label: itemLabel, options, status, to }) => {
        if (disabled) {
          const accessibleLabel = status ? `${itemLabel} — ${status}` : itemLabel
          return (
            <button
              key={itemLabel}
              type="button"
              disabled
              aria-label={accessibleLabel}
              className={navigationItemClass(rail, false, true)}
            >
              <Icon className={cn('shrink-0', rail ? 'size-5' : 'size-4')} aria-hidden="true" />
              <span className={cn(rail && 'max-w-full truncate')}>{itemLabel}</span>
              {status && (
                <span className={cn('text-[0.65rem] font-normal', !rail && 'ms-auto')} aria-hidden="true">
                  {status}
                </span>
              )}
            </button>
          )
        }

        if (options) {
          const isActive = location.pathname === activePath
          if (onNavigate) {
            const isExpanded = expandedItem === itemLabel
            return (
              <div key={itemLabel}>
                <button
                  type="button"
                  aria-current={isActive ? 'page' : undefined}
                  aria-expanded={isExpanded}
                  className={navigationItemClass(rail, isActive)}
                  onClick={() => setExpandedItem(isExpanded ? null : itemLabel)}
                >
                  <Icon className="size-4 shrink-0" aria-hidden="true" />
                  <span>{itemLabel}</span>
                  <ChevronDown
                    className={cn('ms-auto size-4 transition-transform', isExpanded && 'rotate-180')}
                    aria-hidden="true"
                  />
                </button>
                {isExpanded && (
                  <div className="ms-5 mt-1 grid gap-1 border-s ps-3">
                    {options.map(({ icon: OptionIcon, label: optionLabel, to: optionTo }) => (
                      <Link
                        key={optionTo}
                        to={optionTo}
                        onClick={onNavigate}
                        className="flex min-h-[var(--sc-component-hit-target)] items-center gap-3 rounded-[var(--sc-component-navigation-shape)] px-3 py-2 text-sm text-muted-foreground hover:bg-accent hover:text-accent-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                      >
                        <OptionIcon className="size-4 shrink-0" aria-hidden="true" />
                        {optionLabel}
                      </Link>
                    ))}
                  </div>
                )}
              </div>
            )
          }

          return (
            <DropdownMenu key={itemLabel}>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  aria-current={isActive ? 'page' : undefined}
                  className={navigationItemClass(rail, isActive)}
                >
                  <Icon className={cn('shrink-0', rail ? 'size-5' : 'size-4')} aria-hidden="true" />
                  <span className={cn(rail && 'max-w-full truncate')}>{itemLabel}</span>
                  {!rail && <ChevronDown className="ms-auto size-4" aria-hidden="true" />}
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent
                side={rail ? 'right' : 'bottom'}
                align="start"
                sideOffset={8}
                className="min-w-52"
              >
                {options.map(({ icon: OptionIcon, label: optionLabel, to: optionTo }) => (
                  <DropdownMenuItem key={optionTo} asChild className="min-h-[var(--sc-component-hit-target)] px-3 py-2">
                    <Link to={optionTo} onClick={onNavigate}>
                      <OptionIcon className="size-4" aria-hidden="true" />
                      {optionLabel}
                    </Link>
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          )
        }

        return (
          <NavLink
            key={to}
            to={to}
            end={end}
            onClick={onNavigate}
            className={({ isActive }) => navigationItemClass(rail, isActive)}
          >
            <Icon className={cn('shrink-0', rail ? 'size-5' : 'size-4')} aria-hidden="true" />
            <span className={cn(rail && 'max-w-full truncate')}>{itemLabel}</span>
          </NavLink>
        )
      })}
    </nav>
  )
}

function LanguageSelect({ rail = false }) {
  const { i18n, t } = useTranslation()

  return (
    <label className={cn('grid gap-1 text-muted-foreground', rail ? 'text-center text-xs' : 'text-sm')}>
      <span>{t('settings.language.label')}</span>
      <select
        aria-label={t('settings.language.label')}
        value={i18n.resolvedLanguage}
        onChange={(event) => changeLanguage(event.target.value)}
        className={cn(
          'min-h-[var(--sc-component-hit-target)] rounded-[var(--sc-component-control-shape)] border border-input bg-background px-2 text-foreground outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50',
          rail ? 'w-full text-xs' : 'w-full text-sm',
        )}
      >
        <option value="en">{rail ? 'EN' : t('settings.language.english')}</option>
        <option value="vi">{rail ? 'VI' : t('settings.language.vietnamese')}</option>
      </select>
    </label>
  )
}

function RailFooter({ accountAction, showLanguageSwitcher, userLabel, onLogout }) {
  const { t } = useTranslation()
  return (
    <div className="space-y-2 border-t px-2 py-3 text-xs">
      {userLabel && (
        <p className="px-1 text-center text-muted-foreground">
          <span className="block">{t('common.signedInAs')}</span>
          <span className="block truncate" title={userLabel}>{userLabel}</span>
        </p>
      )}
      {onLogout && (
        <Button variant="ghost" className="h-auto min-h-[var(--sc-component-hit-target)] w-full flex-col gap-1 px-1 py-2 text-xs" asChild>
          <Link to="/settings">
            <Settings className="size-5" aria-hidden="true" />
            {t('common.settings')}
          </Link>
        </Button>
      )}
      <div className="flex flex-col items-center gap-1 py-1 text-muted-foreground">
        <ModeToggle className="size-[48px]" />
        <span aria-hidden="true">{t('common.theme')}</span>
      </div>
      {showLanguageSwitcher && <LanguageSelect rail />}
      {onLogout ? (
        <Button
          variant="ghost"
          className="h-auto min-h-[var(--sc-component-hit-target)] w-full flex-col gap-1 px-1 py-2 text-xs text-destructive hover:bg-destructive/10 hover:text-destructive"
          onClick={onLogout}
        >
          <LogOut className="size-5" aria-hidden="true" />
          {t('common.logout')}
        </Button>
      ) : accountAction ? (
        <Button variant="ghost" className="h-auto min-h-[var(--sc-component-hit-target)] w-full flex-col gap-1 px-1 py-2 text-xs" asChild>
          <Link to={accountAction.to}>
            <LogIn className="size-5" aria-hidden="true" />
            {accountAction.label}
          </Link>
        </Button>
      ) : null}
    </div>
  )
}

function ShellFooter({ accountAction, showLanguageSwitcher, userLabel, onLogout, onNavigate }) {
  const { t } = useTranslation()
  return (
    <div className="space-y-3 border-t px-3 py-4">
      {userLabel && (
        <p className="px-2 text-xs text-muted-foreground">
          <span>{t('common.signedInAs')} </span>
          <span className="font-medium text-foreground" title={userLabel}>{userLabel}</span>
        </p>
      )}
      <div className={cn('grid gap-2', onLogout && 'grid-cols-[1fr_auto]')}>
        {onLogout && (
          <Button variant="ghost" className="h-[48px] justify-start" asChild>
            <Link to="/settings" onClick={onNavigate}>
              <Settings aria-hidden="true" />
              {t('common.settings')}
            </Link>
          </Button>
        )}
        <ModeToggle className="size-[48px]" />
      </div>
      {showLanguageSwitcher && <LanguageSelect />}
      {onLogout ? (
        <Button
          variant="ghost"
          className="h-[48px] w-full justify-start text-destructive hover:bg-destructive/10 hover:text-destructive"
          onClick={onLogout}
        >
          <LogOut aria-hidden="true" />
          {t('common.logout')}
        </Button>
      ) : accountAction ? (
        <Button variant="ghost" className="h-[48px] w-full justify-start" asChild>
          <Link to={accountAction.to} onClick={onNavigate}>
            <LogIn aria-hidden="true" />
            {accountAction.label}
          </Link>
        </Button>
      ) : null}
    </div>
  )
}

export function AppShell({ accountAction, children, focusedWorkspace = false, items, onLogout, showLanguageSwitcher = false, userLabel, workspaceLabel }) {
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

    const persistentNavigationViewport = window.matchMedia('(min-width: 768px) and (min-height: 501px)')
    const closeCompactDrawer = (event) => {
      if (event.matches) setNavigationOpen(false)
    }
    persistentNavigationViewport.addEventListener('change', closeCompactDrawer)
    return () => persistentNavigationViewport.removeEventListener('change', closeCompactDrawer)
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
              className="flex size-10 shrink-0 items-center justify-center rounded-[var(--sc-component-control-shape)] bg-primary text-primary-foreground shadow-sm"
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
          ? <RailFooter accountAction={accountAction} showLanguageSwitcher={showLanguageSwitcher} userLabel={userLabel} onLogout={onLogout} />
          : <ShellFooter accountAction={accountAction} showLanguageSwitcher={showLanguageSwitcher} userLabel={userLabel} onLogout={onLogout} />}
      </aside>

      <aside
        data-app-shell-persistent-navigation
        className="fixed inset-y-0 start-0 z-40 hidden w-28 flex-col border-e bg-sidebar text-sidebar-foreground shadow-sm md:flex lg:hidden"
      >
        <div className="flex min-h-16 items-center justify-center border-b">
          <span
            role="img"
            aria-label="SmartClass"
            className="flex size-10 items-center justify-center rounded-[var(--sc-component-control-shape)] bg-primary text-primary-foreground shadow-sm"
          >
            <GraduationCap className="size-5" aria-hidden="true" />
          </span>
        </div>
        <div className="flex-1 overflow-y-auto px-2 py-4">
          <Navigation items={items} label={navigationLabel} rail />
        </div>
        <RailFooter accountAction={accountAction} showLanguageSwitcher={showLanguageSwitcher} userLabel={userLabel} onLogout={onLogout} />
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
              accountAction={accountAction}
              showLanguageSwitcher={showLanguageSwitcher}
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
