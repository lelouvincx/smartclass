import React, { useEffect, useState } from 'react'
import { ClipboardList, RefreshCw } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { listExercises } from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card } from '@/components/ui/card'
import { EmptyState } from '@/design-system/empty-state'
import { PageHeader } from '@/design-system/page-header'
import { cn } from '@/lib/utils'

export default function StudentExercisesPage() {
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
        description="Browse and start exercises"
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
            title="No exercises yet"
            description="Check back soon! New exercises will appear here when they are ready."
          />
        )}

        {!isLoading && !error && items.length > 0 && (
          <div className="overflow-x-auto">
            <table className="min-w-full border-collapse text-sm">
              <thead className="bg-muted text-left text-muted-foreground">
                <tr>
                  <th className="px-4 py-3">Title</th>
                  <th className="px-4 py-3">Duration</th>
                  <th className="px-4 py-3">Questions</th>
                  <th className="px-4 py-3">Actions</th>
                </tr>
              </thead>
              <tbody>
                {items.map((item) => (
                  <tr key={item.id} className="border-t">
                    <td className="px-4 py-3 font-medium">{item.title}</td>
                    <td className="px-4 py-3">
                      {item.is_timed ? (
                        <span>
                          <Badge variant="default" className="mr-2">Timed</Badge>
                          {item.duration_minutes} min
                        </span>
                      ) : (
                        <Badge variant="secondary">Untimed</Badge>
                      )}
                    </td>
                    <td className="px-4 py-3">{item.question_count}</td>
                    <td className="px-4 py-3">
                      <Button
                        variant="link"
                        size="sm"
                        onClick={() => navigate(`/student/exercises/${item.id}`)}
                      >
                        Start
                      </Button>
                    </td>
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
