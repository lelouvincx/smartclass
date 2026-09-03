import React, { useEffect, useState } from 'react'
import { ClipboardList, RefreshCw, Plus } from 'lucide-react'
import { Link } from 'react-router-dom'
import { listExercises } from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { EmptyState } from '@/design-system/empty-state'
import { PageHeader } from '@/design-system/page-header'
import { cn } from '@/lib/utils'

function formatDuration(minutes) {
  return Number(minutes) > 0 ? `${minutes} min` : 'Untimed'
}

function formatUpdatedAt(value) {
  if (!value) return '—'
  const date = new Date(value.includes('T') ? value : `${value.replace(' ', 'T')}Z`)
  return Number.isNaN(date.getTime()) ? '—' : date.toLocaleString()
}

export default function TeacherExercisesPage() {
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
        description="Manage exercises and check that answer keys and files are complete."
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
              className="size-[48px]"
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

      <Card className="py-0">
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
          <>
            <div className="hidden sm:block">
              <table className="min-w-full border-collapse text-sm">
                <caption className="sr-only">Teacher exercise library</caption>
                <thead className="bg-muted text-left text-muted-foreground">
                  <tr>
                    <th scope="col" className="px-3 py-3 lg:px-4">Title</th>
                    <th scope="col" className="px-3 py-3 lg:px-4">Duration</th>
                    <th scope="col" className="px-3 py-3 lg:px-4">Questions</th>
                    <th scope="col" className="px-3 py-3 lg:px-4">Files</th>
                    <th scope="col" className="px-3 py-3 lg:px-4">Updated</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((item) => (
                    <tr key={item.id} className="border-t hover:bg-muted/50">
                      <th scope="row" className="px-3 py-3 text-left font-medium lg:px-4">
                        <Link
                          to={`/teacher/exercises/${item.id}`}
                          aria-label={`View ${item.title}`}
                          className="text-primary underline-offset-4 hover:underline"
                        >
                          {item.title}
                        </Link>
                      </th>
                      <td className="px-3 py-3 lg:px-4">{formatDuration(item.duration_minutes)}</td>
                      <td className="px-3 py-3 lg:px-4">{item.question_count}</td>
                      <td className="px-3 py-3 lg:px-4">{item.file_count}</td>
                      <td className="whitespace-nowrap px-3 py-3 text-muted-foreground lg:px-4">{formatUpdatedAt(item.updated_at)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <ul className="divide-y sm:hidden" aria-label="Teacher exercise library compact view">
              {items.map((item) => (
                <li key={item.id} className="space-y-3 p-4">
                  <p className="font-medium">{item.title}</p>
                  <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
                    <div>
                      <dt className="text-muted-foreground">Duration</dt>
                      <dd>{formatDuration(item.duration_minutes)}</dd>
                    </div>
                    <div>
                      <dt className="text-muted-foreground">Questions</dt>
                      <dd>{item.question_count}</dd>
                    </div>
                    <div>
                      <dt className="text-muted-foreground">Files</dt>
                      <dd>{item.file_count}</dd>
                    </div>
                    <div className="col-span-2">
                      <dt className="text-muted-foreground">Updated</dt>
                      <dd className="whitespace-nowrap">{formatUpdatedAt(item.updated_at)}</dd>
                    </div>
                  </dl>
                  <Button asChild size="sm" className="min-h-[48px] w-full">
                    <Link to={`/teacher/exercises/${item.id}`} aria-label={`View ${item.title}`}>
                      View
                    </Link>
                  </Button>
                </li>
              ))}
            </ul>
          </>
        )}
      </Card>
    </div>
  )
}
