import React, { useEffect, useState } from 'react'
import { ClipboardList, RefreshCw, Plus } from 'lucide-react'
import { Link, useNavigate } from 'react-router-dom'
import { listExercises } from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { EmptyState } from '@/design-system/empty-state'
import { PageHeader } from '@/design-system/page-header'
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
      <PageHeader
        title="Exercises"
        description="Manage exercise metadata and monitor schema/file completeness."
        actions={
          <>
            {lastRefreshed && !isLoading && (
              <span className="self-center text-xs text-muted-foreground" aria-label="Last refreshed time">
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
          </>
        }
      />

      <Card>
        {isLoading && (
          <p className="p-5 text-sm text-muted-foreground">Loading exercises...</p>
        )}

        {!isLoading && error && (
          <p className="p-5 text-sm text-destructive">{error}</p>
        )}

        {!isLoading && !error && items.length === 0 && (
          <EmptyState
            icon={ClipboardList}
            title="No exercises yet."
            description="Create an exercise to start building your class library."
            action={
              <Button asChild>
                <Link to="/teacher/exercises/new">Create your first exercise</Link>
              </Button>
            }
          />
        )}

        {!isLoading && !error && items.length > 0 && (
          <div data-testid="responsive-exercise-list" className="grid divide-y" aria-label="Exercises">
            {items.map((item) => (
              <button
                key={item.id}
                type="button"
                className="grid min-w-0 gap-3 px-4 py-4 text-left transition-colors hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center"
                onClick={() => navigate(`/teacher/exercises/${item.id}`)}
              >
                <span className="min-w-0">
                  <span className="min-w-0 break-words font-medium">{item.title}</span>
                  <span className="mt-1 block text-xs text-muted-foreground">
                    Updated {item.updated_at}
                  </span>
                </span>
                <span className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground sm:justify-end">
                  <span>{item.duration_minutes} min</span>
                  <span>{item.question_count} questions</span>
                  <span>{item.file_count} files</span>
                </span>
              </button>
            ))}
          </div>
        )}
      </Card>
    </div>
  )
}
