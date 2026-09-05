import React, { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useAuth } from '@/lib/auth-context'
import { changeLanguage } from '@/i18n'
import { changePassword, unlinkGoogle, updateMyName } from '@/lib/api'
import { startGoogleFlow } from '@/lib/google-oauth'
import { getDefaultPathForRole } from '@/lib/navigation'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from '@/components/ui/field'
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
import { ArrowLeft, ChevronDown, UnlinkIcon } from 'lucide-react'

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

function SettingSection({ id, title, toggleLabel, children }) {
  const [isExpanded, setIsExpanded] = useState(false)
  const contentId = `${id}-content`

  return (
    <Card className="gap-0 py-0">
      <div className="grid gap-1 p-4">
        <h2>
          <button
            type="button"
            aria-expanded={isExpanded}
            aria-controls={contentId}
            aria-label={toggleLabel}
            onClick={() => setIsExpanded((expanded) => !expanded)}
            className="flex min-h-[var(--sc-component-hit-target)] w-full items-center justify-between gap-4 rounded-[var(--sc-component-control-shape)] text-left outline-none transition-colors hover:text-primary focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:ring-inset"
          >
            <span className="text-[length:var(--sc-type-title-size)] leading-[var(--sc-type-title-line-height)] font-[var(--sc-type-title-weight)]">
              {title}
            </span>
            <ChevronDown
              aria-hidden="true"
              className={`size-5 shrink-0 transition-transform motion-reduce:transition-none ${isExpanded ? 'rotate-180' : ''}`}
            />
          </button>
        </h2>
      </div>
      <CardContent id={contentId} hidden={!isExpanded} className="pb-4">
        {children}
      </CardContent>
    </Card>
  )
}

export default function SettingsPage() {
  const navigate = useNavigate()
  const { user, token, refreshUser } = useAuth()
  const { i18n, t } = useTranslation()
  const [isUnlinking, setIsUnlinking] = useState(false)
  const [showDisconnect, setShowDisconnect] = useState(false)
  const [profileName, setProfileName] = useState(user?.name || '')
  const [profileError, setProfileError] = useState('')
  const [profileSuccess, setProfileSuccess] = useState('')
  const [isUpdatingProfile, setIsUpdatingProfile] = useState(false)
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [passwordError, setPasswordError] = useState('')
  const [passwordSuccess, setPasswordSuccess] = useState('')
  const [isChangingPassword, setIsChangingPassword] = useState(false)

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

  async function handlePasswordChange(event) {
    event.preventDefault()
    setPasswordError('')
    setPasswordSuccess('')

    if (newPassword !== confirmPassword) {
      setPasswordError(t('settings.password.mismatch'))
      return
    }

    setIsChangingPassword(true)
    try {
      await changePassword(token, {
        current_password: currentPassword,
        new_password: newPassword,
      })
      setCurrentPassword('')
      setNewPassword('')
      setConfirmPassword('')
      setPasswordSuccess(t('settings.password.success'))
    } catch (error) {
      setPasswordError(error.message)
    } finally {
      setIsChangingPassword(false)
    }
  }

  async function handleProfileSubmit(event) {
    event.preventDefault()
    setProfileError('')
    setProfileSuccess('')

    const name = profileName.trim()
    if (!name) {
      setProfileError(t('settings.profile.nameRequired'))
      return
    }

    setIsUpdatingProfile(true)
    try {
      await updateMyName(token, { name })
      setProfileName(name)
      await refreshUser()
      setProfileSuccess(t('settings.profile.success'))
    } catch (error) {
      setProfileError(error.message)
    } finally {
      setIsUpdatingProfile(false)
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
            <h1 className="text-sm font-semibold">{t('settings.title')}</h1>
          </div>
          <div className="flex items-center gap-2">
            {(user?.name || user?.phone) && (
              <span className="hidden text-sm text-muted-foreground sm:inline">
                {user.name || user.phone}
              </span>
            )}
            <ModeToggle />
          </div>
        </div>
      </header>
      <main className="mx-auto grid max-w-lg gap-6 px-8 py-6">
        <SettingSection
          id="profile-setting"
          title={t('settings.profile.title')}
          toggleLabel={t('settings.sectionToggle', { title: t('settings.profile.title') })}
        >
          <form onSubmit={handleProfileSubmit}>
            <FieldGroup>
              <Field data-invalid={Boolean(profileError)}>
                <FieldLabel htmlFor="settings-profile-name">
                  {t('settings.profile.name')}
                </FieldLabel>
                <Input
                  id="settings-profile-name"
                  name="name"
                  type="text"
                  autoComplete="name"
                  required
                  aria-invalid={Boolean(profileError)}
                  aria-describedby={profileError ? 'profile-name-error' : undefined}
                  value={profileName}
                  onChange={(event) => {
                    setProfileName(event.target.value)
                    if (profileError) setProfileError('')
                  }}
                />
              </Field>
              {profileError && (
                <FieldError id="profile-name-error">{profileError}</FieldError>
              )}
              {profileSuccess && (
                <p role="status" className="text-sm text-success">{profileSuccess}</p>
              )}
              <Button type="submit" disabled={isUpdatingProfile}>
                {isUpdatingProfile
                  ? t('settings.profile.saving')
                  : t('settings.profile.submit')}
              </Button>
            </FieldGroup>
          </form>
        </SettingSection>
        <SettingSection
          id="language-setting"
          title={t('settings.language.title')}
          toggleLabel={t('settings.sectionToggle', { title: t('settings.language.title') })}
        >
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
        </SettingSection>
        {user?.role === 'teacher' && (
          <SettingSection
            id="password-setting"
            title={t('settings.password.title')}
            toggleLabel={t('settings.sectionToggle', { title: t('settings.password.title') })}
          >
            <form onSubmit={handlePasswordChange}>
              <FieldGroup>
                <Field data-invalid={Boolean(passwordError)}>
                  <FieldLabel htmlFor="settings-current-password">
                    {t('settings.password.current')}
                  </FieldLabel>
                  <Input
                    id="settings-current-password"
                    name="current-password"
                    type="password"
                    autoComplete="current-password"
                    required
                    aria-invalid={Boolean(passwordError)}
                    aria-describedby={passwordError ? 'password-change-error' : undefined}
                    value={currentPassword}
                    onChange={(event) => setCurrentPassword(event.target.value)}
                  />
                </Field>
                <Field data-invalid={Boolean(passwordError)}>
                  <FieldLabel htmlFor="settings-new-password">
                    {t('settings.password.new')}
                  </FieldLabel>
                  <FieldDescription id="password-change-policy">
                    {t('settings.password.policy')}
                  </FieldDescription>
                  <Input
                    id="settings-new-password"
                    name="new-password"
                    type="password"
                    autoComplete="new-password"
                    required
                    minLength={3}
                    aria-invalid={Boolean(passwordError)}
                    aria-describedby={`password-change-policy${passwordError ? ' password-change-error' : ''}`}
                    value={newPassword}
                    onChange={(event) => setNewPassword(event.target.value)}
                  />
                </Field>
                <Field data-invalid={Boolean(passwordError)}>
                  <FieldLabel htmlFor="settings-confirm-password">
                    {t('settings.password.confirm')}
                  </FieldLabel>
                  <Input
                    id="settings-confirm-password"
                    name="confirm-password"
                    type="password"
                    autoComplete="new-password"
                    required
                    minLength={3}
                    aria-invalid={Boolean(passwordError)}
                    aria-describedby={passwordError ? 'password-change-error' : undefined}
                    value={confirmPassword}
                    onChange={(event) => setConfirmPassword(event.target.value)}
                  />
                </Field>
                {passwordError && (
                  <FieldError id="password-change-error">{passwordError}</FieldError>
                )}
                {passwordSuccess && (
                  <p role="status" className="text-sm text-success">{passwordSuccess}</p>
                )}
                <Button type="submit" disabled={isChangingPassword}>
                  {isChangingPassword
                    ? t('settings.password.changing')
                    : t('settings.password.submit')}
                </Button>
              </FieldGroup>
            </form>
          </SettingSection>
        )}
        <SettingSection
          id="accounts-setting"
          title={t('settings.accounts.title')}
          toggleLabel={t('settings.sectionToggle', { title: t('settings.accounts.title') })}
        >
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
        </SettingSection>
      </main>
    </div>
  )
}
