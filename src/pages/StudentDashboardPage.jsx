import React from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../lib/auth-context'

export default function StudentDashboardPage() {
  const navigate = useNavigate()
  const { user, logout } = useAuth()

  function handleLogout() {
    logout()
    navigate('/', { replace: true })
  }

  return (
    <div className="min-h-screen bg-slate-50 p-6">
      <div className="max-w-3xl mx-auto space-y-6">
        <div className="bg-white border border-slate-200 rounded-xl shadow p-6">
          <h1 className="text-2xl font-semibold text-slate-900">Student Dashboard</h1>
          <p className="text-sm text-slate-600 mt-1">Welcome to SmartClass</p>
          <p className="text-sm text-slate-700 mt-4">
            Logged in as: <span className="font-medium">{user?.phone}</span>
          </p>
          <button
            type="button"
            onClick={handleLogout}
            className="mt-6 h-10 px-4 rounded-md bg-slate-900 text-white"
          >
            Logout
          </button>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl shadow p-6">
          <h2 className="text-lg font-semibold text-slate-900">Quick Actions</h2>
          <div className="mt-4 space-y-2">
            <Link
              to="/student/exercises"
              className="block rounded-lg border border-slate-200 p-4 transition-colors hover:bg-slate-50"
            >
              <h3 className="font-medium text-slate-900">Browse Exercises</h3>
              <p className="mt-1 text-sm text-slate-600">View and start available exercises</p>
            </Link>
          </div>
        </div>
      </div>
    </div>
  )
}
