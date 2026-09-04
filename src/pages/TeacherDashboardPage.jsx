import React, { useEffect, useState } from 'react'
import { BookOpen, ClipboardList, Plus, Users } from 'lucide-react'
import { ActionCard } from '@/design-system/action-card'
import { PageHeader } from '@/design-system/page-header'
import { useTranslation } from 'react-i18next'
import { listExercises, listLectures, listStudents } from '@/lib/api'
import { useAuth } from '@/lib/auth-context'
import { Card, CardContent } from '@/components/ui/card'

export default function TeacherDashboardPage() {
  const { t } = useTranslation()
  const { token } = useAuth()
  const [summary, setSummary] = useState(null)

  useEffect(() => {
    let cancelled = false

    async function loadSummary() {
      try {
        const [exercises, lectures, activeStudents, pendingStudents] = await Promise.all([
          listExercises(token),
          listLectures(token),
          listStudents(token, { status: 'active' }),
          listStudents(token, { status: 'pending' }),
        ])
        if (!cancelled) {
          setSummary({
            activeStudents: activeStudents.data?.length || 0,
            pendingStudents: pendingStudents.data?.length || 0,
            exercises: exercises.data?.length || 0,
            lectures: lectures.data?.length || 0,
          })
        }
      } catch {
        // Quick actions remain useful if the overview cannot load.
      }
    }

    loadSummary()
    return () => { cancelled = true }
  }, [token])

  return (
    <div className="max-w-4xl space-y-8">
      <PageHeader
        title={t('teacher.dashboard.title')}
        description={t('teacher.dashboard.description')}
      />

      {summary && (
        <section aria-labelledby="class-overview-title" className="space-y-3">
          <h2 id="class-overview-title" className="text-base font-semibold">
            {t('teacher.dashboard.overview')}
          </h2>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {[
              ['activeStudents', t('teacher.dashboard.activeStudents', { count: summary.activeStudents })],
              ['pendingStudents', t('teacher.dashboard.pendingStudents', { count: summary.pendingStudents })],
              ['exercises', t('teacher.dashboard.exerciseCount', { count: summary.exercises })],
              ['lectures', t('teacher.dashboard.lectureCount', { count: summary.lectures })],
            ].map(([key, label]) => (
              <Card key={key} size="sm">
                <CardContent className="font-medium tabular-nums">{label}</CardContent>
              </Card>
            ))}
          </div>
        </section>
      )}

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
