import React from 'react'
import { useTranslation } from 'react-i18next'
import { BookOpen, ClipboardList, History } from 'lucide-react'
import { ActionCard } from '@/design-system/action-card'
import { PageHeader } from '@/design-system/page-header'

export default function StudentDashboardPage() {
  const { t } = useTranslation()
  return (
    <div className="max-w-4xl space-y-8">
      <PageHeader title={t('student.dashboard.title')} description={t('student.dashboard.welcome')} />

      <section aria-label={t('student.dashboard.quickActions')} className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <ActionCard
          to="/student/exercises"
          icon={ClipboardList}
          title={t('student.dashboard.browse')}
          description={t('student.dashboard.browseDescription')}
          emphasis
        />
        <ActionCard
          to="/student/lectures"
          icon={BookOpen}
          title={t('student.dashboard.lectures')}
          description={t('student.dashboard.lecturesDescription')}
        />
        <ActionCard
          to="/student/submissions"
          icon={History}
          title={t('student.dashboard.history')}
          description={t('student.dashboard.historyDescription')}
        />
      </section>
    </div>
  )
}
