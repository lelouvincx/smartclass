import React from 'react'
import { ClipboardList, History } from 'lucide-react'
import { ActionCard } from '@/design-system/action-card'
import { PageHeader } from '@/design-system/page-header'

export default function StudentDashboardPage() {
  return (
    <div className="max-w-4xl space-y-8">
      <PageHeader title="Student Dashboard" description="Welcome to SmartClass" />

      <section aria-label="Student quick actions" className="grid gap-4 sm:grid-cols-2">
        <ActionCard
          to="/student/exercises"
          icon={ClipboardList}
          title="Browse Exercises"
          description="View and start available exercises"
          emphasis
        />
        <ActionCard
          to="/student/submissions"
          icon={History}
          title="View History"
          description="Review your past submissions and scores"
        />
      </section>
    </div>
  )
}
