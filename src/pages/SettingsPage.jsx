import React, { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useAuth } from '@/lib/auth-context'
import { changeLanguage } from '@/i18n'
import { linkGoogle, unlinkGoogle } from '@/lib/api'
import { startGoogleFlow } from '@/lib/google-oauth'
import { getDefaultPathForRole } from '@/lib/navigation'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { ModeToggle } from '@/components/mode-toggle'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty'
import { Spinner } from '@/components/ui/spinner'
import { Label } from '@/components/ui/label'
import { toast } from 'sonner'
import { ArrowLeft, UnlinkIcon } from 'lucide-react'

function GoogleGIcon({ className }) {
  return (
    <svg viewBox="0 0 24 24" className={className} xmlns="http://www.w3.org/2000/svg">
      <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4" />
      <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
      <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
      <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
    </svg>
  )
}

export default function SettingsPage() {
  const navigate = useNavigate()
  const { user, token, refreshUser } = useAuth()
  const { i18n, t } = useTranslation()
  const [isUnlinking, setIsUnlinking] = useState(false)
  const [showDisconnect, setShowDisconnect] = useState(false)

  const isLinked = Boolean(user?.google_email)

  function handleConnect() {
    startGoogleFlow({ mode: 'link', returnTo: '/settings' })
  }

  async function handleDisconnect() {
    setIsUnlinking(true)
    try {
      await unlinkGoogle(token)
      await refreshUser()
      toast.success(t('settings.accounts.disconnected'))
    } catch (e) {
      toast.error(e.message)
    } finally {
      setIsUnlinking(false)
      setShowDisconnect(false)
    }
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-40 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="mx-auto flex h-14 max-w-4xl items-center justify-between px-8">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="icon-sm" onClick={() => navigate(getDefaultPathForRole(user?.role))} aria-label={t('settings.back')}>
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <span className="text-sm font-semibold">{t('settings.title')}</span>
          </div>
          <div className="flex items-center gap-2">
            {user?.phone && (
              <span className="hidden text-sm text-muted-foreground sm:inline">
                {user.phone}
              </span>
            )}
            <ModeToggle />
          </div>
        </div>
      </header>
      <main className="mx-auto grid max-w-lg gap-6 px-8 py-6">
        <Card>
          <CardHeader>
            <CardTitle>{t('settings.language.title')}</CardTitle>
            <CardDescription>{t('settings.language.description')}</CardDescription>
          </CardHeader>
          <CardContent>
            <Label htmlFor="language">{t('settings.language.label')}</Label>
            <select
              id="language"
              value={i18n.resolvedLanguage}
              onChange={(event) => changeLanguage(event.target.value)}
              className="mt-2 min-h-[var(--sc-component-hit-target)] w-full rounded-[var(--sc-component-control-shape)] border border-input bg-background px-3 text-sm text-foreground outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
            >
              <option value="en">{t('settings.language.english')}</option>
              <option value="vi">{t('settings.language.vietnamese')}</option>
            </select>
          </CardContent>
        </Card>
        <Card>
        <CardHeader>
          <CardTitle>{t('settings.accounts.title')}</CardTitle>
          <CardDescription>{t('settings.accounts.description')}</CardDescription>
        </CardHeader>
        <CardContent>
          {isLinked ? (
            <div className="flex items-center justify-between gap-4">
              <div className="flex min-w-0 items-center gap-2">
                <GoogleGIcon className="size-5 shrink-0" />
                <div className="min-w-0 flex flex-col sm:flex-row sm:items-center sm:gap-2">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium">Google</span>
                    <Badge variant="secondary">{t('settings.accounts.linked')}</Badge>
                  </div>
                  <span className="truncate text-sm text-muted-foreground">{user.google_email}</span>
                </div>
              </div>

              <Dialog open={showDisconnect} onOpenChange={setShowDisconnect}>
                <DialogTrigger asChild>
                  <Button variant="destructive" size="sm" className="shrink-0">
                    <UnlinkIcon className="size-4" />
                    {t('settings.accounts.disconnect')}
                  </Button>
                </DialogTrigger>
                <DialogContent closeLabel={t('common.close')}>
                  <DialogHeader>
                    <DialogTitle>{t('settings.accounts.disconnectTitle')}</DialogTitle>
                    <DialogDescription>
                      {t('settings.accounts.disconnectDescription')}
                    </DialogDescription>
                  </DialogHeader>
                  <DialogFooter>
                    <Button variant="outline" onClick={() => setShowDisconnect(false)}>{t('settings.accounts.cancel')}</Button>
                    <Button variant="destructive" onClick={handleDisconnect} disabled={isUnlinking}>
                      {isUnlinking && <Spinner className="mr-1" aria-label={t('common.loading')} />}
                      {t('settings.accounts.disconnect')}
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            </div>
          ) : (
            <Empty>
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <GoogleGIcon className="size-4" />
                </EmptyMedia>
                <EmptyTitle>{t('settings.accounts.notLinked')}</EmptyTitle>
                <EmptyDescription>
                  {t('settings.accounts.notLinkedDescription')}
                </EmptyDescription>
              </EmptyHeader>
              <Button variant="outline" onClick={handleConnect}>
                <GoogleGIcon className="size-4" />
                {t('settings.accounts.connect')}
              </Button>
            </Empty>
          )}
        </CardContent>
        </Card>
      </main>
    </div>
  )
}
