import React from 'react'
import { useTranslation } from 'react-i18next'
import { CurriculumNavigator } from '@/components/curriculum-navigator'
import { useAuth } from '@/lib/auth-context'
import { useCurriculumNavigation } from '@/lib/use-curriculum-navigation'
import { PageHeader } from '@/design-system/page-header'

export default function StudentLecturesPage({ audience = 'student' }) {
  const { t } = useTranslation()
  const { token, workspace } = useAuth()
  const navigation = useCurriculumNavigation(token, workspace)

  return (
    <div className="max-w-4xl space-y-6">
      <PageHeader
        title={t('student.lectures.title')}
        description={t('student.lectures.description')}
      />
      <CurriculumNavigator navigation={navigation} audience={audience} />
    </div>
  )
}
