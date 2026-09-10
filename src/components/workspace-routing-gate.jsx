import React, { useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useAuth } from '@/lib/auth-context'
import { clearStoredToken } from '@/lib/auth'
import { getWorkspaceSiteForOrigin, isAllowedTeacherDestination } from '@/lib/workspaces'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'

// All authentication entry points pass here before any join or protected route renders.
export function WorkspaceRoutingGate({ children }) {
  const { user, teacherRouting, isLoading, logout } = useAuth()
  const { t } = useTranslation()
  const [isDeparting, setIsDeparting] = useState(false)
  const site = getWorkspaceSiteForOrigin()
  const routing = user && user.disabled_at == null && user.platform_role !== 'platform_admin'
    ? teacherRouting : null
  const mustRoute = routing && routing.action !== 'stay'
  const destinations = Array.isArray(routing?.destinations) ? routing.destinations : []
  const valid = destinations.length > 0
    && (routing.action === 'choose' || (routing.action === 'redirect' && destinations.length === 1))
    && destinations.every((destination) => isAllowedTeacherDestination(destination)
      && destination.url !== site?.frontend_origin)
  const redirectUrl = !isLoading && site && valid && routing.action === 'redirect' ? destinations[0].url : null
  const clearDepartingSession = useCallback(() => {
    clearStoredToken()
    setIsDeparting(true)
  }, [])

  useEffect(() => {
    if (!redirectUrl) return
    clearDepartingSession()
    window.location.replace(redirectUrl)
  }, [clearDepartingSession, redirectUrl])

  if (!site) return <p role="alert" className="p-6">{t('common.unsupportedSite')}</p>
  if (isDeparting) return null
  if (!mustRoute || isLoading) return children

  return (
    <main className="flex min-h-screen items-center justify-center bg-background p-4">
      <Card className="w-full max-w-lg">
        <CardHeader>
          <CardTitle>{t('common.teachingSite')}</CardTitle>
          <CardDescription>{t('common.separateSignIn')}</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4">
          {valid ? destinations.map((destination) => (
            <Button key={destination.workspace_id} asChild>
              <a href={destination.url} referrerPolicy="no-referrer" onClick={clearDepartingSession}>
                {t(destination.workspace_id === 'english' ? 'common.englishSite' : 'common.mathsSite')}
              </a>
            </Button>
          )) : <p role="alert">{t('common.invalidTeachingSite')}</p>}
          <Button variant="outline" onClick={logout}>{t('common.logout')}</Button>
        </CardContent>
      </Card>
    </main>
  )
}
