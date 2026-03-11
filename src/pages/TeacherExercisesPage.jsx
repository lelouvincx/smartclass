import React, { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { listExercises } from '../lib/api'
import { useAuth } from '../lib/auth-context'

export default function TeacherExercisesPage() {
  const navigate = useNavigate()
  const { logout } = useAuth()

  const [items, setItems] = useState([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState('')

  async function loadExercises() {
    setIsLoading(true)
    setError('')

    try {
      const response = await listExercises()
      setItems(response.data || [])
    } catch (loadError) {
      setError(loadError.message)
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    loadExercises()
  }, [])

  return (
    <div className="min-h-screen bg-slate-50 p-6">
      <div className="mx-auto max-w-5xl space-y-6">
        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h1 className="text-2xl font-semibold text-slate-900">Exercises</h1>
              <p className="text-sm text-slate-600">Manage exercise metadata and monitor schema/file completeness.</p>
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={loadExercises}
                className="h-10 rounded-md border border-slate-300 px-4 text-sm font-medium text-slate-700"
              >
                Refresh
              </button>
              <Link
                to="/teacher/exercises/new"
                className="inline-flex h-10 items-center rounded-md bg-slate-900 px-4 text-sm font-medium text-white"
              >
                Create Exercise
              </Link>
              <button
                type="button"
                onClick={() => {
                  logout()
                  navigate('/', { replace: true })
                }}
                className="h-10 rounded-md border border-slate-300 px-4 text-sm font-medium text-slate-700"
              >
                Logout
              </button>
            </div>
          </div>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white shadow-sm">
          {isLoading && (
            <p className="p-5 text-sm text-slate-600">Loading exercises...</p>
          )}

          {!isLoading && error && (
            <p className="p-5 text-sm text-red-600">{error}</p>
          )}

          {!isLoading && !error && items.length === 0 && (
            <div className="p-8 text-center">
              <p className="text-sm text-slate-600">No exercises yet.</p>
              <Link
                to="/teacher/exercises/new"
                className="mt-4 inline-flex h-10 items-center rounded-md bg-slate-900 px-4 text-sm font-medium text-white"
              >
                Create your first exercise
              </Link>
            </div>
          )}

          {!isLoading && !error && items.length > 0 && (
            <div className="overflow-x-auto">
              <table className="min-w-full border-collapse text-sm">
                <thead className="bg-slate-50 text-left text-slate-600">
                  <tr>
                    <th className="px-4 py-3">Title</th>
                    <th className="px-4 py-3">Duration</th>
                    <th className="px-4 py-3">Questions</th>
                    <th className="px-4 py-3">Files</th>
                    <th className="px-4 py-3">Updated</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((item) => (
                    <tr key={item.id} className="border-t border-slate-200">
                      <td className="px-4 py-3 font-medium text-slate-900">{item.title}</td>
                      <td className="px-4 py-3 text-slate-700">{item.duration_minutes} min</td>
                      <td className="px-4 py-3 text-slate-700">{item.question_count}</td>
                      <td className="px-4 py-3 text-slate-700">{item.file_count}</td>
                      <td className="px-4 py-3 text-slate-600">{item.updated_at}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
