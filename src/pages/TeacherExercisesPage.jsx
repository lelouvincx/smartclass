import React, { useEffect, useState } from 'react'
import { RefreshCw, Plus } from 'lucide-react'
import { Link, useNavigate } from 'react-router-dom'
import { listExercises } from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { cn } from '@/lib/utils'

export default function TeacherExercisesPage() {
  const navigate = useNavigate()

  const [items, setItems] = useState([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState('')
  const [lastRefreshed, setLastRefreshed] = useState(null)

  async function loadExercises() {
    setIsLoading(true)
    setError('')

    try {
      const response = await listExercises()
      setItems(response.data || [])
      setLastRefreshed(new Date())
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
    <div className="space-y-6">
      <Card className="p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold">Exercises</h1>
            <p className="text-sm text-muted-foreground">Manage exercise metadata and monitor schema/file completeness.</p>
          </div>
          <div className="flex items-center gap-2">
            {lastRefreshed && !isLoading && (
              <span className="text-xs text-muted-foreground" aria-label="Last refreshed time">
                Updated {lastRefreshed.toLocaleTimeString()}
              </span>
            )}
            <Button
              variant="outline"
              size="icon"
              onClick={loadExercises}
              disabled={isLoading}
              aria-label="Refresh exercises"
            >
              <RefreshCw className={cn('h-4 w-4', isLoading && 'animate-spin')} />
            </Button>
            <Button asChild>
              <Link to="/teacher/exercises/new">
                <Plus className="h-4 w-4" />
                Create Exercise
              </Link>
            </Button>
          </div>
        </div>
      </Card>

      <Card>
        {isLoading && (
          <p className="p-5 text-sm text-muted-foreground">Loading exercises...</p>
        )}

        {!isLoading && error && (
          <p className="p-5 text-sm text-destructive">{error}</p>
        )}

        {!isLoading && !error && items.length === 0 && (
          <div className="p-8 text-center">
            <p className="text-sm text-muted-foreground">No exercises yet.</p>
            <Button asChild className="mt-4">
              <Link to="/teacher/exercises/new">Create your first exercise</Link>
            </Button>
          </div>
        )}

        {!isLoading && !error && items.length > 0 && (
          <div className="overflow-x-auto">
            <table className="min-w-full border-collapse text-sm">
              <thead className="bg-muted text-left text-muted-foreground">
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
                  <tr
                    key={item.id}
                    className="cursor-pointer border-t hover:bg-muted/50"
                    onClick={() => navigate(`/teacher/exercises/${item.id}`)}
                  >
                    <td className="px-4 py-3 font-medium">{item.title}</td>
                    <td className="px-4 py-3">{item.duration_minutes} min</td>
                    <td className="px-4 py-3">{item.question_count}</td>
                    <td className="px-4 py-3">{item.file_count}</td>
                    <td className="px-4 py-3 text-muted-foreground">{item.updated_at}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  )
}
