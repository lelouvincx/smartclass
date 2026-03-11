import React from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../lib/auth-context'

export default function TeacherDashboardPage() {
  const navigate = useNavigate()
  const { user, logout } = useAuth()

  function handleLogout() {
    logout()
    navigate('/', { replace: true })
  }

  return (
    <div className="min-h-screen bg-slate-50 p-6">
      <div className="max-w-3xl mx-auto bg-white border border-slate-200 rounded-xl shadow p-6">
        <h1 className="text-2xl font-semibold text-slate-900">Teacher Dashboard</h1>
        <p className="text-sm text-slate-600 mt-1">Create and manage exercises for your students.</p>
        <p className="text-sm text-slate-700 mt-4">
          Logged in as: <span className="font-medium">{user?.phone}</span>
        </p>
        <div className="mt-6 flex gap-2">
          <Link
            to="/teacher/exercises"
            className="inline-flex h-10 items-center rounded-md bg-slate-900 px-4 text-sm font-medium text-white"
          >
            Manage Exercises
          </Link>
          <Link
            to="/teacher/exercises/new"
            className="inline-flex h-10 items-center rounded-md border border-slate-300 px-4 text-sm font-medium text-slate-700"
          >
            Create Exercise
          </Link>
        </div>
        <button
          type="button"
          onClick={handleLogout}
          className="mt-4 h-10 px-4 rounded-md bg-slate-900 text-white"
        >
          Logout
        </button>
      </div>
    </div>
  )
}
