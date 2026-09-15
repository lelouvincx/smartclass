import React from 'react'
import { useTranslation } from 'react-i18next'
import { StudentCurriculumBrowser } from '@/components/student-curriculum-browser'
import { useAuth } from '@/lib/auth-context'
import { useCurriculumNavigation } from '@/lib/use-curriculum-navigation'
import { PageHeader } from '@/design-system/page-header'

export default function StudentLecturesPage({ audience = 'student' }) {
  const { t } = useTranslation()
  const { token, workspace, membership } = useAuth()
  const navigation = useCurriculumNavigation(token, workspace, {
    preferredProgrammes: audience === 'student' ? membership?.grades : undefined,
    skipLessonDetail: true,
  })

  return (
    <div className="max-w-4xl space-y-6">
      <PageHeader
        title={t('student.lectures.title')}
        description={t('student.lectures.description')}
      />
      <StudentCurriculumBrowser navigation={navigation} audience={audience} />
    </div>
  )
}
