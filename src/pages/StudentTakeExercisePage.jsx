import React from 'react'
import { Link, useParams } from 'react-router-dom'

export default function StudentTakeExercisePage() {
  const { id } = useParams()

  return (
    <div className="min-h-screen bg-slate-50 p-6">
      <div className="mx-auto max-w-5xl space-y-6">
        <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          <h1 className="text-2xl font-semibold text-slate-900">Take Exercise</h1>
          <p className="mt-2 text-sm text-slate-600">
            Exercise ID: <span className="font-medium">{id}</span>
          </p>
          <p className="mt-4 text-sm text-slate-600">
            This page is under construction. Exercise taking functionality will be implemented in the next task.
          </p>
          <Link
            to="/student/exercises"
            className="mt-6 inline-flex h-10 items-center rounded-md border border-slate-300 px-4 text-sm font-medium text-slate-700"
          >
            Back to Exercises
          </Link>
        </div>
      </div>
    </div>
  )
}
