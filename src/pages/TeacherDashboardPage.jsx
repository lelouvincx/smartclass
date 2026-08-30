import React from 'react'
import { BookOpen, ClipboardList, Plus, Users } from 'lucide-react'
import { ActionCard } from '@/design-system/action-card'
import { PageHeader } from '@/design-system/page-header'

export default function TeacherDashboardPage() {
  return (
    <div className="max-w-4xl space-y-8">
      <PageHeader
        title="Teacher Dashboard"
        description="Create and manage exercises for your students."
      />

      <section aria-label="Teacher quick actions" className="grid gap-4 sm:grid-cols-2">
        <ActionCard
          to="/teacher/exercises"
          icon={ClipboardList}
          title="Manage Exercises"
          description="Review, publish, and organize class exercises"
        />
        <ActionCard
          to="/teacher/exercises/new"
          icon={Plus}
          title="Create Exercise"
          description="Prepare a new exercise for your students"
        />
        <ActionCard
          to="/teacher/students"
          icon={Users}
          title="Manage Students"
          description="View students and their learning activity"
        />
        <ActionCard
          to="/teacher/lectures"
          icon={BookOpen}
          title="Manage Lectures"
          description="Organize YouTube lessons into class sections"
        />
      </section>
    </div>
  )
}
