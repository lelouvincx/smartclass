import React from 'react'
import { useTranslation } from 'react-i18next'
import { Outlet } from 'react-router-dom'
import { BookOpen, ClipboardList } from '@/components/material-symbol'
import { useAuth } from '@/lib/auth-context'
import { getDefaultPathForRole } from '@/lib/navigation'
import { AppShell } from '@/design-system/app-shell'

export function PublicLectureLayout() {
  const { t } = useTranslation()
  const { user } = useAuth()
  const navigation = [
    { label: t('common.lectures'), to: '/lectures', icon: BookOpen },
    {
      label: t('common.exercises'),
      icon: ClipboardList,
      disabled: true,
      status: t('common.comingSoon'),
    },
  ]
  const accountAction = user
    ? { label: t('common.openWorkspace'), to: getDefaultPathForRole(user.role) }
    : { label: t('common.signIn'), to: '/' }

  return (
    <AppShell
      accountAction={accountAction}
      items={navigation}
      showLanguageSwitcher={!user}
      workspaceLabel={t('common.accessTier.guest')}
    >
      <Outlet />
    </AppShell>
  )
}
