import React, { useEffect, useState } from 'react'
import { RefreshCw } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { listExercises } from '../lib/api'
import { useAuth } from '../lib/auth-context'

export default function StudentExercisesPage() {
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
        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-xs">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h1 className="text-2xl font-semibold text-slate-900">Exercises</h1>
              <p className="text-sm text-slate-600">Browse and start exercises</p>
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={loadExercises}
                aria-label="Refresh exercises"
                className="inline-flex h-10 w-10 items-center justify-center rounded-md border border-slate-300 text-slate-700"
              >
                <RefreshCw className="h-4 w-4" />
              </button>
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

        <div className="rounded-xl border border-slate-200 bg-white shadow-xs">
          {isLoading && (
            <p className="p-5 text-sm text-slate-600">Loading exercises...</p>
          )}

          {!isLoading && error && (
            <p className="p-5 text-sm text-red-600">{error}</p>
          )}

          {!isLoading && !error && items.length === 0 && (
            <div className="p-8 text-center">
              <p className="text-sm text-slate-600">No exercises yet. Check back soon!</p>
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
                    <th className="px-4 py-3">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((item) => (
                    <tr key={item.id} className="border-t border-slate-200">
                      <td className="px-4 py-3 font-medium text-slate-900">{item.title}</td>
                      <td className="px-4 py-3 text-slate-700">
                        {item.is_timed ? (
                          <span>
                            <span className="inline-block rounded-sm bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-800">
                              Timed
                            </span>
                            <span className="ml-2">{item.duration_minutes} min</span>
                          </span>
                        ) : (
                          <span className="inline-block rounded-sm bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-700">
                            Untimed
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-slate-700">{item.question_count}</td>
                      <td className="px-4 py-3">
                        <button
                          type="button"
                          onClick={() => navigate(`/student/exercises/${item.id}`)}
                          className="text-sm text-slate-900 underline"
                        >
                          Start
                        </button>
                      </td>
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
