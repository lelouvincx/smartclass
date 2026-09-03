import React, { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { BookOpen, ClipboardList, History, Play } from 'lucide-react'
import { ActionCard } from '@/design-system/action-card'
import { PageHeader } from '@/design-system/page-header'
import { listExercises } from '@/lib/api'
import { useAuth } from '@/lib/auth-context'
import { loadStudentExerciseStates } from '@/lib/student-exercise-state'

export default function StudentDashboardPage() {
  const { t } = useTranslation()
  const { token, user } = useAuth()
  const [nextAction, setNextAction] = useState(null)

  useEffect(() => {
    let cancelled = false

    async function loadNextAction() {
      try {
        const response = await listExercises()
        const exercises = response.data || []
        const states = await loadStudentExerciseStates({ accountId: user.id, exercises, token })
        const resume = exercises.find((exercise) => states[exercise.id]?.type === 'resume')
        const start = exercises.find((exercise) => !states[exercise.id])
        const result = exercises.find((exercise) => states[exercise.id]?.type === 'result')
        const exercise = resume || start || result
        if (!exercise || cancelled) return

        const state = states[exercise.id]
        if (state?.type === 'resume') {
          setNextAction({
            title: t('student.dashboard.resume', { title: exercise.title }),
            description: t('student.dashboard.resumeDescription'),
            to: `/student/exercises/${exercise.id}/take`,
          })
        } else if (state?.type === 'result') {
          setNextAction({
            title: t('student.dashboard.review', { title: exercise.title }),
            description: t('student.dashboard.reviewDescription'),
            to: `/student/submissions/${state.submissionId}/summary`,
          })
        } else {
          setNextAction({
            title: t('student.dashboard.start', { title: exercise.title }),
            description: t('student.dashboard.startDescription'),
            to: `/student/exercises/${exercise.id}`,
          })
        }
      } catch {
        // Keep the reliable quick actions available when recommendations cannot load.
      }
    }

    loadNextAction()
    return () => { cancelled = true }
  }, [t, token, user.id])

  return (
    <div className="max-w-4xl space-y-8">
      <PageHeader title={t('student.dashboard.title')} description={t('student.dashboard.welcome')} />

      {nextAction && (
        <section aria-label={t('student.dashboard.nextAction')}>
          <ActionCard
            to={nextAction.to}
            icon={Play}
            title={nextAction.title}
            description={nextAction.description}
            emphasis
          />
        </section>
      )}

      <section aria-label={t('student.dashboard.quickActions')} className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <ActionCard
          to="/student/exercises"
          icon={ClipboardList}
          title={t('student.dashboard.browse')}
          description={t('student.dashboard.browseDescription')}
          emphasis={!nextAction}
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
