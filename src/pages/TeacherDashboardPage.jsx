import React from 'react'
import { BookOpen, ClipboardList, Plus, Users } from 'lucide-react'
import { ActionCard } from '@/design-system/action-card'
import { PageHeader } from '@/design-system/page-header'
import { useTranslation } from 'react-i18next'

export default function TeacherDashboardPage() {
  const { t } = useTranslation()
  return (
    <div className="max-w-4xl space-y-8">
      <PageHeader
        title={t('teacher.dashboard.title')}
        description={t('teacher.dashboard.description')}
      />

      <section aria-label={t('teacher.dashboard.quickActions')} className="grid gap-4 sm:grid-cols-2">
        <ActionCard
          to="/teacher/exercises"
          icon={ClipboardList}
          title={t('teacher.dashboard.manageExercises')}
          description={t('teacher.dashboard.manageExercisesDescription')}
        />
        <ActionCard
          to="/teacher/exercises/new"
          icon={Plus}
          title={t('teacher.dashboard.createExercise')}
          description={t('teacher.dashboard.createExerciseDescription')}
          emphasis
        />
        <ActionCard
          to="/teacher/students"
          icon={Users}
          title={t('teacher.dashboard.manageStudents')}
          description={t('teacher.dashboard.manageStudentsDescription')}
        />
        <ActionCard
          to="/teacher/lectures"
          icon={BookOpen}
          title={t('teacher.dashboard.manageLectures')}
          description={t('teacher.dashboard.manageLecturesDescription')}
        />
      </section>
    </div>
  )
}
