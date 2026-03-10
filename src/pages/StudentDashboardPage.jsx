import React from 'react'
import { useNavigate } from 'react-router-dom'
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
      <div className="max-w-3xl mx-auto bg-white border border-slate-200 rounded-xl shadow p-6">
        <h1 className="text-2xl font-semibold text-slate-900">Student Dashboard</h1>
        <p className="text-sm text-slate-600 mt-1">Task 4 complete: route and auth shell is active.</p>
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
    </div>
  )
}
